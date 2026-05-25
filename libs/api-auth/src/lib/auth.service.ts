import { Inject, Injectable, Logger } from '@nestjs/common';
import type { auth as adminAuth } from 'firebase-admin';

import {
  FIREBASE_AUTH,
  type FirebaseAuthHandle,
  FIRESTORE,
  type FirestoreHandle,
} from '@learnwren/api-firebase';
import type {
  ISODateString,
  MeResponse,
  UserId,
  UserRole,
} from '@learnwren/shared-data-models';

import { AuthAttemptsRepository } from './auth-attempts.repository';
import { EMAIL_TRANSPORT, type EmailTransport } from './email-transport/email-transport';
import { FirebaseAuthRestClient } from './firebase-auth-rest-client';
import { PasswordPolicyService } from './password-policy.service';
import {
  AccountLockedException,
  EmailAlreadyExistsException,
  EmailNotVerifiedException,
  InvalidCredentialsException,
  InvalidDisplayNameException,
  InvalidEmailException,
  InternalAuthException,
  InvalidUnlockTokenException,
  TooManyRequestsException,
  UnlockTokenExpiredException,
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

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  uid: UserId;
  email: string;
  role: UserRole;
  displayName: string;
  emailVerified: true;
  cookie: string;
  maxAgeSeconds: number;
}

// MeResponse lives in shared-data-models so the web client imports the same
// type the server emits — keeps the `uid: UserId` branding and `role: UserRole`
// union in lockstep across the wire.
export type { MeResponse } from '@learnwren/shared-data-models';

const DISPLAY_NAME_MAX = 80;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_COOKIE_EXPIRES_IN_MS = 5 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE_MAX_AGE_SECONDS = SESSION_COOKIE_EXPIRES_IN_MS / 1000;

