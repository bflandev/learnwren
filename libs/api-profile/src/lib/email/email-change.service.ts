import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  AuthException,
  EMAIL_TRANSPORT,
  EmailInUseError,
  IDENTITY_PROVIDER,
  PasswordVerificationService,
  type EmailTransport,
  type IdentityProvider,
  type IdentityUser,
} from '@learnwren/api-auth';
import { DOCUMENT_STORE, type DocumentStore } from '@learnwren/api-document-store';
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
    @Inject(IDENTITY_PROVIDER) private readonly identity: IdentityProvider,
    @Inject(DOCUMENT_STORE) private readonly firestore: DocumentStore,
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
    // revokeAllSessions (not a bare revoke) closes the same-second
    // cookie-minting gap — see its doc comment on the port.
    try {
      await this.identity.revokeAllSessions(uid);
    } catch (err) {
      this.logger.error(`[profile] email-change revoke failed uid=${uid}: ${String(err)}`);
    }

    // Stryker disable next-line StringLiteral: success log message is log-only; no behaviour depends on its text.
    this.logger.log(`[profile] email-change confirmed uid=${uid}`);
    return { changed: true, email: user.email };
  }

  /** getUser can throw raw provider errors; wrap them so the feature filter renders the envelope. A missing user (null) takes the same branch a throw used to. */
  private async getUserOrThrow(uid: UserId): Promise<IdentityUser> {
    let user: IdentityUser | null;
    try {
      user = await this.identity.getUser(uid);
    } catch (err) {
      // Stryker disable next-line StringLiteral: log-only diagnostic message; the throw below is the behaviour under test.
      this.logger.error(`[profile] email-change getUser failed uid=${uid}: ${String(err)}`);
      throw new EmailChangeFailedException(err instanceof Error ? { cause: err } : undefined);
    }
    if (!user) {
      throw new EmailChangeFailedException();
    }
    return user;
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
      return await this.identity.createEmailActionLink(
        'change-email',
        currentEmail,
        '/settings/profile/email-changed',
        newEmail,
      );
    } catch (err) {
      if (err instanceof EmailInUseError) {
        throw new EmailAlreadyInUseException();
      }
      // Stryker disable next-line StringLiteral: log-only diagnostic message; the throw below is the behaviour under test.
      this.logger.error(`[profile] email-change link gen failed uid=${uid}: ${String(err)}`);
      throw new EmailChangeFailedException(err instanceof Error ? { cause: err } : undefined);
    }
  }
}
