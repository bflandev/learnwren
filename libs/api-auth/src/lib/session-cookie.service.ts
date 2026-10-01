import { Inject, Injectable, Logger } from '@nestjs/common';

import { InternalAuthException } from './errors/auth.exception';
import { IDENTITY_PROVIDER, type IdentityProvider, type PasswordProof } from './identity/identity-provider.port';

export interface MintedSession {
  cookie: string;
  maxAgeSeconds: number;
}

@Injectable()
export class SessionCookieService {
  // Stryker disable next-line StringLiteral: Logger category name — log-only, no behavioral effect
  private readonly logger = new Logger('SessionCookieService');

  constructor(@Inject(IDENTITY_PROVIDER) private readonly identity: IdentityProvider) {}

  /**
   * Mint a 5-day session cookie from proof of a successful password check.
   * Used by register and login. Not exposed via the controller.
   */
  async mint(proof: PasswordProof): Promise<MintedSession> {
    try {
      const session = await this.identity.createSession(proof);
      return { cookie: session.token, maxAgeSeconds: session.maxAgeSeconds };
    } catch (err) {
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.error(`[auth] mint createSession failed: ${String(err)}`);
      throw new InternalAuthException();
    }
  }

  async revokeFromCookie(cookie: string | undefined): Promise<void> {
    if (!cookie) return;
    await this.identity.endSession(cookie);
  }
}
