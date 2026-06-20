import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  AuthException,
  EMAIL_TRANSPORT,
  FirebaseAuthRestClient,
  PasswordPolicyService,
  type EmailTransport,
} from '@learnwren/api-auth';
import { FIREBASE_AUTH, type FirebaseAuthHandle } from '@learnwren/api-firebase';
import type { ChangePasswordRequest, UserId } from '@learnwren/shared-data-models';

import {
  CurrentPasswordInvalidException,
  NewPasswordWeakException,
  PasswordChangeFailedException,
  PasswordUnchangedException,
} from './errors/password-change.exception';

@Injectable()
export class PasswordChangeService {
  // Stryker disable next-line StringLiteral: Logger label is log-only; no behaviour depends on it.
  private readonly logger = new Logger('PasswordChangeService');

  constructor(
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle,
    private readonly restClient: FirebaseAuthRestClient,
    private readonly passwordPolicy: PasswordPolicyService,
    @Inject(EMAIL_TRANSPORT) private readonly emailTransport: EmailTransport,
  ) {}

  async changePassword(
    uid: UserId,
    currentEmail: string,
    input: ChangePasswordRequest,
  ): Promise<void> {
    await this.verifyCurrentPassword(currentEmail, input.currentPassword);

    const policy = this.passwordPolicy.validate(input.newPassword);
    if (!policy.valid) {
      throw new NewPasswordWeakException(policy.unmet);
    }
    if (input.newPassword === input.currentPassword) {
      throw new PasswordUnchangedException();
    }

    try {
      await this.auth.updateUser(uid, { password: input.newPassword });
    } catch (err) {
      // Stryker disable next-line StringLiteral: log-only diagnostic message; the throw below is the behaviour under test.
      this.logger.error(`[profile] password updateUser failed uid=${uid}: ${String(err)}`);
      throw new PasswordChangeFailedException(err instanceof Error ? { cause: err } : undefined);
    }

    // Best-effort: the password is already changed, so a notification failure
    // must not fail the request (that would mislead the user into retrying).
    try {
      await this.emailTransport.sendPasswordChangedEmail({ to: currentEmail });
    } catch (err) {
      this.logger.error(`[profile] password-changed notice failed uid=${uid}: ${String(err)}`);
    }

    await this.auth.revokeRefreshTokens(uid);
    // Stryker disable next-line StringLiteral: success log message is log-only; no behaviour depends on its text.
    this.logger.log(`[profile] password changed uid=${uid}`);
  }

  private async verifyCurrentPassword(email: string, password: string): Promise<void> {
    try {
      await this.restClient.signInWithPassword({ email, password });
    } catch (err) {
      if (err instanceof AuthException && err.code === 'INVALID_CREDENTIALS') {
        throw new CurrentPasswordInvalidException();
      }
      // Stryker disable next-line StringLiteral: log-only diagnostic message; the throw below is the behaviour under test.
      this.logger.error(`[profile] password reauth failed: ${String(err)}`);
      throw new PasswordChangeFailedException(err instanceof Error ? { cause: err } : undefined);
    }
  }
}
