import { Inject, Injectable, Logger } from '@nestjs/common';

import { AccountRecoveryService } from './account-recovery.service';
import { AuthAttemptsRepository } from './auth-attempts.repository';
import {
  AccountLockedException,
  InvalidCredentialsException,
} from './errors/auth.exception';
import { IDENTITY_PROVIDER, type IdentityProvider, type PasswordProof } from './identity/identity-provider.port';

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
    @Inject(IDENTITY_PROVIDER) private readonly identity: IdentityProvider,
    private readonly attempts: AuthAttemptsRepository,
    private readonly recovery: AccountRecoveryService,
  ) {}

  /**
   * Verify an email+password pair, honoring the account lockout:
   *  - rejects with AccountLockedException while a lockout window is active,
   *    without contacting Firebase;
   *  - records INVALID_CREDENTIALS failures toward the lockout, dispatching
   *    the unlock email when the threshold trips;
   *  - returns a PasswordProof on success.
   *
   * Does NOT clear the failure counter on success — call clearFailures() once
   * the caller's flow has fully succeeded.
   */
  async verifyPassword(email: string, password: string): Promise<PasswordProof> {
    const emailHash = this.attempts.emailHash(email);
    await this.throwIfAccountLocked(emailHash);

    let proof: PasswordProof;
    try {
      proof = await this.identity.verifyPassword(email, password);
    } catch (err) {
      if (!(err instanceof InvalidCredentialsException)) throw err;

      const failure = await this.attempts.recordFailure(emailHash);
      if (failure.locked) {
        // Only the failure that tripped the lock carries a token; one that
        // landed on an existing lock must not send a second email.
        if (failure.unlockToken) {
          // Log the lockout event but NOT any part of the unlock token — it is a
          // single-use secret and even a prefix is needless exposure in Cloud
          // Logging. The emailHash is sufficient to correlate the event.
          // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
          this.logger.log(`[auth] lockout fired emailHash=${emailHash}`);
          await this.recovery.sendUnlockEmail(email, failure.unlockToken, failure.lockedUntil!);
        }
        throw new AccountLockedException(failure.lockedUntil!);
      }
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.log(`[auth] password check failed code=INVALID_CREDENTIALS emailHash=${emailHash}`);
      throw err;
    }

    // A parallel guess may have tripped the lock while this check ran; a
    // correct password found that way must not get through.
    // ponytail: the parallel guesses themselves are still evaluated; an atomic
    // pre-check reservation would close that if the per-IP throttle proves too loose.
    await this.throwIfAccountLocked(emailHash);
    return proof;
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
