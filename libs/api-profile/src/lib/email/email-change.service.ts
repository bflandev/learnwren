import { Inject, Injectable, Logger } from '@nestjs/common';
import type { auth as adminAuth } from 'firebase-admin';

import {
  AuthException,
  EMAIL_TRANSPORT,
  PasswordVerificationService,
  type EmailTransport,
} from '@learnwren/api-auth';
import {
  FIREBASE_AUTH,
  type FirebaseAuthHandle,
  FIRESTORE,
  type FirestoreHandle,
} from '@learnwren/api-firebase';
import { nowIso } from '@learnwren/shared-data-models';
import type { ConfirmEmailChangeResponse, UserId } from '@learnwren/shared-data-models';

import {
  CurrentPasswordInvalidException,
  EmailAlreadyInUseException,
  EmailChangeFailedException,
  EmailInvalidException,
  EmailUnchangedException,
} from './errors/email-change.exception';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class EmailChangeService {
  // Stryker disable next-line StringLiteral: Logger label is log-only; no behaviour depends on it.
  private readonly logger = new Logger('EmailChangeService');

  constructor(
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle,
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
    private readonly passwordVerification: PasswordVerificationService,
    @Inject(EMAIL_TRANSPORT) private readonly emailTransport: EmailTransport,
  ) {}

  async requestChange(
    uid: UserId,
    currentEmail: string,
    input: { newEmail: string; currentPassword: string },
  ): Promise<void> {
    const newEmail = input.newEmail.trim().toLowerCase();
    // Stryker disable next-line ConditionalExpression: the `length === 0` check is a redundant fast-path — EMAIL_REGEX requires >=1 char before '@', so `!EMAIL_REGEX.test('')` is already true; dropping the left operand is provably equivalent.
    if (newEmail.length === 0 || !EMAIL_REGEX.test(newEmail)) {
      throw new EmailInvalidException();
    }
    if (newEmail === currentEmail.trim().toLowerCase()) {
      throw new EmailUnchangedException();
    }

    await this.verifyCurrentPassword(currentEmail, input.currentPassword);

    const link = await this.generateLink(uid, currentEmail, newEmail);

    try {
      await this.emailTransport.sendEmailChangeVerificationEmail({
        to: newEmail,
        verificationUrl: link,
      });
    } catch (err) {
      // Stryker disable next-line StringLiteral: log-only diagnostic message; the throw below is the behaviour under test.
      this.logger.error(`[profile] email-change send failed uid=${uid}: ${String(err)}`);
      throw new EmailChangeFailedException(err instanceof Error ? { cause: err } : undefined);
    }
    // Stryker disable next-line StringLiteral: success log message is log-only; no behaviour depends on its text.
    this.logger.log(`[profile] email-change requested uid=${uid}`);
  }

  async confirmChange(uid: UserId, cookieEmail: string): Promise<ConfirmEmailChangeResponse> {
    const user = await this.getUserOrThrow(uid);
    const swapped =
      !!user.email &&
      user.email.toLowerCase() !== cookieEmail.trim().toLowerCase() &&
      user.emailVerified === true;

    if (!swapped) {
      return { changed: false };
    }

    try {
      await this.firestore.collection('users').doc(uid).update({
        email: user.email,
        updatedAt: nowIso(),
      });
    } catch (err) {
      // Stryker disable next-line StringLiteral: log-only diagnostic message; the throw below is the behaviour under test.
      this.logger.error(`[profile] email-change firestore sync failed uid=${uid}: ${String(err)}`);
      throw new EmailChangeFailedException(err instanceof Error ? { cause: err } : undefined);
    }

    // Best-effort: the email change is already applied everywhere that matters
    // (Auth + Firestore), so a revocation failure must not fail the request.
    // The stale sessions carry the old email claim until they age out.
    try {
      await this.auth.revokeRefreshTokens(uid);
    } catch (err) {
      this.logger.error(`[profile] email-change revoke failed uid=${uid}: ${String(err)}`);
    }

    // Stryker disable next-line StringLiteral: success log message is log-only; no behaviour depends on its text.
    this.logger.log(`[profile] email-change confirmed uid=${uid}`);
    return { changed: true, email: user.email };
  }

  /** getUser can throw raw Firebase errors; wrap them so the feature filter renders the envelope. */
  private async getUserOrThrow(uid: UserId): Promise<adminAuth.UserRecord> {
    try {
      return await this.auth.getUser(uid);
    } catch (err) {
      // Stryker disable next-line StringLiteral: log-only diagnostic message; the throw below is the behaviour under test.
      this.logger.error(`[profile] email-change getUser failed uid=${uid}: ${String(err)}`);
      throw new EmailChangeFailedException(err instanceof Error ? { cause: err } : undefined);
    }
  }

  /**
   * Re-auth via the shared lockout-honoring seam: failed guesses count toward
   * the login lockout, and a locked account rejects with ACCOUNT_LOCKED here
   * too (rethrown unchanged — the feature filter catches AuthException).
   */
  private async verifyCurrentPassword(email: string, password: string): Promise<void> {
    try {
      await this.passwordVerification.verifyPassword(email, password);
    } catch (err) {
      if (err instanceof AuthException && err.code === 'ACCOUNT_LOCKED') {
        throw err;
      }
      if (err instanceof AuthException && err.code === 'INVALID_CREDENTIALS') {
        throw new CurrentPasswordInvalidException();
      }
      // Stryker disable next-line StringLiteral: log-only diagnostic message; the throw below is the behaviour under test.
      this.logger.error(`[profile] email-change reauth failed: ${String(err)}`);
      throw new EmailChangeFailedException(err instanceof Error ? { cause: err } : undefined);
    }
    await this.passwordVerification.clearFailures(email);
  }

  private async generateLink(uid: UserId, currentEmail: string, newEmail: string): Promise<string> {
    try {
      return await this.auth.generateVerifyAndChangeEmailLink(currentEmail, newEmail, {
        url: this.continueUrl('/settings/profile/email-changed'),
      });
    } catch (err) {
      if (this.isFirebaseError(err) && err.code === 'auth/email-already-exists') {
        throw new EmailAlreadyInUseException();
      }
      // Stryker disable next-line StringLiteral: log-only diagnostic message; the throw below is the behaviour under test.
      this.logger.error(`[profile] email-change link gen failed uid=${uid}: ${String(err)}`);
      throw new EmailChangeFailedException(err instanceof Error ? { cause: err } : undefined);
    }
  }

  private continueUrl(path: string): string {
    const base = process.env['LEARNWREN_PUBLIC_URL'] ?? 'http://localhost:4200';
    return `${base}${path}`;
  }

  private isFirebaseError(err: unknown): err is { code: string } {
    return typeof err === 'object' && err !== null && 'code' in err;
  }
}
