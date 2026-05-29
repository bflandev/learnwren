import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedRequest } from '@learnwren/api-auth';
import type { UserId } from '@learnwren/shared-data-models';

import { PasswordChangeController } from './password-change.controller';

function mockReq(): AuthenticatedRequest {
  return {
    user: { uid: 'u1' as UserId, email: 'user@example.com', role: 'STUDENT', emailVerified: true },
  } as AuthenticatedRequest;
}

describe('PasswordChangeController', () => {
  it('delegates to the service and clears the session cookie (204)', async () => {
    const svc = { changePassword: vi.fn().mockResolvedValue(undefined) };
    const cookieHelper = { toClearingCookie: vi.fn().mockReturnValue('__session=; Max-Age=0') };
    const controller = new PasswordChangeController(svc as never, cookieHelper as never);
    const setHeader = vi.fn();

    await controller.change(
      { currentPassword: 'a', newPassword: 'b' },
      mockReq(),
      { setHeader } as never,
    );

    expect(svc.changePassword).toHaveBeenCalledWith('u1', 'user@example.com', {
      currentPassword: 'a',
      newPassword: 'b',
    });
    expect(setHeader).toHaveBeenCalledWith('Set-Cookie', '__session=; Max-Age=0');
  });
});