// Logout revokes the session cookie by bumping the user's validSince second.
// Firebase compares it against the cookie's iat at whole-second precision, so
// a revoke can need a retry past the next boundary. See logoutSideEffects.
const LOGOUT_REVOKE_MAX_ATTEMPTS = 4;
const LOGOUT_REVOKE_MARGIN_MS = 250;

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(
    private readonly passwordPolicy: PasswordPolicyService,
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle,
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
    private readonly restClient: FirebaseAuthRestClient,
    private readonly attempts: AuthAttemptsRepository,
    @Inject(EMAIL_TRANSPORT) private readonly emailTransport: EmailTransport,
  ) {}

  async register(input: RegisterInput): Promise<RegisterResult> {
    const displayName = this.validateRegisterInput(input);
    const uid = await this.createFirebaseAuthUser(input, displayName);

    await this.writeUserDocumentOrRollback(uid, input.email, displayName);
    await this.assignStudentClaimOrRollback(uid);
    const emailVerificationSent = await this.sendVerificationEmailBestEffort(input.email, uid);
    const session = await this.autoLoginOrRollback(input, uid);

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

  /** Returns the trimmed displayName, or throws the appropriate validation exception. */
  private validateRegisterInput(input: RegisterInput): string {
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
    return displayName;
  }

  /** Creates the Firebase Auth user, mapping `auth/email-already-exists` to the typed exception. */
  private async createFirebaseAuthUser(input: RegisterInput, displayName: string): Promise<UserId> {
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
    return userRecord.uid as UserId;
  }

  private async writeUserDocumentOrRollback(
    uid: UserId,
    email: string,
    displayName: string,
  ): Promise<void> {
    const now = new Date().toISOString() as ISODateString;
    try {
      await this.firestore.collection('users').doc(uid).set({
        id: uid,
        email,
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
  }

  private async assignStudentClaimOrRollback(uid: UserId): Promise<void> {
    try {
      await this.auth.setCustomUserClaims(uid, { role: 'STUDENT' });
    } catch (err) {
      this.logger.error(`[auth] register setCustomUserClaims failed uid=${uid}: ${String(err)}`);
      await this.bestEffortDeleteUser(uid);
      throw new InternalAuthException();
    }
  }

  /**
   * Best-effort: never throws, never rolls back. Returns whether the email
   * left the building so the controller can surface partial success.
   */
  private async sendVerificationEmailBestEffort(email: string, uid: UserId): Promise<boolean> {
    try {
      const verificationUrl = await this.auth.generateEmailVerificationLink(email, {
        url: this.continueUrl('/login'),
      });
      await this.emailTransport.sendVerificationEmail({ to: email, verificationUrl });
      return true;
    } catch (err) {
      this.logger.warn(`[auth] register verification email failed uid=${uid}: ${String(err)}`);
      return false;
    }
  }

  /**
   * Auto-login after register: exchange password for an ID token, then mint
   * a session cookie. On any failure, roll back the newly-created user and
   * preserve the original Error instance for the caller.
   */
  private async autoLoginOrRollback(
    input: RegisterInput,
    uid: UserId,
  ): Promise<{ cookie: string; maxAgeSeconds: number }> {
    try {
      const restResult = await this.restClient.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      return await this.mintSessionCookie(restResult.idToken);
    } catch (err) {
      this.logger.error(`[auth] register auto-login failed uid=${uid}: ${String(err)}`);
      await this.bestEffortDeleteUser(uid);
      throw err instanceof Error ? err : new InternalAuthException();
    }
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const emailHash = this.attempts.emailHash(input.email);

    await this.throwIfAccountLocked(emailHash);
    const idToken = await this.verifyPasswordOrCountFailure(input, emailHash);
    const userRecord = await this.requireVerifiedUser(idToken);

    const session = await this.mintSessionCookie(idToken);
    await this.attempts.clear(emailHash);

    const profile = await this.loadUserProfile(userRecord.uid);

    this.logger.log(`[auth] login uid=${userRecord.uid}`);
    return {
      uid: userRecord.uid as UserId,
      email: userRecord.email!,
      role: profile.role,
      displayName: profile.displayName,
      emailVerified: true,
      cookie: session.cookie,
      maxAgeSeconds: session.maxAgeSeconds,
    };
  }

  /** Reject early if a prior lockout window is still active. */
  private async throwIfAccountLocked(emailHash: string): Promise<void> {
    const existing = await this.attempts.read(emailHash);
    if (existing?.lockedUntil) {
      throw new AccountLockedException(new Date(existing.lockedUntil));
    }
  }

  /**
   * Exchange password for an ID token. On bad credentials, record the failure
   * and — if it tripped the lockout threshold — dispatch the unlock email
   * before throwing AccountLockedException. Non-credential errors are
   * rethrown unchanged.
   */
  private async verifyPasswordOrCountFailure(
    input: LoginInput,
    emailHash: string,
  ): Promise<string> {
    try {
      const result = await this.restClient.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      return result.idToken;
    } catch (err) {
      if (!(err instanceof InvalidCredentialsException)) throw err;

      const failure = await this.attempts.recordFailure(emailHash);
      if (failure.locked) {
        this.logger.log(
          `[auth] lockout fired emailHash=${emailHash} unlockToken=${failure.unlockToken!.slice(0, 6)}…`,
        );
        await this.dispatchUnlockEmail(input.email, failure.unlockToken!, failure.lockedUntil!);
        throw new AccountLockedException(failure.lockedUntil!);
      }
      this.logger.log(`[auth] login failed code=INVALID_CREDENTIALS emailHash=${emailHash}`);
      throw err;
    }
  }

  /**
   * Verify the ID token and read fresh emailVerified from the Admin SDK
   * (the REST response doesn't always include it consistently). Throws
   * EmailNotVerifiedException if the user hasn't confirmed their email.
   */
  private async requireVerifiedUser(idToken: string): Promise<adminAuth.UserRecord> {
    const decoded = await this.auth.verifyIdToken(idToken, true);
    const userRecord = await this.auth.getUser(decoded.uid);
    if (!userRecord.emailVerified) {
      this.logger.log(`[auth] login blocked code=EMAIL_NOT_VERIFIED uid=${userRecord.uid}`);
      throw new EmailNotVerifiedException();
    }
    return userRecord;
  }

  private async loadUserProfile(uid: string): Promise<{ displayName: string; role: UserRole }> {
    const userDoc = await this.firestore.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      this.logger.error(`[auth] login missing users/${uid}`);
      throw new InternalAuthException();
    }
    return userDoc.data() as { displayName: string; role: UserRole };
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

    let uid: string;
    try {
      const decoded = await this.auth.verifySessionCookie(sessionCookie, true);
      uid = decoded['uid'];
    } catch (err) {
      // Cookie already invalid or expired — nothing to revoke.
      this.logger.log(`[auth] logout silent (cookie invalid): ${String(err)}`);
      return;
    }

    // Firebase revocation has whole-second granularity: a session cookie is
    // rejected only once the user's tokensValidAfterTime is strictly greater
    // than the cookie's iat, both compared as integer seconds. revoke-
    // RefreshTokens stamps tokensValidAfterTime at the current second, so a
    // revoke landing in the same wall-second the cookie was minted is a
    // silent no-op. Rather than racing the boundary with a precisely-timed
    // sleep, revoke and then confirm the cookie is actually rejected; if it
    // survived, wait safely past the next second boundary and revoke again.
    for (let attempt = 0; attempt < LOGOUT_REVOKE_MAX_ATTEMPTS; attempt++) {
      await this.auth.revokeRefreshTokens(uid);
      if (await this.isSessionCookieRevoked(sessionCookie)) {
        this.logger.log(`[auth] logout uid=${uid}`);
        return;
      }
      await this.sleepPastNextSecond();
    }
    this.logger.error(`[auth] logout could not confirm cookie revocation uid=${uid}`);
  }

  /** True once a checkRevoked verify rejects the cookie. */
  private async isSessionCookieRevoked(sessionCookie: string): Promise<boolean> {
    try {
      await this.auth.verifySessionCookie(sessionCookie, true);
      return false;
    } catch {
      return true;
    }
  }

  /** Resolve a short, safe margin past the next whole-second boundary. */
  private sleepPastNextSecond(): Promise<void> {
    const waitMs = 1000 - (Date.now() % 1000) + LOGOUT_REVOKE_MARGIN_MS;
    return new Promise<void>((resolve) => setTimeout(resolve, waitMs));
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

  async resendVerification(email: string): Promise<void> {
    const emailHash = this.attempts.emailHash(email);

    const throttle = await this.attempts.recordResendVerification(emailHash);
    if (throttle.throttled) throw new TooManyRequestsException();

    const userRecord = await this.findUserOrNullForEnumerationResistance(email);
    if (!userRecord) return;
    if (userRecord.emailVerified) {
      // Already verified — silent success (don't leak verification status).
      return;
    }

    await this.dispatchOutboundEmail('resend-verification', emailHash, async () => {
      const verificationUrl = await this.auth.generateEmailVerificationLink(email, {
        url: this.continueUrl('/login'),
      });
      await this.emailTransport.sendVerificationEmail({ to: email, verificationUrl });
    });
  }

  async requestPasswordReset(email: string): Promise<void> {
    const emailHash = this.attempts.emailHash(email);

    const throttle = await this.attempts.recordPasswordResetRequest(emailHash);
    if (throttle.throttled) throw new TooManyRequestsException();

    const userRecord = await this.findUserOrNullForEnumerationResistance(email);
    if (!userRecord) return;

    await this.dispatchOutboundEmail('password-reset', emailHash, async () => {
      const resetUrl = await this.auth.generatePasswordResetLink(email, {
        url: this.continueUrl('/login?reset=ok'),
      });
      await this.emailTransport.sendPasswordResetEmail({ to: email, resetUrl });
    });
    // Note: deliberate no-op on lockout state. See spec §1.5 / §E.2(ii).
  }

  /**
   * getUserByEmail with the standard enumeration-resistant adapter: a missing
   * user becomes `null` so the caller can early-return silent success without
   * having to spell out the `auth/user-not-found` branch each time. Any other
   * Firebase error is rethrown untouched.
   */
  private async findUserOrNullForEnumerationResistance(
    email: string,
  ): Promise<adminAuth.UserRecord | null> {
    try {
      return await this.auth.getUserByEmail(email);
    } catch (err) {
      if (this.isFirebaseError(err) && err.code === 'auth/user-not-found') return null;
      throw err;
    }
  }

  /**
   * Run an outbound-email send (`fn` should both generate the link and call
   * the transport), logging success at info and mapping any failure to
   * InternalAuthException after logging the underlying error. The `tag`
   * appears in both log lines so operators can trace by flow type.
   */
  private async dispatchOutboundEmail(
    tag: 'resend-verification' | 'password-reset',
    emailHash: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    try {
      await fn();
      this.logger.log(`[auth] ${tag} sent emailHash=${emailHash}`);
    } catch (err) {
      this.logger.error(`[auth] ${tag} send failed emailHash=${emailHash}: ${String(err)}`);
      throw new InternalAuthException();
    }
  }

  async unlock(token: string): Promise<void> {
    const result = await this.attempts.redeemUnlockToken(token);
    if (result.status === 'ok') {
      this.logger.log('[auth] unlock redeemed');
      return;
    }
    if (result.status === 'expired') {
      throw new UnlockTokenExpiredException();
    }
    throw new InvalidUnlockTokenException();
  }

  private async dispatchUnlockEmail(
    email: string,
    unlockToken: string,
    unlockAvailableAt: Date,
  ): Promise<void> {
    // Resolve the canonical email address from Firebase to avoid sending to
    // a typo'd address that happened to match the brute-force attempt.
    let to: string;
    try {
      const userRecord = await this.auth.getUserByEmail(email);
      to = userRecord.email!;
    } catch {
      // The lock fired against a non-existent account (typo or malicious
      // probing). Don't send an email anywhere; lock is in place regardless.
      return;
    }

    try {
      await this.emailTransport.sendUnlockEmail({
        to,
        unlockUrl: `${this.continueUrl('/auth/unlock')}?token=${unlockToken}`,
        unlockAvailableAt,
      });
    } catch (err) {
      // Email is best-effort — the lock is enforced regardless. Surface the
      // failure in logs so operators can investigate transport health.
      this.logger.error(`[auth] unlock-email send failed: ${String(err)}`);
    }
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
