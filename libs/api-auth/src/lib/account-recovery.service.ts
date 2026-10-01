import { Inject, Injectable, Logger } from '@nestjs/common';

import type { UserId } from '@learnwren/shared-data-models';

import { AuthAttemptsRepository } from './auth-attempts.repository';
import { EMAIL_TRANSPORT, type EmailTransport } from './email-transport/email-transport';
import {
  InternalAuthException,
  InvalidUnlockTokenException,
  TooManyRequestsException,
  UnlockTokenExpiredException,
} from './errors/auth.exception';
import { IDENTITY_PROVIDER, type IdentityProvider, type IdentityUser } from './identity/identity-provider.port';
import { publicUrl } from './identity/public-url';

@Injectable()
export class AccountRecoveryService {
  // Stryker disable next-line StringLiteral: Logger category name — log-only, no behavioral effect
  private readonly logger = new Logger('AccountRecoveryService');

  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly identity: IdentityProvider,
    private readonly attempts: AuthAttemptsRepository,
    @Inject(EMAIL_TRANSPORT) private readonly emailTransport: EmailTransport,
  ) {}

  async resendVerification(email: string): Promise<void> {
    const emailHash = this.attempts.emailHash(email);

    const throttle = await this.attempts.recordResendVerification(emailHash);
    if (throttle.throttled) throw new TooManyRequestsException();

    const user = await this.findUserOrNullForEnumerationResistance(email);
    if (!user) return;
    if (user.emailVerified) {
      // Already verified — silent success (don't leak verification status).
      return;
    }

    // Stryker disable next-line StringLiteral: `tag` flows only into log lines (dispatchOutboundEmail) — log-only, no behavioral effect
    await this.dispatchOutboundEmail('resend-verification', emailHash, async () => {
      const verificationUrl = await this.identity.createEmailActionLink('verify-email', email, '/login');
      await this.emailTransport.sendVerificationEmail({ to: email, verificationUrl });
    });
  }

  async requestPasswordReset(email: string): Promise<void> {
    const emailHash = this.attempts.emailHash(email);

    const throttle = await this.attempts.recordPasswordResetRequest(emailHash);
    if (throttle.throttled) throw new TooManyRequestsException();

    const user = await this.findUserOrNullForEnumerationResistance(email);
    if (!user) return;

    // Stryker disable next-line StringLiteral: `tag` flows only into log lines (dispatchOutboundEmail) — log-only, no behavioral effect
    await this.dispatchOutboundEmail('password-reset', emailHash, async () => {
      const resetUrl = await this.identity.createEmailActionLink('reset-password', email, '/login?reset=ok');
      await this.emailTransport.sendPasswordResetEmail({ to: email, resetUrl });
    });
    // Note: deliberate no-op on lockout state. See spec §1.5 / §E.2(ii).
  }

  async unlock(token: string): Promise<void> {
    const result = await this.attempts.redeemUnlockToken(token);
    if (result.status === 'ok') {
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
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
    // Resolve the canonical email address via the identity provider to avoid
    // sending to a typo'd address that happened to match the brute-force
    // attempt. Any failure (unknown user, provider error) is treated the
    // same: the lock is in place regardless, so stay silent.
    // Stryker disable next-line ArrowFunction: equivalent — null vs undefined
    // are both falsy, so the `if (!user) return` below behaves identically.
    const user: IdentityUser | null = await this.identity.getUserByEmail(email).catch(() => null);
    if (!user) return;
    const to = user.email;

    // Stryker disable BlockStatement: the best-effort catch only logs then swallows the send error, so emptying it is indistinguishable from the original — equivalent. (Stryker associates a `} catch` block mutant with the try-open line, so it cannot be targeted by a next-line directive in isolation; this minimal region is the narrowest that reaches it. The try-body emptying is still locked by the "sends the unlock email" spec, which asserts sendUnlockEmail is invoked.)
    try {
      await this.emailTransport.sendUnlockEmail({
        to,
        unlockUrl: `${publicUrl('/auth/unlock')}?token=${unlockToken}`,
        unlockAvailableAt,
      });
    } catch (err) {
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.error(`[auth] unlock-email send failed: ${String(err)}`);
    }
    // Stryker restore BlockStatement
  }

  /**
   * Best-effort verification email sent at the end of register(). Returns
   * whether the email left the building so the controller can surface
   * partial success.
   */
  async sendInitialVerificationEmail(email: string, uid: UserId): Promise<boolean> {
    try {
      const verificationUrl = await this.identity.createEmailActionLink('verify-email', email, '/login');
      await this.emailTransport.sendVerificationEmail({ to: email, verificationUrl });
      return true;
    } catch (err) {
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.warn(`[auth] register verification email failed uid=${uid}: ${String(err)}`);
      return false;
    }
  }

  /**
   * getUserByEmail with the standard enumeration-resistant adapter: a missing
   * user resolves `null` (the port's contract) so the caller can early-return
   * silent success without having to spell out the branch each time.
   */
  private async findUserOrNullForEnumerationResistance(email: string): Promise<IdentityUser | null> {
    return this.identity.getUserByEmail(email);
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
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.log(`[auth] ${tag} sent emailHash=${emailHash}`);
    } catch (err) {
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.error(`[auth] ${tag} send failed emailHash=${emailHash}: ${String(err)}`);
      throw new InternalAuthException();
    }
  }
}
