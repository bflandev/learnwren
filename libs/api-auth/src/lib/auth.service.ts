import { Inject, Injectable, Logger } from '@nestjs/common';

import { DOCUMENT_STORE, type DocumentStore } from '@learnwren/api-document-store';
import { nowIso } from '@learnwren/shared-data-models';
import type {
  ISODateString,
  MeResponse,
  UserId,
  UserRole,
} from '@learnwren/shared-data-models';

import { AccountRecoveryService } from './account-recovery.service';
import { readBootstrapAdminEmail } from './bootstrap-admin';
import { assertAcceptablePassword, PasswordPolicyService } from './password-policy.service';
import { PasswordVerificationService } from './password-verification.service';
import { SessionCookieService, type MintedSession } from './session-cookie.service';
import {
  EmailAlreadyExistsException,
  EmailNotVerifiedException,
  EmailTooLongException,
  InvalidDisplayNameException,
  InvalidEmailException,
  InternalAuthException,
} from './errors/auth.exception';
import { EmailInUseError } from './identity/identity.errors';
import {
  IDENTITY_PROVIDER,
  type IdentityProvider,
  type IdentityUser,
  type PasswordProof,
} from './identity/identity-provider.port';

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
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class AuthService {
  // Stryker disable next-line StringLiteral: Logger category name — log-only, no behavioral effect
  private readonly logger = new Logger('AuthService');

  constructor(
    private readonly passwordPolicy: PasswordPolicyService,
    @Inject(IDENTITY_PROVIDER) private readonly identity: IdentityProvider,
    @Inject(DOCUMENT_STORE) private readonly firestore: DocumentStore,
    private readonly passwordVerification: PasswordVerificationService,
    private readonly sessionCookies: SessionCookieService,
    private readonly recovery: AccountRecoveryService,
  ) {}

  async register(input: RegisterInput): Promise<RegisterResult> {
    const displayName = this.validateRegisterInput(input);
    const uid = await this.createIdentityUser(input, displayName);

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
    assertAcceptablePassword(this.passwordPolicy, input.password);
    return displayName;
  }

  /** Creates the identity-provider user, mapping EmailInUseError to the typed exception. */
  private async createIdentityUser(input: RegisterInput, displayName: string): Promise<UserId> {
    try {
      const uid = await this.identity.createUser({
        email: input.email,
        password: input.password,
        displayName,
      });
      return uid as UserId;
    } catch (err) {
      if (err instanceof EmailInUseError) {
        throw new EmailAlreadyExistsException();
      }
      this.logger.error(
        // Stryker disable next-line StringLiteral,LogicalOperator: log message + nullish fallback are log-only, no behavioral effect
        `[auth] register createUser failed code=${(err as { code?: string }).code ?? 'unknown'}`,
      );
      throw new InternalAuthException();
    }
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
      await this.identity.setRole(uid, 'STUDENT');
    } catch (err) {
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.error(`[auth] register setRole failed uid=${uid}: ${String(err)}`);
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
      const proof = await this.identity.verifyPassword(input.email, input.password);
      return await this.sessionCookies.mint(proof);
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
    const proof = await this.passwordVerification.verifyPassword(input.email, input.password);
    const identityUser = await this.requireVerifiedUser(proof);
    await this.promoteBootstrapAdmin(identityUser);

    const session = await this.sessionCookies.mint(proof);
    await this.passwordVerification.clearFailures(input.email);

    const profile = await this.loadUserProfile(identityUser.uid);
    await this.syncStaleEmailBestEffort(identityUser.uid as UserId, identityUser.email, profile.email);

    // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
    this.logger.log(`[auth] login uid=${identityUser.uid}`);
    return {
      uid: identityUser.uid as UserId,
      email: identityUser.email,
      role: profile.role,
      displayName: profile.displayName,
      emailVerified: true,
      cookie: session.cookie,
      maxAgeSeconds: session.maxAgeSeconds,
    };
  }

  /**
   * First-admin bootstrap for self-hosted installs: the verified account whose
   * email matches LEARNWREN_BOOTSTRAP_ADMIN_EMAIL becomes ADMIN on login. Only
   * ever promotes; demoting it later through the admin UI sticks until the env
   * var is changed, because the next login promotes again. Firebase mode applies
   * it too, but its session claim is frozen at mint, so the role there shows
   * from the following login.
   */
  private async promoteBootstrapAdmin(user: IdentityUser): Promise<void> {
    const target = readBootstrapAdminEmail(process.env);
    if (!target || user.email.toLowerCase() !== target) return;
    const profile = await this.loadUserProfile(user.uid);
    if (profile.role === 'ADMIN') return;
    await this.identity.setRole(user.uid, 'ADMIN');
    await this.firestore.collection('users').doc(user.uid).update({ role: 'ADMIN', updatedAt: nowIso() });
    // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
    this.logger.warn(`[auth] bootstrap admin promoted uid=${user.uid}`);
  }

  /**
   * Look up the identity by the proof's uid and require a verified email.
   * A null user (identity disappeared between password check and lookup) is
   * an internal error, not EMAIL_NOT_VERIFIED.
   */
  private async requireVerifiedUser(proof: PasswordProof): Promise<IdentityUser> {
    const user = await this.identity.getUser(proof.uid);
    if (!user) {
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.error(`[auth] login missing identity uid=${proof.uid}`);
      throw new InternalAuthException();
    }
    if (!user.emailVerified) {
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.log(`[auth] login blocked code=EMAIL_NOT_VERIFIED uid=${user.uid}`);
      throw new EmailNotVerifiedException();
    }
    return user;
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
      await this.identity.deleteUser(uid);
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
