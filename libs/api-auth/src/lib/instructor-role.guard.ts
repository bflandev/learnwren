import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { InsufficientRoleException } from './errors/auth.exception';
import type { AuthenticatedRequest } from './types/authenticated-request';

@Injectable()
export class InstructorRoleGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (req.user?.role !== 'INSTRUCTOR') {
      throw new InsufficientRoleException();
    }
    return true;
  }
}
