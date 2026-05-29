import { Inject, Injectable, Logger } from '@nestjs/common';
import type { auth as adminAuth } from 'firebase-admin';

import { FIREBASE_AUTH, type FirebaseAuthHandle } from '@learnwren/api-firebase';
import type { UserId } from '@learnwren/shared-data-models';

import { AuthAttemptsRepository } from './auth-attempts.repository';
import { EMAIL_TRANSPORT, type EmailTransport } from './email-transport/email-transport';
import { isFirebaseError } from './firebase-error.util';
import {
  InternalAuthException,
  InvalidUnlockTokenException,
  TooManyRequestsException,
  UnlockTokenExpiredException,
} from './errors/auth.exception';

@Injectable()
export class AccountRecoveryService {
  private readonly logger = new Logger('AccountRecoveryService');

  constructor(
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle,
    private readonly attempts: AuthAttemptsRepository,
    @Inject(EMAIL_TRANSPORT) private readonly emailTransport: EmailTransport,
  ) {}

  async resendVerification(email: string): Promise<void> {
    const emailHash = this.attempts.emailHash(email);

    const throttle = await this.attempts.recordResendVerification(emailHash);
    if (throttle.throttled) throw new TooManyRequestsException();

    const userRecord = await this.findUserOrNullForEnumerationResistance(email);
    if (!userRecord) return;
    if (userRecord.emailVerified) {
      // Already verified — silent success (don't leak verification status).
      return;
    }

    await this.dispatchOutboundEmail('resend-verification', emailHash, async () => {
      const verificationUrl = await this.auth.generateEmailVerificationLink(email, {
        url: this.continueUrl('/login'),
      });
      await this.emailTransport.sendVerificationEmail({ to: email, verificationUrl });
    });
  }

  async requestPasswordReset(email: string): Promise<void> {
    const emailHash = this.attempts.emailHash(email);

    const throttle = await this.attempts.recordPasswordResetRequest(emailHash);
    if (throttle.throttled) throw new TooManyRequestsException();

    const userRecord = await this.findUserOrNullForEnumerationResistance(email);
    if (!userRecord) return;

    await this.dispatchOutboundEmail('password-reset', emailHash, async () => {
      const resetUrl = await this.auth.generatePasswordResetLink(email, {
        url: this.continueUrl('/login?reset=ok'),
      });
      await this.emailTransport.sendPasswordResetEmail({ to: email, resetUrl });
    });
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

  /**
   * Sent by AuthService.login when a failed-attempt count crosses the lock
   * threshold. Best-effort: the lock is enforced regardless of email outcome.
   */
  async sendUnlockEmail(
    email: string,
    unlockToken: string,
    unlockAvailableAt: Date,
  ): Promise<void> {
    // Resolve the canonical email address from Firebase to avoid sending to
    // a typo'd address that happened to match the brute-force attempt.
    let to: string;
    try {
      const userRecord = await this.auth.getUserByEmail(email);
      to = userRecord.email!;
    } catch {
      // The lock fired against a non-existent account (typo or malicious
      // probing). Don't send an email anywhere; lock is in place regardless.
      return;
    }

    try {
      await this.emailTransport.sendUnlockEmail({
        to,
        unlockUrl: `${this.continueUrl('/auth/unlock')}?token=${unlockToken}`,
        unlockAvailableAt,
      });
    } catch (err) {
      this.logger.error(`[auth] unlock-email send failed: ${String(err)}`);
    }
  }

  /**
   * Best-effort verification email sent at the end of register(). Returns
   * whether the email left the building so the controller can surface
   * partial success.
   */
  async sendInitialVerificationEmail(email: string, uid: UserId): Promise<boolean> {
    try {
      const verificationUrl = await this.auth.generateEmailVerificationLink(email, {
        url: this.continueUrl('/login'),
      });
      await this.emailTransport.sendVerificationEmail({ to: email, verificationUrl });
      return true;
    } catch (err) {
      this.logger.warn(`[auth] register verification email failed uid=${uid}: ${String(err)}`);
      return false;
    }
  }

  /**
   * getUserByEmail with the standard enumeration-resistant adapter: a missing
   * user becomes `null` so the caller can early-return silent success without
   * having to spell out the `auth/user-not-found` branch each time. Any other
   * Firebase error is rethrown untouched.
   */
  private async findUserOrNullForEnumerationResistance(
    email: string,
  ): Promise<adminAuth.UserRecord | null> {
    try {
      return await this.auth.getUserByEmail(email);
    } catch (err) {
      if (isFirebaseError(err) && err.code === 'auth/user-not-found') return null;
      throw err;
    }
  }

  /**
   * Run an outbound-email send (`fn` should both generate the link and call
   * the transport), logging success at info and mapping any failure to
   * InternalAuthException after logging the underlying error. The `tag`
   * appears in both log lines so operators can trace by flow type.
   */
  private async dispatchOutboundEmail(
    tag: 'resend-verification' | 'password-reset',
    emailHash: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    try {
      await fn();
      this.logger.log(`[auth] ${tag} sent emailHash=${emailHash}`);
    } catch (err) {
      this.logger.error(`[auth] ${tag} send failed emailHash=${emailHash}: ${String(err)}`);
      throw new InternalAuthException();
    }
  }

  private continueUrl(path: string): string {
    const base = process.env['LEARNWREN_PUBLIC_URL'] ?? 'http://localhost:4200';
    return `${base}${path}`;
  }
}
