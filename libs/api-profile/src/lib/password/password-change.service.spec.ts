import { describe, expect, it, vi } from 'vitest';

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
  signIn?: () => Promise<unknown>;
  policy?: () => { valid: boolean; unmet?: string[] };
  updateUser?: () => Promise<unknown>;
  sendEmail?: () => Promise<void>;
} = {}) {
  const auth = {
    updateUser: overrides.updateUser ?? vi.fn().mockResolvedValue(undefined),
    revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
  };
  const restClient = {
    signInWithPassword: overrides.signIn ?? vi.fn().mockResolvedValue({ idToken: 't' }),
  };
  const policy = {
    validate: overrides.policy ?? vi.fn().mockReturnValue({ valid: true }),
  };
  const transport = {
    sendPasswordChangedEmail: overrides.sendEmail ?? vi.fn().mockResolvedValue(undefined),
  };
  const svc = new PasswordChangeService(
    auth as never,
    restClient as never,
    policy as never,
    transport as never,
  );
  return { svc, auth, restClient, policy, transport };
}

describe('PasswordChangeService.changePassword', () => {
  const valid = { currentPassword: 'Aa1!aaaaaaaa', newPassword: VALID_NEW };

  it('maps a wrong current password to CURRENT_PASSWORD_INVALID and never updates', async () => {
    const signIn = vi.fn().mockRejectedValue(new AuthException('INVALID_CREDENTIALS', 'bad', 401));
    const { svc, auth } = makeService({ signIn });
    await expect(svc.changePassword(UID, EMAIL, valid)).rejects.toBeInstanceOf(
      CurrentPasswordInvalidException,
    );
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
    const { svc, auth, transport } = makeService();
    await svc.changePassword(UID, EMAIL, valid);
    expect(auth.updateUser).toHaveBeenCalledWith(UID, { password: VALID_NEW });
    expect(transport.sendPasswordChangedEmail).toHaveBeenCalledWith({ to: EMAIL });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith(UID);
  });

  it('swallows a notification-email failure (password already changed) and still revokes', async () => {
    const sendEmail = vi.fn().mockRejectedValue(new Error('smtp down'));
    const { svc, auth } = makeService({ sendEmail });
    await expect(svc.changePassword(UID, EMAIL, valid)).resolves.toBeUndefined();
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith(UID);
  });

  it('maps an unexpected updateUser failure to PASSWORD_CHANGE_FAILED', async () => {
    const updateUser = vi.fn().mockRejectedValue(new Error('boom'));
    const { svc } = makeService({ updateUser });
    await expect(svc.changePassword(UID, EMAIL, valid)).rejects.toBeInstanceOf(
      PasswordChangeFailedException,
    );
  });

  it('maps an unexpected re-auth error to PASSWORD_CHANGE_FAILED and never updates', async () => {
    const signIn = vi.fn().mockRejectedValue(new Error('network down'));
    const { svc, auth } = makeService({ signIn });
    await expect(svc.changePassword(UID, EMAIL, valid)).rejects.toBeInstanceOf(
      PasswordChangeFailedException,
    );
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});
