import { describe, expect, it, vi } from 'vitest';

import { AuthException } from '@learnwren/api-auth';
import type { UserId } from '@learnwren/shared-data-models';

import { EmailChangeService } from './email-change.service';
import {
  CurrentPasswordInvalidException,
  EmailAlreadyInUseException,
  EmailInvalidException,
  EmailUnchangedException,
} from './errors/email-change.exception';

const UID = 'u1' as UserId;

function makeService(overrides: {
  signIn?: () => Promise<unknown>;
  genLink?: () => Promise<string>;
  sendEmail?: () => Promise<void>;
} = {}) {
  const auth = {
    generateVerifyAndChangeEmailLink:
      overrides.genLink ?? vi.fn().mockResolvedValue('https://app/verify?oobCode=x'),
    getUser: vi.fn(),
    revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
  };
  const restClient = {
    signInWithPassword: overrides.signIn ?? vi.fn().mockResolvedValue({ idToken: 't' }),
  };
  const transport = {
    sendEmailChangeVerificationEmail: overrides.sendEmail ?? vi.fn().mockResolvedValue(undefined),
  };
  const firestore = {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({ update: vi.fn().mockResolvedValue(undefined) }),
    }),
  };
  const svc = new EmailChangeService(
    auth as never,
    firestore as never,
    restClient as never,
    transport as never,
  );
  return { svc, auth, restClient, transport };
}

describe('EmailChangeService.requestChange', () => {
  const valid = { newEmail: 'new@example.com', currentPassword: 'pw' };

  it('rejects an invalid new email before touching Firebase', async () => {
    const { svc, restClient } = makeService();
    await expect(svc.requestChange(UID, 'old@example.com', { ...valid, newEmail: 'nope' }))
      .rejects.toBeInstanceOf(EmailInvalidException);
    expect(restClient.signInWithPassword).not.toHaveBeenCalled();
  });

  it('rejects when the new email equals the current (case-insensitive)', async () => {
    const { svc } = makeService();
    await expect(svc.requestChange(UID, 'Old@Example.com', { ...valid, newEmail: 'old@example.com' }))
      .rejects.toBeInstanceOf(EmailUnchangedException);
  });

  it('maps a wrong current password to CURRENT_PASSWORD_INVALID', async () => {
    const signIn = vi.fn().mockRejectedValue(
      new AuthException('INVALID_CREDENTIALS', 'bad', 401),
    );
    const { svc } = makeService({ signIn });
    await expect(svc.requestChange(UID, 'old@example.com', valid))
      .rejects.toBeInstanceOf(CurrentPasswordInvalidException);
  });

  it('maps Firebase auth/email-already-exists to EMAIL_ALREADY_IN_USE', async () => {
    const genLink = vi.fn().mockRejectedValue({ code: 'auth/email-already-exists' });
    const { svc } = makeService({ genLink });
    await expect(svc.requestChange(UID, 'old@example.com', valid))
      .rejects.toBeInstanceOf(EmailAlreadyInUseException);
  });

  it('generates the verify-and-change link and emails the NEW address on success', async () => {
    const { svc, auth, transport } = makeService();
    await svc.requestChange(UID, 'old@example.com', valid);
    expect(auth.generateVerifyAndChangeEmailLink).toHaveBeenCalledWith(
      'old@example.com',
      'new@example.com',
      expect.objectContaining({ url: expect.stringContaining('/settings/profile/email-changed') }),
    );
    expect(transport.sendEmailChangeVerificationEmail).toHaveBeenCalledWith({
      to: 'new@example.com',
      verificationUrl: 'https://app/verify?oobCode=x',
    });
  });
});
