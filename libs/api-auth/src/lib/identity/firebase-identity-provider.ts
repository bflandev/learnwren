import { Inject, Injectable, Logger } from '@nestjs/common';
import { FIREBASE_AUTH, type FirebaseAuthHandle } from '@learnwren/api-firebase';
import type { UserRole } from '@learnwren/shared-data-models';

import { FirebaseAuthRestClient } from '../firebase-auth-rest-client';
import { EmailActionInvalidError, EmailInUseError } from './identity.errors';
import {
  SESSION_MAX_AGE_SECONDS,
  type EmailActionKind,
  type IdentityProvider,
  type IdentityUser,
  type MintedSession,
  type PasswordProof,
  type SessionClaims,
} from './identity-provider.port';
import { publicUrl } from './public-url';

const SESSION_EXPIRES_IN_MS = SESSION_MAX_AGE_SECONDS * 1000;
// Logout revokes by bumping the user's validSince second; Firebase compares it
// against the cookie's iat at whole-second precision, so a revoke can need a
// retry past the next boundary. See endSession.
const LOGOUT_REVOKE_MAX_ATTEMPTS = 4;
// Margin past the second boundary: clock skew between this process and
// Firebase's stamping of tokensValidAfterTime.
const SECOND_BOUNDARY_MARGIN_MS = 250;

/** Firebase's proof carries the ID token: session cookies can only be minted from one. */
interface FirebasePasswordProof extends PasswordProof {
  readonly idToken: string;
}

function authCode(err: unknown): unknown {
  return (err as { code?: unknown } | undefined)?.code;
}

/** True when the api talks to the Firebase Auth emulator (dev/e2e). */
function isAuthEmulator(): boolean {
  return Boolean(process.env['FIREBASE_AUTH_EMULATOR_HOST']);
}

function sleepPastNextSecond(): Promise<void> {
  const waitMs = 1000 - (Date.now() % 1000) + SECOND_BOUNDARY_MARGIN_MS;
  return new Promise<void>((resolve) => setTimeout(resolve, waitMs));
}

const toUser = (record: { uid: string; email?: string; emailVerified: boolean }): IdentityUser => ({
  uid: record.uid,
  email: record.email ?? '',
  emailVerified: record.emailVerified,
});

/** The cloud adapter: Firebase Authentication (Admin SDK + the REST sign-in). */
@Injectable()
export class FirebaseIdentityProvider implements IdentityProvider {
  // Stryker disable next-line StringLiteral: Logger category name — log-only, no behavioral effect
  private readonly logger = new Logger('FirebaseIdentityProvider');

  constructor(
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle,
    private readonly rest: FirebaseAuthRestClient,
  ) {}

  async createUser(input: { email: string; password: string; displayName: string }): Promise<string> {
    try {
      return (await this.auth.createUser(input)).uid;
    } catch (err) {
      if (authCode(err) === 'auth/email-already-exists') throw new EmailInUseError();
      throw err;
    }
  }

  async getUser(uid: string): Promise<IdentityUser | null> {
    try {
      return toUser(await this.auth.getUser(uid));
    } catch (err) {
      if (authCode(err) === 'auth/user-not-found') return null;
      throw err;
    }
  }

  async getUserByEmail(email: string): Promise<IdentityUser | null> {
    try {
      return toUser(await this.auth.getUserByEmail(email));
    } catch (err) {
      if (authCode(err) === 'auth/user-not-found') return null;
      throw err;
    }
  }

  async updateUser(uid: string, changes: { password?: string; disabled?: boolean; emailVerified?: boolean }): Promise<void> {
    await this.auth.updateUser(uid, changes);
  }

  async deleteUser(uid: string): Promise<void> {
    try {
      await this.auth.deleteUser(uid);
    } catch (err) {
      if (authCode(err) !== 'auth/user-not-found') throw err;
    }
  }

  async setRole(uid: string, role: UserRole): Promise<void> {
    await this.auth.setCustomUserClaims(uid, { role });
  }

