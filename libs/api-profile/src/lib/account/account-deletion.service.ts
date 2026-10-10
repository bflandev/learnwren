import { Injectable } from '@nestjs/common';

import { AuthException, PasswordVerificationService } from '@learnwren/api-auth';
import type { UserId } from '@learnwren/shared-data-models';

import { CurrentPasswordInvalidException } from '../password/errors/password-change.exception';
import { AdminUserDeleteService } from '../users/admin-user-delete.service';

/**
 * Self-service account deletion. Re-authenticates with the current password,
 * then runs the same transactional claim + teardown as an admin delete, so
 * both paths share the guards (USER_HAS_COURSES, LAST_ADMIN) and the
 * crash-retryable anonymise/cascade steps.
 */
@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly passwordVerification: PasswordVerificationService,
    private readonly deleter: AdminUserDeleteService,
  ) {}

  async deleteOwnAccount(uid: UserId, email: string, currentPassword: string): Promise<void> {
    try {
      await this.passwordVerification.verifyPassword(email, currentPassword);
    } catch (err) {
      // ACCOUNT_LOCKED passes through unchanged; anything else renders as a
      // 500 INTERNAL envelope via the catch-all filter.
      if (err instanceof AuthException && err.code === 'INVALID_CREDENTIALS') {
        throw new CurrentPasswordInvalidException();
      }
      throw err;
    }
    await this.passwordVerification.clearFailures(email);
    await this.deleter.deleteAccount(uid, uid, 'data-first');
  }
}
