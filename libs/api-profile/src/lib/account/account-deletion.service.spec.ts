import { describe, expect, it, vi } from 'vitest';

import { AuthException } from '@learnwren/api-auth';
import type { UserId } from '@learnwren/shared-data-models';

import { AccountDeletionService } from './account-deletion.service';
import { CurrentPasswordInvalidException } from '../password/errors/password-change.exception';
import { UserHasCoursesException } from '../users/errors/admin-users.exception';

const UID = 'u1' as UserId;
const EMAIL = 'user@example.com';
const PASSWORD = 'Aa1!aaaaaaaa';

function makeService(verifyPassword = vi.fn().mockResolvedValue('t')) {
  const verification = { verifyPassword, clearFailures: vi.fn().mockResolvedValue(undefined) };
  const deleter = { deleteAccount: vi.fn().mockResolvedValue(undefined) };
  const svc = new AccountDeletionService(verification as never, deleter as never);
  return { svc, verification, deleter };
}

describe('AccountDeletionService.deleteOwnAccount', () => {
  it('re-authenticates, clears failures, then runs the shared delete with the user as their own actor', async () => {
    const { svc, verification, deleter } = makeService();
    await svc.deleteOwnAccount(UID, EMAIL, PASSWORD);
    expect(verification.verifyPassword).toHaveBeenCalledWith(EMAIL, PASSWORD);
    expect(verification.clearFailures).toHaveBeenCalledWith(EMAIL);
    expect(deleter.deleteAccount).toHaveBeenCalledWith(UID, UID, 'data-first');
  });

  it('maps a wrong password to CURRENT_PASSWORD_INVALID and deletes nothing', async () => {
    const { svc, verification, deleter } = makeService(
      vi.fn().mockRejectedValue(new AuthException('INVALID_CREDENTIALS', 'bad', 401)),
    );
    await expect(svc.deleteOwnAccount(UID, EMAIL, 'wrong')).rejects.toBeInstanceOf(
      CurrentPasswordInvalidException,
    );
    expect(verification.clearFailures).not.toHaveBeenCalled();
    expect(deleter.deleteAccount).not.toHaveBeenCalled();
  });

  it('rethrows ACCOUNT_LOCKED unchanged and deletes nothing', async () => {
    const locked = new AuthException('ACCOUNT_LOCKED', 'locked', 423);
    const { svc, deleter } = makeService(vi.fn().mockRejectedValue(locked));
    await expect(svc.deleteOwnAccount(UID, EMAIL, PASSWORD)).rejects.toBe(locked);
    expect(deleter.deleteAccount).not.toHaveBeenCalled();
  });

  it('rethrows an unexpected re-auth failure (rendered as INTERNAL by the catch-all filter) and deletes nothing', async () => {
    const boom = new Error('network');
    const { svc, deleter } = makeService(vi.fn().mockRejectedValue(boom));
    await expect(svc.deleteOwnAccount(UID, EMAIL, PASSWORD)).rejects.toBe(boom);
    expect(deleter.deleteAccount).not.toHaveBeenCalled();
  });

  it('propagates the shared delete guards (e.g. USER_HAS_COURSES) unchanged', async () => {
    const { svc, deleter } = makeService();
    const blocked = new UserHasCoursesException(1, []);
    deleter.deleteAccount.mockRejectedValue(blocked);
    await expect(svc.deleteOwnAccount(UID, EMAIL, PASSWORD)).rejects.toBe(blocked);
  });
});
