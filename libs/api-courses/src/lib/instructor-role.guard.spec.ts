import { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { AuthenticatedRequest } from '@learnwren/api-auth';
import type { UserId, UserRole } from '@learnwren/shared-data-models';

import { InsufficientRoleException } from './errors/courses.exception';
import { InstructorRoleGuard } from './instructor-role.guard';

function buildContext(role: UserRole | null): ExecutionContext {
  const req: Partial<AuthenticatedRequest> = {
    user:
      role === null
        ? undefined
        : {
            uid: 'uid-1' as UserId,
            email: 'i@example.com',
            role,
            emailVerified: true,
          },
  };
  return {
    switchToHttp: () => ({
      getRequest: () => req as AuthenticatedRequest,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

describe('InstructorRoleGuard', () => {
  const guard = new InstructorRoleGuard();

  it('allows INSTRUCTOR', () => {
    expect(guard.canActivate(buildContext('INSTRUCTOR'))).toBe(true);
  });

  it('rejects STUDENT with InsufficientRoleException', () => {
    expect(() => guard.canActivate(buildContext('STUDENT'))).toThrow(
      InsufficientRoleException,
    );
  });

  it('rejects ADMIN (administration is not authoring)', () => {
    expect(() => guard.canActivate(buildContext('ADMIN'))).toThrow(
      InsufficientRoleException,
    );
  });

  it('rejects requests with no user attached', () => {
    expect(() => guard.canActivate(buildContext(null))).toThrow(InsufficientRoleException);
  });
});
