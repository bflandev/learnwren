import { describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';

import { AuthException } from '@learnwren/api-auth';
import type { UserId } from '@learnwren/shared-data-models';

import { PasswordChangeService } from './password-change.service';
import {
  CurrentPasswordInvalidException,
  NewPasswordWeakException,
  PasswordChangeFailedException,
  PasswordUnchangedException,
} from './errors/password-change.exception';

const UID = 'u1' as UserId;
const EMAIL = 'user@example.com';
const VALID_NEW = 'Bb2@bbbbbbbb';

function makeService(overrides: {
  verifyPassword?: () => Promise<unknown>;
  policy?: () => { valid: boolean; unmet?: string[] };
  updateUser?: () => Promise<unknown>;
  sendEmail?: () => Promise<void>;
  revoke?: () => Promise<unknown>;
} = {}) {
  const auth = {
    updateUser: overrides.updateUser ?? vi.fn().mockResolvedValue(undefined),
    revokeRefreshTokens: overrides.revoke ?? vi.fn().mockResolvedValue(undefined),
  };
  const verification = {
    verifyPassword: overrides.verifyPassword ?? vi.fn().mockResolvedValue('t'),
    clearFailures: vi.fn().mockResolvedValue(undefined),
  };
  const policy = {
    validate: overrides.policy ?? vi.fn().mockReturnValue({ valid: true }),
  };
  const transport = {
    sendPasswordChangedEmail: overrides.sendEmail ?? vi.fn().mockResolvedValue(undefined),
  };
  const svc = new PasswordChangeService(
    auth as never,
    verification as never,
    policy as never,
    transport as never,
  );
  return { svc, auth, verification, policy, transport };
}

describe('PasswordChangeService.changePassword', () => {
  const valid = { currentPassword: 'Aa1!aaaaaaaa', newPassword: VALID_NEW };

  it('maps a wrong current password to CURRENT_PASSWORD_INVALID and never updates', async () => {
    const verifyPassword = vi
      .fn()
      .mockRejectedValue(new AuthException('INVALID_CREDENTIALS', 'bad', 401));
    const { svc, auth, verification } = makeService({ verifyPassword });
    await expect(svc.changePassword(UID, EMAIL, valid)).rejects.toBeInstanceOf(
      CurrentPasswordInvalidException,
    );
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(verification.clearFailures).not.toHaveBeenCalled();
  });

  it('rethrows ACCOUNT_LOCKED from the lockout-honoring re-auth unchanged (renders via the AuthException filter)', async () => {
    const locked = new AuthException('ACCOUNT_LOCKED', 'Account is temporarily locked.', 423);
    const verifyPassword = vi.fn().mockRejectedValue(locked);
    const { svc, auth } = makeService({ verifyPassword });
    await expect(svc.changePassword(UID, EMAIL, valid)).rejects.toBe(locked);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('maps a weak new password to NEW_PASSWORD_WEAK carrying the unmet list', async () => {
    const policy = vi.fn().mockReturnValue({ valid: false, unmet: ['MIN_LENGTH', 'DIGIT'] });
    const { svc, auth } = makeService({ policy });
    await expect(svc.changePassword(UID, EMAIL, { ...valid, newPassword: 'weak' }))
      .rejects.toMatchObject({ code: 'NEW_PASSWORD_WEAK', details: { unmetRequirements: ['MIN_LENGTH', 'DIGIT'] } });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('rejects when the new password equals the current one', async () => {
    const { svc, auth } = makeService();
    await expect(
      svc.changePassword(UID, EMAIL, { currentPassword: VALID_NEW, newPassword: VALID_NEW }),
    ).rejects.toBeInstanceOf(PasswordUnchangedException);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('on success updates the password, emails a notice, then revokes tokens', async () => {
    const { svc, auth, transport, verification } = makeService();
    await svc.changePassword(UID, EMAIL, valid);
    expect(auth.updateUser).toHaveBeenCalledWith(UID, { password: VALID_NEW });
    expect(transport.sendPasswordChangedEmail).toHaveBeenCalledWith({ to: EMAIL });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith(UID);
    // re-auth goes through the shared lockout-honoring seam with exact args
    expect(verification.verifyPassword).toHaveBeenCalledWith(EMAIL, valid.currentPassword);
  });

  it('clears the shared lockout counter after a successful re-auth', async () => {
    const { svc, verification } = makeService();
    await svc.changePassword(UID, EMAIL, valid);
    expect(verification.clearFailures).toHaveBeenCalledWith(EMAIL);
  });

  it('swallows a notification-email failure (password already changed) and still revokes', async () => {
    const sendEmail = vi.fn().mockRejectedValue(new Error('smtp down'));
    const { svc, auth } = makeService({ sendEmail });
    const errSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(svc.changePassword(UID, EMAIL, valid)).resolves.toBeUndefined();
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith(UID);
    // the catch body MUST execute (logs the swallowed failure) — kills the emptied-catch-block mutant
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('[profile] password-changed notice failed'),
    );
    errSpy.mockRestore();
  });

  it('swallows a revokeRefreshTokens failure (password already changed) and resolves', async () => {
    const revoke = vi.fn().mockRejectedValue(new Error('revoke down'));
    const { svc } = makeService({ revoke });
    const errSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(svc.changePassword(UID, EMAIL, valid)).resolves.toBeUndefined();
    expect(revoke).toHaveBeenCalledWith(UID);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('[profile] password-change revoke failed'),
    );
    errSpy.mockRestore();
  });

  it('maps an unexpected updateUser failure to PASSWORD_CHANGE_FAILED and carries the cause', async () => {
    const boom = new Error('boom');
    const updateUser = vi.fn().mockRejectedValue(boom);
    const { svc } = makeService({ updateUser });
    await expect(svc.changePassword(UID, EMAIL, valid)).rejects.toMatchObject({
      code: 'PASSWORD_CHANGE_FAILED',
      status: 500,
      cause: boom,
    });
  });

  it('maps an unexpected re-auth error to PASSWORD_CHANGE_FAILED with the cause, and never updates', async () => {
    const boom = new Error('network down');
    const verifyPassword = vi.fn().mockRejectedValue(boom);
    const { svc, auth } = makeService({ verifyPassword });
    await expect(svc.changePassword(UID, EMAIL, valid)).rejects.toMatchObject({
      code: 'PASSWORD_CHANGE_FAILED',
      cause: boom,
    });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('maps an AuthException with a non-INVALID_CREDENTIALS, non-ACCOUNT_LOCKED code to PASSWORD_CHANGE_FAILED', async () => {
    const verifyPassword = vi.fn().mockRejectedValue(new AuthException('NETWORK', 'down', 503));
    const { svc, auth } = makeService({ verifyPassword });
    await expect(svc.changePassword(UID, EMAIL, valid)).rejects.toBeInstanceOf(
      PasswordChangeFailedException,
    );
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('does NOT treat a plain object with code INVALID_CREDENTIALS (not an AuthException) as wrong-password', async () => {
    // instanceof guard must hold: only a real AuthException maps to CurrentPasswordInvalid.
    const verifyPassword = vi.fn().mockRejectedValue({ code: 'INVALID_CREDENTIALS' });
    const { svc } = makeService({ verifyPassword });
    await expect(svc.changePassword(UID, EMAIL, valid)).rejects.toBeInstanceOf(
      PasswordChangeFailedException,
    );
  });
});
