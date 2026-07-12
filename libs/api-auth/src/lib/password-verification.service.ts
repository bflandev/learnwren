import { Injectable, Logger } from '@nestjs/common';

import { AccountRecoveryService } from './account-recovery.service';
import { AuthAttemptsRepository } from './auth-attempts.repository';
import { FirebaseAuthRestClient } from './firebase-auth-rest-client';
import {
  AccountLockedException,
  InvalidCredentialsException,
} from './errors/auth.exception';

/**
 * Lockout-honoring password verification, shared by login and the profile
 * re-auth flows (change password / change email). Every path that exchanges an
 * email+password with Firebase MUST go through verifyPassword() so failed
 * guesses count toward one shared lockout counter and a locked account is
 * rejected everywhere — calling FirebaseAuthRestClient.signInWithPassword
 * directly bypasses the brute-force protection.
 */
@Injectable()
export class PasswordVerificationService {
  // Stryker disable next-line StringLiteral: Logger category name — log-only, no behavioral effect
  private readonly logger = new Logger('PasswordVerificationService');

  constructor(
    private readonly restClient: FirebaseAuthRestClient,
    private readonly attempts: AuthAttemptsRepository,
    private readonly recovery: AccountRecoveryService,
  ) {}

  /**
   * Verify an email+password pair, honoring the account lockout:
   *  - rejects with AccountLockedException while a lockout window is active,
   *    without contacting Firebase;
   *  - records INVALID_CREDENTIALS failures toward the lockout, dispatching
   *    the unlock email when the threshold trips;
   *  - returns the Firebase ID token on success.
   *
   * Does NOT clear the failure counter on success — call clearFailures() once
   * the caller's flow has fully succeeded.
   */
  async verifyPassword(email: string, password: string): Promise<string> {
    const emailHash = this.attempts.emailHash(email);
    await this.throwIfAccountLocked(emailHash);

    try {
      const result = await this.restClient.signInWithPassword({ email, password });
      return result.idToken;
    } catch (err) {
      if (!(err instanceof InvalidCredentialsException)) throw err;

      const failure = await this.attempts.recordFailure(emailHash);
      if (failure.locked) {
        // Log the lockout event but NOT any part of the unlock token — it is a
        // single-use secret and even a prefix is needless exposure in Cloud
        // Logging. The emailHash is sufficient to correlate the event.
        // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
        this.logger.log(`[auth] lockout fired emailHash=${emailHash}`);
        await this.recovery.sendUnlockEmail(email, failure.unlockToken!, failure.lockedUntil!);
        throw new AccountLockedException(failure.lockedUntil!);
      }
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.log(`[auth] password check failed code=INVALID_CREDENTIALS emailHash=${emailHash}`);
      throw err;
    }
  }

  /** Reset the failure counter after a fully successful flow. */
  async clearFailures(email: string): Promise<void> {
    await this.attempts.clear(this.attempts.emailHash(email));
  }

  /** Reject early if a prior lockout window is still active. */
  private async throwIfAccountLocked(emailHash: string): Promise<void> {
    const existing = await this.attempts.read(emailHash);
    if (existing?.lockedUntil) {
      throw new AccountLockedException(new Date(existing.lockedUntil));
    }
  }
}
