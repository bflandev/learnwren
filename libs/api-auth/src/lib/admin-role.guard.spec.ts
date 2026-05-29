import { describe, it, expect } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';

import { AdminRoleGuard } from './admin-role.guard';
import { InsufficientRoleException } from './errors/auth.exception';

function ctxWithRole(role: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
  } as unknown as ExecutionContext;
}

describe('AdminRoleGuard', () => {
  const guard = new AdminRoleGuard();

  it('allows ADMIN', () => {
    expect(guard.canActivate(ctxWithRole('ADMIN'))).toBe(true);
  });

  it('rejects INSTRUCTOR', () => {
    expect(() => guard.canActivate(ctxWithRole('INSTRUCTOR'))).toThrow(InsufficientRoleException);
  });

  it('rejects missing user', () => {
    expect(() => guard.canActivate(ctxWithRole(undefined))).toThrow(InsufficientRoleException);
  });
});
