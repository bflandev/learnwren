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

  async login(input: LoginInput): Promise<LoginResult> {
    const emailHash = this.attempts.emailHash(input.email);

    // (a) Lockout check before credential verification.
    const existing = await this.attempts.read(emailHash);
    if (existing?.lockedUntil) {
      throw new AccountLockedException(new Date(existing.lockedUntil));
    }

    // (b) Server-side password verification via REST.
    let idToken: string;
    try {
      const result = await this.restClient.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      idToken = result.idToken;
    } catch (err) {
      if (err instanceof InvalidCredentialsException) {
        const failure = await this.attempts.recordFailure(emailHash);
        if (failure.locked) {
          // Caller (Task 13 controller) is responsible for sending the unlock email
          // — fire-and-forget here would couple AuthService to email plumbing.
          this.logger.log(
            `[auth] lockout fired emailHash=${emailHash} unlockToken=${failure.unlockToken?.slice(0, 6)}…`,
          );
          throw new AccountLockedException(failure.lockedUntil!);
        }
        this.logger.log(`[auth] login failed code=INVALID_CREDENTIALS emailHash=${emailHash}`);
        throw err;
      }
      throw err;
    }

    // (c) Verification gate. Read fresh emailVerified from Admin SDK
    //     since the REST response doesn't always include it consistently.
    const decoded = await this.auth.verifyIdToken(idToken, true);
    const userRecord = await this.auth.getUser(decoded.uid);
    if (!userRecord.emailVerified) {
      this.logger.log(`[auth] login blocked code=EMAIL_NOT_VERIFIED uid=${userRecord.uid}`);
      throw new EmailNotVerifiedException();
    }

    // (d) Mint cookie. (e) Clear lockout doc. (f) Look up user details.
    const session = await this.mintSessionCookie(idToken);
    await this.attempts.clear(emailHash);

    const userDoc = await this.firestore.collection('users').doc(userRecord.uid).get();
    if (!userDoc.exists) {
      this.logger.error(`[auth] login missing users/${userRecord.uid}`);
      throw new InternalAuthException();
    }
    const data = userDoc.data() as { displayName: string; role: UserRole };

    this.logger.log(`[auth] login uid=${userRecord.uid}`);
    return {
      uid: userRecord.uid as UserId,
      email: userRecord.email!,
      role: data.role,
      displayName: data.displayName,
      emailVerified: true,
      cookie: session.cookie,
      maxAgeSeconds: session.maxAgeSeconds,
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

  async resendVerification(email: string): Promise<void> {
    const emailHash = this.attempts.emailHash(email);

    const throttle = await this.attempts.recordResendVerification(emailHash);
    if (throttle.throttled) {
      throw new TooManyRequestsException();
    }

    let userRecord: adminAuth.UserRecord;
    try {
      userRecord = await this.auth.getUserByEmail(email);
    } catch (err) {
      if (this.isFirebaseError(err) && err.code === 'auth/user-not-found') {
        // Enumeration resistance: silent success.
        return;
      }
      throw err;
    }

    if (userRecord.emailVerified) {
      // Already verified — silent success (don't leak verification status).
      return;
    }

    try {
      await this.auth.generateEmailVerificationLink(email, {
        url: this.continueUrl('/login'),
      });
      this.logger.log(`[auth] resend-verification sent emailHash=${emailHash}`);
    } catch (err) {
      this.logger.error(
        `[auth] resend-verification generateLink failed emailHash=${emailHash}: ${String(err)}`,
      );
      throw new InternalAuthException();
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    const emailHash = this.attempts.emailHash(email);

    const throttle = await this.attempts.recordPasswordResetRequest(emailHash);
    if (throttle.throttled) {
      throw new TooManyRequestsException();
    }

    try {
      await this.auth.getUserByEmail(email);
    } catch (err) {
      if (this.isFirebaseError(err) && err.code === 'auth/user-not-found') {
        return;
      }
      throw err;
    }

    try {
      await this.auth.generatePasswordResetLink(email, {
        url: this.continueUrl('/login?reset=ok'),
      });
      this.logger.log(`[auth] password-reset requested emailHash=${emailHash}`);
    } catch (err) {
      this.logger.error(
        `[auth] password-reset generateLink failed emailHash=${emailHash}: ${String(err)}`,
      );
      throw new InternalAuthException();
    }
    // Note: deliberate no-op on lockout state. See spec §1.5 / §E.2(ii).
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
