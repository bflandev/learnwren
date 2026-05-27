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

import { AccountRecoveryService } from './account-recovery.service';
import { AuthAttemptsRepository } from './auth-attempts.repository';
import { FirebaseAuthRestClient } from './firebase-auth-rest-client';
import { PasswordPolicyService } from './password-policy.service';
import { SessionCookieService, type MintedSession } from './session-cookie.service';
import {
  AccountLockedException,
  EmailAlreadyExistsException,
  EmailNotVerifiedException,
  InvalidCredentialsException,
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

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(
    private readonly passwordPolicy: PasswordPolicyService,
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle,
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
    private readonly restClient: FirebaseAuthRestClient,
    private readonly attempts: AuthAttemptsRepository,
    private readonly sessionCookies: SessionCookieService,
    private readonly recovery: AccountRecoveryService,
  ) {}

  async register(input: RegisterInput): Promise<RegisterResult> {
    const displayName = this.validateRegisterInput(input);
    const uid = await this.createFirebaseAuthUser(input, displayName);

    await this.writeUserDocumentOrRollback(uid, input.email, displayName);
    await this.assignStudentClaimOrRollback(uid);
    const emailVerificationSent = await this.recovery.sendInitialVerificationEmail(
      input.email,
      uid,
    );
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
        biography: '',
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
   * Auto-login after register: exchange password for an ID token, then mint
   * a session cookie. On any failure, roll back the newly-created user and
   * preserve the original Error instance for the caller.
   */
  private async autoLoginOrRollback(input: RegisterInput, uid: UserId): Promise<MintedSession> {
    try {
      const restResult = await this.restClient.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      return await this.sessionCookies.mint(restResult.idToken);
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

    const session = await this.sessionCookies.mint(idToken);
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
        await this.recovery.sendUnlockEmail(
          input.email,
          failure.unlockToken!,
          failure.lockedUntil!,
        );
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
