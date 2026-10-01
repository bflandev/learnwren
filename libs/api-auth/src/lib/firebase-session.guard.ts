import { CanActivate, ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common';

import type { UserId, UserRole } from '@learnwren/shared-data-models';

import { UnauthenticatedException } from './errors/auth.exception';
import { IDENTITY_PROVIDER, type IdentityProvider } from './identity/identity-provider.port';
import { SessionCookieHelper } from './session-cookie.helper';
import type { AuthenticatedRequest } from './types/authenticated-request';

@Injectable()
export class FirebaseSessionGuard implements CanActivate {
  // Stryker disable next-line StringLiteral: Logger category name — log-only, no behavioral effect
  private readonly logger = new Logger('FirebaseSessionGuard');

  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly identity: IdentityProvider,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest & { cookies?: Record<string, string> }>();
    const cookie = req.cookies?.[SessionCookieHelper.COOKIE_NAME];

    if (!cookie) {
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.warn('[auth] guard rejected reason=missing');
      throw new UnauthenticatedException();
    }

    const claims = await this.identity.verifySession(cookie);
    if (!claims) {
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.warn('[auth] guard rejected reason=invalid');
      throw new UnauthenticatedException();
    }

    req.user = {
      uid: claims.uid as UserId,
      email: claims.email,
      role: claims.role as UserRole,
      emailVerified: claims.emailVerified,
    };
    return true;
  }
}
