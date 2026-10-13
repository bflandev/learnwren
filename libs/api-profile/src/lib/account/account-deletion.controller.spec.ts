import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedRequest } from '@learnwren/api-auth';
import type { UserId } from '@learnwren/shared-data-models';

import { AccountDeletionController } from './account-deletion.controller';
import { AccountDeletionExceptionFilter } from './account-deletion.exception-filter';
import { UserHasCoursesException } from '../users/errors/admin-users.exception';

describe('AccountDeletionController', () => {
  it('deletes the session user with their password and clears the cookie (204)', async () => {
    const svc = { deleteOwnAccount: vi.fn().mockResolvedValue(undefined) };
    const cookieHelper = { toClearingCookie: vi.fn().mockReturnValue('__session=; Max-Age=0') };
    const controller = new AccountDeletionController(svc as never, cookieHelper as never);
    const setHeader = vi.fn();
    const req = {
      user: { uid: 'u1' as UserId, email: 'user@example.com', role: 'STUDENT', emailVerified: true },
    } as AuthenticatedRequest;

    await controller.delete({ currentPassword: 'pw' }, req, { setHeader } as never);

    expect(svc.deleteOwnAccount).toHaveBeenCalledWith('u1', 'user@example.com', 'pw');
    expect(setHeader).toHaveBeenCalledWith('Set-Cookie', '__session=; Max-Age=0');
  });

  it('does not clear the cookie when the delete fails', async () => {
    const svc = { deleteOwnAccount: vi.fn().mockRejectedValue(new UserHasCoursesException(1, [])) };
    const controller = new AccountDeletionController(svc as never, { toClearingCookie: vi.fn() } as never);
    const setHeader = vi.fn();
    const req = { user: { uid: 'u1', email: 'e' } } as unknown as AuthenticatedRequest;
    await expect(controller.delete({ currentPassword: 'pw' }, req, { setHeader } as never)).rejects.toThrow();
    expect(setHeader).not.toHaveBeenCalled();
  });
});

describe('AccountDeletionExceptionFilter', () => {
  it('is a catch-all, so an unexpected re-auth failure still gets the JSON error envelope', () => {
    const caught = Reflect.getMetadata('__filterCatchExceptions__', AccountDeletionExceptionFilter);
    expect(caught).toEqual([]);
  });

  it('renders an unknown error as a 500 INTERNAL envelope', () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const host = { switchToHttp: () => ({ getResponse: () => ({ status, setHeader: () => undefined }) }) } as never;
    new AccountDeletionExceptionFilter().catch(new Error('identity provider down'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ error: expect.objectContaining({ code: 'INTERNAL' }) });
  });

  it('renders a domain exception with its code, status and details', () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const host = { switchToHttp: () => ({ getResponse: () => ({ status, setHeader: () => undefined }) }) } as never;
    new AccountDeletionExceptionFilter().catch(new UserHasCoursesException(2, []), host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: expect.objectContaining({ code: 'USER_HAS_COURSES', details: { courseCount: 2, courseIds: [] } }),
    });
  });
});
