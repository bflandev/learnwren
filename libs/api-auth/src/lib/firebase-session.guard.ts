import { CanActivate, ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common';

import { FIREBASE_AUTH, type FirebaseAuthHandle } from '@learnwren/api-firebase';
import type { UserId, UserRole } from '@learnwren/shared-data-models';

import { UnauthenticatedException } from './errors/auth.exception';
import { SessionCookieHelper } from './session-cookie.helper';
import type { AuthenticatedRequest } from './types/authenticated-request';

@Injectable()
export class FirebaseSessionGuard implements CanActivate {
  // Stryker disable next-line StringLiteral: Logger category name — log-only, no behavioral effect
  private readonly logger = new Logger('FirebaseSessionGuard');

  constructor(
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest & { cookies?: Record<string, string> }>();
    const cookie = req.cookies?.[SessionCookieHelper.COOKIE_NAME];

    if (!cookie) {
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.warn('[auth] guard rejected reason=missing');
      throw new UnauthenticatedException();
    }

    try {
      const decoded = await this.auth.verifySessionCookie(cookie, true);
      req.user = {
        uid: decoded.uid as UserId,
        email: decoded['email'] ?? '',
        role: decoded['role'] as UserRole,
        emailVerified: Boolean(decoded['email_verified']),
      };
      return true;
    } catch (err) {
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.warn(`[auth] guard rejected reason=invalid: ${String(err)}`);
      throw new UnauthenticatedException();
    }
  }
}
