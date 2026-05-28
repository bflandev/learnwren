import { describe, expect, it, vi } from 'vitest';

import type { UserId } from '@learnwren/shared-data-models';
import type { AuthenticatedRequest } from '@learnwren/api-auth';

import { EmailChangeController } from './email-change.controller';

const req = (email: string) =>
  ({ user: { uid: 'u1' as UserId, email, role: 'STUDENT', emailVerified: true } } as AuthenticatedRequest);

describe('EmailChangeController', () => {
  it('delegates request() to the service and returns void (202)', async () => {
    const svc = { requestChange: vi.fn().mockResolvedValue(undefined), confirmChange: vi.fn() };
    const cookie = { toClearingCookie: vi.fn() };
    const ctrl = new EmailChangeController(svc as never, cookie as never);
    await ctrl.request({ newEmail: 'new@x.com', currentPassword: 'pw' }, req('old@x.com'));
    expect(svc.requestChange).toHaveBeenCalledWith('u1', 'old@x.com', {
      newEmail: 'new@x.com',
      currentPassword: 'pw',
    });
  });

  it('clears the session cookie when confirm reports a change', async () => {
    const svc = {
      requestChange: vi.fn(),
      confirmChange: vi.fn().mockResolvedValue({ changed: true, email: 'new@x.com' }),
    };
    const cookie = { toClearingCookie: vi.fn().mockReturnValue('__session=; Max-Age=0') };
    const setHeader = vi.fn();
    const ctrl = new EmailChangeController(svc as never, cookie as never);
    const res = await ctrl.confirm(req('old@x.com'), { setHeader } as never);
    expect(res).toEqual({ changed: true, email: 'new@x.com' });
    expect(setHeader).toHaveBeenCalledWith('Set-Cookie', '__session=; Max-Age=0');
  });

  it('does NOT clear the cookie on a no-op confirm', async () => {
    const svc = { requestChange: vi.fn(), confirmChange: vi.fn().mockResolvedValue({ changed: false }) };
    const cookie = { toClearingCookie: vi.fn() };
    const setHeader = vi.fn();
    const ctrl = new EmailChangeController(svc as never, cookie as never);
    await ctrl.confirm(req('old@x.com'), { setHeader } as never);
    expect(setHeader).not.toHaveBeenCalled();
  });
});
