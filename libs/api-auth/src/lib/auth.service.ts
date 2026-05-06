import { Inject, Injectable, Logger } from '@nestjs/common';
import type { auth as adminAuth } from 'firebase-admin';

import {
  FIREBASE_AUTH,
  type FirebaseAuthHandle,
  FIRESTORE,
  type FirestoreHandle,
} from '@learnwren/api-firebase';
import type { ISODateString, UserId, UserRole } from '@learnwren/shared-data-models';

import { AuthAttemptsRepository } from './auth-attempts.repository';
import { FirebaseAuthRestClient } from './firebase-auth-rest-client';
import { PasswordPolicyService } from './password-policy.service';
import {
  EmailAlreadyExistsException,
  InvalidDisplayNameException,
  InvalidEmailException,
  InternalAuthException,
  WeakPasswordException,
} from './errors/auth.exception';

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

export interface RegisterResult {
  uid: UserId;
  email: string;
  role: UserRole;
  cookie: string;
  maxAgeSeconds: number;
  emailVerificationSent: boolean;
}

export interface MeResponse {
  uid: UserId;
  email: string;
  displayName: string;
  role: UserRole;
  emailVerified: boolean;
}

const DISPLAY_NAME_MAX = 80;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_COOKIE_EXPIRES_IN_MS = 5 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE_MAX_AGE_SECONDS = SESSION_COOKIE_EXPIRES_IN_MS / 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(
    private readonly passwordPolicy: PasswordPolicyService,
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle,
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
    private readonly restClient: FirebaseAuthRestClient,
    private readonly attempts: AuthAttemptsRepository,
  ) {}

  async register(input: RegisterInput): Promise<RegisterResult> {
    const displayName = input.displayName.trim();
    if (displayName.length === 0 || displayName.length > DISPLAY_NAME_MAX) {
      throw new InvalidDisplayNameException();
    }
    if (!EMAIL_REGEX.test(input.email)) {
      throw new InvalidEmailException();
    }

    const policy = this.passwordPolicy.validate(input.password);
    if (!policy.valid) {
      throw new WeakPasswordException(policy.unmet);
    }

    let userRecord: adminAuth.UserRecord;
    try {
      userRecord = await this.auth.createUser({
        email: input.email,
        password: input.password,
        displayName,
      });
    } catch (err) {
      if (this.isFirebaseError(err) && err.code === 'auth/email-already-exists') {
        throw new EmailAlreadyExistsException();
      }
      this.logger.error(
        `[auth] register createUser failed code=${(err as { code?: string }).code ?? 'unknown'}`,
      );
      throw new InternalAuthException();
    }

    const uid = userRecord.uid as UserId;
    const now = new Date().toISOString() as ISODateString;

    try {
      await this.firestore.collection('users').doc(uid).set({
        id: uid,
        email: input.email,
        displayName,
        role: 'STUDENT',
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      this.logger.error(`[auth] register firestore.set failed uid=${uid}: ${String(err)}`);
      await this.bestEffortDeleteUser(uid);
      throw new InternalAuthException();
    }

    try {
      await this.auth.setCustomUserClaims(uid, { role: 'STUDENT' });
    } catch (err) {
      this.logger.error(`[auth] register setCustomUserClaims failed uid=${uid}: ${String(err)}`);
      await this.bestEffortDeleteUser(uid);
      throw new InternalAuthException();
    }

    let emailVerificationSent = true;
    try {
      await this.auth.generateEmailVerificationLink(input.email, {
        url: this.continueUrl('/login'),
      });
    } catch (err) {
      this.logger.warn(
        `[auth] register generateEmailVerificationLink failed uid=${uid}: ${String(err)}`,
      );
      emailVerificationSent = false;
    }

    // Auto-login internally to mint the session cookie before returning.
    let session: { cookie: string; maxAgeSeconds: number };
    try {
      const restResult = await this.restClient.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      session = await this.mintSessionCookie(restResult.idToken);
    } catch (err) {
      this.logger.error(`[auth] register auto-login failed uid=${uid}: ${String(err)}`);
      await this.bestEffortDeleteUser(uid);
      throw err instanceof Error ? err : new InternalAuthException();
    }

    this.logger.log(`[auth] register uid=${uid}`);
    return {
      uid,
      email: input.email,
      role: 'STUDENT',
      cookie: session.cookie,
      maxAgeSeconds: session.maxAgeSeconds,
      emailVerificationSent,
    };
  }

  /**
   * Verify a fresh ID token and exchange it for a 5-day session cookie.
   * Used internally by register and login. Not exposed via the controller.
   */
  private async mintSessionCookie(
    idToken: string,
  ): Promise<{ cookie: string; maxAgeSeconds: number }> {
    try {
      await this.auth.verifyIdToken(idToken, true);
    } catch (err) {
      this.logger.error(`[auth] mintSessionCookie verifyIdToken failed: ${String(err)}`);
      throw new InternalAuthException();
    }
    let cookie: string;
    try {
      cookie = await this.auth.createSessionCookie(idToken, {
        expiresIn: SESSION_COOKIE_EXPIRES_IN_MS,
      });
    } catch (err) {
      this.logger.error(`[auth] mintSessionCookie createSessionCookie failed: ${String(err)}`);
      throw new InternalAuthException();
    }
    return { cookie, maxAgeSeconds: SESSION_COOKIE_MAX_AGE_SECONDS };
  }

  private continueUrl(path: string): string {
    const base = process.env['LEARNWREN_PUBLIC_URL'] ?? 'http://localhost:4200';
    return `${base}${path}`;
  }

  async logoutSideEffects(sessionCookie: string | undefined): Promise<void> {
    if (!sessionCookie) return;
    try {
      const decoded = await this.auth.verifySessionCookie(sessionCookie, true);
      // Firebase compares cookie.iat (seconds) < tokensValidAfterTime
      // (seconds) at second precision. If revoke fires in the same wall-second
      // the cookie was minted, the strict-less-than check still validates
      // the cookie and the spec contract (§3.5) breaks. Wait until the next
      // second so revokeRefreshTokens lands strictly after cookie.iat.
      const cookieIatSec = decoded['iat'] as number | undefined;
      if (typeof cookieIatSec === 'number') {
        const nowMs = Date.now();
        if (Math.floor(nowMs / 1000) <= cookieIatSec) {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, 1000 - (nowMs % 1000)),
          );
        }
      }
      await this.auth.revokeRefreshTokens(decoded['uid']);
      this.logger.log(`[auth] logout uid=${decoded['uid']}`);
    } catch (err) {
      this.logger.log(`[auth] logout silent (cookie invalid): ${String(err)}`);
    }
  }

  async getMe(
    uid: UserId,
    fromCookie: { email: string; emailVerified: boolean },
  ): Promise<MeResponse> {
    const snap = await this.firestore.collection('users').doc(uid).get();
    if (!snap.exists) {
      this.logger.error(`[auth] getMe missing users/${uid}`);
      throw new InternalAuthException();
    }
    const data = snap.data() as {
      displayName: string;
      role: UserRole;
    };
    return {
      uid,
      email: fromCookie.email,
      displayName: data.displayName,
      role: data.role,
      emailVerified: fromCookie.emailVerified,
    };
  }

  private isFirebaseError(err: unknown): err is { code: string } {
    return typeof err === 'object' && err !== null && 'code' in err;
  }

  private async bestEffortDeleteUser(uid: string): Promise<void> {
    try {
      await this.auth.deleteUser(uid);
    } catch (err) {
      this.logger.error(`[auth] register rollback deleteUser failed uid=${uid}: ${String(err)}`);
    }
  }
}
