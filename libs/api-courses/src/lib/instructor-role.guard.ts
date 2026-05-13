import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { AuthenticatedRequest } from '@learnwren/api-auth';

import { InsufficientRoleException } from './errors/courses.exception';

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