  async verifyPassword(email: string, password: string): Promise<PasswordProof> {
    const result = await this.rest.signInWithPassword({ email, password });
    const proof: FirebasePasswordProof = { uid: result.localId, idToken: result.idToken };
    return proof;
  }

  /** Verify the fresh ID token, then exchange it for a 5-day session cookie. */
  async createSession(proof: PasswordProof): Promise<MintedSession> {
    const { idToken } = proof as FirebasePasswordProof;
    await this.auth.verifyIdToken(idToken, true);
    const token = await this.auth.createSessionCookie(idToken, { expiresIn: SESSION_EXPIRES_IN_MS });
    return { token, maxAgeSeconds: SESSION_MAX_AGE_SECONDS };
  }

  async verifySession(token: string): Promise<SessionClaims | null> {
    try {
      const decoded = await this.auth.verifySessionCookie(token, true);
      return {
        uid: decoded.uid,
        email: decoded['email'] ?? '',
        role: decoded['role'] as UserRole | undefined,
        emailVerified: Boolean(decoded['email_verified']),
      };
    } catch (err) {
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.warn(`[auth] session rejected: ${String(err)}`);
      return null;
    }
  }

  /**
   * Firebase revocation has whole-second granularity: a session cookie is
   * rejected only once tokensValidAfterTime is strictly greater than the
   * cookie's iat. A revoke in the same wall-second the cookie was minted is a
   * silent no-op, so revoke, confirm the cookie is rejected, and if it
   * survived wait past the next second boundary and revoke again.
   */
  async endSession(token: string): Promise<void> {
    const claims = await this.verifySession(token);
    if (!claims) return;
    for (let attempt = 0; attempt < LOGOUT_REVOKE_MAX_ATTEMPTS; attempt++) {
      await this.auth.revokeRefreshTokens(claims.uid);
      if (await this.isRevoked(token)) {
        // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
        this.logger.log(`[auth] logout uid=${claims.uid}`);
        return;
      }
      await sleepPastNextSecond();
    }
    // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
    this.logger.error(`[auth] logout could not confirm cookie revocation uid=${claims.uid}`);
  }

  /**
   * Non-logging companion to verifySession, for the endSession confirm loop:
   * a rejection there is the EXPECTED outcome of a successful revoke, not an
   * anomaly, so logging it on every logout would be noise.
   */
  private async isRevoked(token: string): Promise<boolean> {
    try {
      await this.auth.verifySessionCookie(token, true);
      return false;
    } catch {
      return true;
    }
  }

  /**
   * Revoke every session of the user. There is no cookie to confirm against
   * (the targets are other devices' sessions), so revoke once more strictly
   * past the next second boundary. The emulator (dev/e2e) skips the ~1 s wait.
   */
  async revokeAllSessions(uid: string): Promise<void> {
    await this.auth.revokeRefreshTokens(uid);
    if (isAuthEmulator()) return;
    await sleepPastNextSecond();
    await this.auth.revokeRefreshTokens(uid);
  }

  /** Firebase-hosted action links; the browser returns to `continuePath` afterwards. */
  async createEmailActionLink(
    kind: EmailActionKind,
    email: string,
    continuePath: string,
    newEmail?: string,
  ): Promise<string> {
    const settings = { url: publicUrl(continuePath) };
    if (kind === 'verify-email') return this.auth.generateEmailVerificationLink(email, settings);
    if (kind === 'reset-password') return this.auth.generatePasswordResetLink(email, settings);
    // kind is narrowed to 'change-email' here — the only remaining union member.
    if (!newEmail) throw new Error('change-email requires newEmail');
    try {
      return await this.auth.generateVerifyAndChangeEmailLink(email, newEmail as string, settings);
    } catch (err) {
      if (authCode(err) === 'auth/email-already-exists') throw new EmailInUseError();
      throw err;
    }
  }

  /** Firebase handles its action links on its own hosted page; nothing reaches the api. */
  async applyEmailAction(): Promise<void> {
    throw new EmailActionInvalidError();
  }
}
