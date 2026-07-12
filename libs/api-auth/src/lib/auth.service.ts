import { Inject, Injectable, Logger } from '@nestjs/common';
import type { auth as adminAuth } from 'firebase-admin';

import {
  FIREBASE_AUTH,
  type FirebaseAuthHandle,
  FIRESTORE,
  type FirestoreHandle,
} from '@learnwren/api-firebase';
import { nowIso } from '@learnwren/shared-data-models';
import type {
  ISODateString,
  MeResponse,
  UserId,
  UserRole,
} from '@learnwren/shared-data-models';

import { AccountRecoveryService } from './account-recovery.service';
import { isFirebaseError } from './firebase-error.util';
import { FirebaseAuthRestClient } from './firebase-auth-rest-client';
import { PasswordPolicyService } from './password-policy.service';
import { PasswordVerificationService } from './password-verification.service';
import { SessionCookieService, type MintedSession } from './session-cookie.service';
import {
  EmailAlreadyExistsException,
  EmailNotVerifiedException,
  EmailTooLongException,
  InvalidDisplayNameException,
  InvalidEmailException,
  InternalAuthException,
  PasswordTooLongException,
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
const EMAIL_MAX = 254;
const PASSWORD_MAX = 256;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class AuthService {
  // Stryker disable next-line StringLiteral: Logger category name — log-only, no behavioral effect
  private readonly logger = new Logger('AuthService');

  constructor(
    private readonly passwordPolicy: PasswordPolicyService,
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle,
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
    private readonly restClient: FirebaseAuthRestClient,
    private readonly passwordVerification: PasswordVerificationService,
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

    // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
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
    if (input.email.length > EMAIL_MAX) {
      throw new EmailTooLongException();
    }
    if (!EMAIL_REGEX.test(input.email)) {
      throw new InvalidEmailException();
    }
    if (input.password.length > PASSWORD_MAX) {
      throw new PasswordTooLongException();
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
      if (isFirebaseError(err) && err.code === 'auth/email-already-exists') {
        throw new EmailAlreadyExistsException();
      }
      this.logger.error(
        // Stryker disable next-line StringLiteral,LogicalOperator: log message + nullish fallback are log-only, no behavioral effect
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
    const now = nowIso();
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
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.error(`[auth] register firestore.set failed uid=${uid}: ${String(err)}`);
      await this.bestEffortDeleteUser(uid);
      throw new InternalAuthException();
    }
  }

  private async assignStudentClaimOrRollback(uid: UserId): Promise<void> {
    try {
      await this.auth.setCustomUserClaims(uid, { role: 'STUDENT' });
    } catch (err) {
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
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
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.error(`[auth] register auto-login failed uid=${uid}: ${String(err)}`);
      await this.bestEffortDeleteUser(uid);
      throw err instanceof Error ? err : new InternalAuthException();
    }
  }

  async login(input: LoginInput): Promise<LoginResult> {
    // Lockout pre-check, password exchange, and failure counting all live in
    // the shared PasswordVerificationService so the profile re-auth flows
    // count toward the same lockout.
    const idToken = await this.passwordVerification.verifyPassword(input.email, input.password);
    const userRecord = await this.requireVerifiedUser(idToken);

    const session = await this.sessionCookies.mint(idToken);
    await this.passwordVerification.clearFailures(input.email);

    const profile = await this.loadUserProfile(userRecord.uid);
    await this.syncStaleEmailBestEffort(userRecord.uid as UserId, userRecord.email, profile.email);

    // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
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

  /**
   * Verify the ID token and read fresh emailVerified from the Admin SDK
   * (the REST response doesn't always include it consistently). Throws
   * EmailNotVerifiedException if the user hasn't confirmed their email.
   */
  private async requireVerifiedUser(idToken: string): Promise<adminAuth.UserRecord> {
    const decoded = await this.auth.verifyIdToken(idToken, true);
    const userRecord = await this.auth.getUser(decoded.uid);
    if (!userRecord.emailVerified) {
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.log(`[auth] login blocked code=EMAIL_NOT_VERIFIED uid=${userRecord.uid}`);
      throw new EmailNotVerifiedException();
    }
    return userRecord;
  }

  private async loadUserProfile(
    uid: string,
  ): Promise<{ displayName: string; role: UserRole; email?: string }> {
    const userDoc = await this.firestore.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.error(`[auth] login missing users/${uid}`);
      throw new InternalAuthException();
    }
    return userDoc.data() as { displayName: string; role: UserRole; email?: string };
  }

  /**
   * Lazily heal a stale users/{uid}.email: the verify-and-change-email link
   * applies the change in Firebase Auth on click, but the Firestore mirror
   * only syncs in the authenticated POST /profile/email/confirm — which never
   * runs when the link is opened without a session. Converge on login.
   * Best-effort: a sync failure must not fail the login.
   */
  private async syncStaleEmailBestEffort(
    uid: UserId,
    authEmail: string | undefined,
    docEmail: string | undefined,
  ): Promise<void> {
    if (!authEmail || !docEmail || authEmail === docEmail) return;
    try {
      await this.firestore.collection('users').doc(uid).update({
        email: authEmail,
        updatedAt: nowIso(),
      });
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.log(`[auth] login healed stale users/${uid}.email`);
    } catch (err) {
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.warn(`[auth] login email sync failed uid=${uid}: ${String(err)}`);
    }
  }

  async getMe(
    uid: UserId,
    fromCookie: { email: string; emailVerified: boolean },
  ): Promise<MeResponse> {
    const snap = await this.firestore.collection('users').doc(uid).get();
    if (!snap.exists) {
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.error(`[auth] getMe missing users/${uid}`);
      throw new InternalAuthException();
    }
    const data = snap.data() as {
      displayName: string;
      role: UserRole;
      photoUrl?: string;
    };
    return {
      uid,
      email: fromCookie.email,
      displayName: data.displayName,
      role: data.role,
      ...(data.photoUrl ? { photoUrl: data.photoUrl } : {}),
      emailVerified: fromCookie.emailVerified,
    };
  }

  private async bestEffortDeleteUser(uid: string): Promise<void> {
    // Stryker disable BlockStatement: the catch only logs then swallows the deleteUser error, so emptying it is indistinguishable from the original — equivalent. (Stryker associates a `} catch` block mutant with the try-open line, so it cannot be targeted by a next-line directive in isolation; this minimal region is the narrowest that reaches it. The try-body emptying is still locked by the "swallows a deleteUser failure during rollback" spec, which asserts deleteUser is invoked.)
    try {
      await this.auth.deleteUser(uid);
    } catch (err) {
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.error(`[auth] register rollback deleteUser failed uid=${uid}: ${String(err)}`);
    }
    // Stryker restore BlockStatement
    // Also remove the users/{uid} doc: rollbacks after the Firestore write
    // (claim assignment, auto-login) would otherwise orphan the document.
    // Stryker disable BlockStatement: same equivalence argument as above — the catch only logs then swallows; the try body is locked by the "rollback also deletes the orphaned users/{uid} doc" specs.
    try {
      await this.firestore.collection('users').doc(uid).delete();
    } catch (err) {
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.error(`[auth] register rollback users-doc delete failed uid=${uid}: ${String(err)}`);
    }
    // Stryker restore BlockStatement
  }
}
