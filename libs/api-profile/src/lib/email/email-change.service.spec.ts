import { describe, expect, it, vi } from 'vitest';

import { AuthException } from '@learnwren/api-auth';
import type { UserId } from '@learnwren/shared-data-models';

import { EmailChangeService } from './email-change.service';
import {
  CurrentPasswordInvalidException,
  EmailAlreadyInUseException,
  EmailChangeFailedException,
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

  it.each([
    'plainaddress',
    'no-at-sign.com',
    'missing@dot',
    'two@@example.com',
    'spa ce@example.com',
    'trailingdot@example.',
    '@example.com',
    'user@.com',
    '',
    '   ',
    // trailing garbage after a valid prefix — only the `$` anchor rejects this.
    'a@b.c\nmore@evil.com',
  ])('rejects malformed new email %j via the regex guard', async (badEmail) => {
    const { svc, restClient } = makeService();
    await expect(
      svc.requestChange(UID, 'old@example.com', { ...valid, newEmail: badEmail }),
    ).rejects.toBeInstanceOf(EmailInvalidException);
    expect(restClient.signInWithPassword).not.toHaveBeenCalled();
  });

  it.each([
    'simple@example.com',
    'user.name+tag@sub.example.co.uk',
    'a@b.c',
  ])('accepts well-formed new email %j through the regex guard', async (goodEmail) => {
    const { svc, auth } = makeService();
    await svc.requestChange(UID, 'old@example.com', { ...valid, newEmail: goodEmail });
    expect(auth.generateVerifyAndChangeEmailLink).toHaveBeenCalledWith(
      'old@example.com',
      goodEmail,
      expect.anything(),
    );
  });

  it('normalizes the new email (trim + lowercase) before reauth, link-gen and send', async () => {
    const { svc, auth, transport } = makeService();
    await svc.requestChange(UID, 'old@example.com', {
      ...valid,
      newEmail: '  NEW@Example.COM  ',
    });
    expect(auth.generateVerifyAndChangeEmailLink).toHaveBeenCalledWith(
      'old@example.com',
      'new@example.com',
      expect.anything(),
    );
    expect(transport.sendEmailChangeVerificationEmail).toHaveBeenCalledWith({
      to: 'new@example.com',
      verificationUrl: 'https://app/verify?oobCode=x',
    });
  });

  it('treats a whitespace/case-only difference from the current email as unchanged', async () => {
    const { svc, restClient } = makeService();
    await expect(
      svc.requestChange(UID, '  Old@Example.com ', { ...valid, newEmail: ' OLD@example.COM ' }),
    ).rejects.toBeInstanceOf(EmailUnchangedException);
    expect(restClient.signInWithPassword).not.toHaveBeenCalled();
  });

  it('wraps a non-INVALID_CREDENTIALS AuthException from reauth as EmailChangeFailedException', async () => {
    const signIn = vi.fn().mockRejectedValue(new AuthException('NETWORK', 'down', 503));
    const { svc } = makeService({ signIn });
    await expect(svc.requestChange(UID, 'old@example.com', valid)).rejects.toBeInstanceOf(
      EmailChangeFailedException,
    );
  });

  it('wraps a non-AuthException reauth error as EmailChangeFailedException', async () => {
    const signIn = vi.fn().mockRejectedValue(new Error('boom'));
    const { svc } = makeService({ signIn });
    await expect(svc.requestChange(UID, 'old@example.com', valid)).rejects.toBeInstanceOf(
      EmailChangeFailedException,
    );
  });

  it('wraps a non-already-exists link-gen error as EmailChangeFailedException', async () => {
    const genLink = vi.fn().mockRejectedValue({ code: 'auth/internal-error' });
    const { svc } = makeService({ genLink });
    await expect(svc.requestChange(UID, 'old@example.com', valid)).rejects.toBeInstanceOf(
      EmailChangeFailedException,
    );
  });

  it('wraps a link-gen error with no code property as EmailChangeFailedException', async () => {
    const genLink = vi.fn().mockRejectedValue(new Error('opaque'));
    const { svc } = makeService({ genLink });
    await expect(svc.requestChange(UID, 'old@example.com', valid)).rejects.toBeInstanceOf(
      EmailChangeFailedException,
    );
  });

  it('wraps a failure to send the verification email as EmailChangeFailedException', async () => {
    const sendEmail = vi.fn().mockRejectedValue(new Error('smtp down'));
    const { svc } = makeService({ sendEmail });
    await expect(svc.requestChange(UID, 'old@example.com', valid)).rejects.toBeInstanceOf(
      EmailChangeFailedException,
    );
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
    const { svc, auth, transport, restClient } = makeService();
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
    // reauth uses the exact { email, password } object (kills the empty-object mutant).
    expect(restClient.signInWithPassword).toHaveBeenCalledWith({
      email: 'old@example.com',
      password: 'pw',
    });
  });

  it('a valid new email passes the guard and reaches reauth (kills the always-false condition)', async () => {
    const { svc, restClient } = makeService();
    await svc.requestChange(UID, 'old@example.com', valid);
    expect(restClient.signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it('a malformed email is stopped AT the guard — reauth/link-gen/send are never reached', async () => {
    // If the guard condition is forced to `false`, this malformed email would
    // flow through to reauth/link-gen; asserting they are NOT called pins the guard.
    const { svc, restClient, auth, transport } = makeService();
    await expect(
      svc.requestChange(UID, 'old@example.com', { ...valid, newEmail: 'nope' }),
    ).rejects.toBeInstanceOf(EmailInvalidException);
    expect(restClient.signInWithPassword).not.toHaveBeenCalled();
    expect(auth.generateVerifyAndChangeEmailLink).not.toHaveBeenCalled();
    expect(transport.sendEmailChangeVerificationEmail).not.toHaveBeenCalled();
  });

  it('continueUrl honours LEARNWREN_PUBLIC_URL when set', async () => {
    const prev = process.env['LEARNWREN_PUBLIC_URL'];
    process.env['LEARNWREN_PUBLIC_URL'] = 'https://learnwren.test';
    try {
      const { svc, auth } = makeService();
      await svc.requestChange(UID, 'old@example.com', valid);
      expect(auth.generateVerifyAndChangeEmailLink).toHaveBeenCalledWith(
        'old@example.com',
        'new@example.com',
        { url: 'https://learnwren.test/settings/profile/email-changed' },
      );
    } finally {
      if (prev === undefined) delete process.env['LEARNWREN_PUBLIC_URL'];
      else process.env['LEARNWREN_PUBLIC_URL'] = prev;
    }
  });

  it('continueUrl falls back to http://localhost:4200 when LEARNWREN_PUBLIC_URL is unset', async () => {
    const prev = process.env['LEARNWREN_PUBLIC_URL'];
    delete process.env['LEARNWREN_PUBLIC_URL'];
    try {
      const { svc, auth } = makeService();
      await svc.requestChange(UID, 'old@example.com', valid);
      expect(auth.generateVerifyAndChangeEmailLink).toHaveBeenCalledWith(
        'old@example.com',
        'new@example.com',
        { url: 'http://localhost:4200/settings/profile/email-changed' },
      );
    } finally {
      if (prev === undefined) delete process.env['LEARNWREN_PUBLIC_URL'];
      else process.env['LEARNWREN_PUBLIC_URL'] = prev;
    }
  });

  it('an Error reauth failure carries the original error as cause', async () => {
    const boom = new Error('network down');
    const signIn = vi.fn().mockRejectedValue(boom);
    const { svc } = makeService({ signIn });
    await expect(svc.requestChange(UID, 'old@example.com', valid)).rejects.toMatchObject({
      code: 'EMAIL_CHANGE_FAILED',
      cause: boom,
    });
  });

  it('an Error link-gen failure carries the original error as cause', async () => {
    const boom = new Error('opaque');
    const genLink = vi.fn().mockRejectedValue(boom);
    const { svc } = makeService({ genLink });
    await expect(svc.requestChange(UID, 'old@example.com', valid)).rejects.toMatchObject({
      code: 'EMAIL_CHANGE_FAILED',
      cause: boom,
    });
  });

  it('an Error send failure carries the original error as cause', async () => {
    const boom = new Error('smtp down');
    const sendEmail = vi.fn().mockRejectedValue(boom);
    const { svc } = makeService({ sendEmail });
    await expect(svc.requestChange(UID, 'old@example.com', valid)).rejects.toMatchObject({
      code: 'EMAIL_CHANGE_FAILED',
      cause: boom,
    });
  });

  it('a string link-gen error (typeof !== object) is NOT a firebase error → EmailChangeFailed', async () => {
    const genLink = vi.fn().mockRejectedValue('auth/email-already-exists');
    const { svc } = makeService({ genLink });
    await expect(svc.requestChange(UID, 'old@example.com', valid)).rejects.toBeInstanceOf(
      EmailChangeFailedException,
    );
  });

  it('a null link-gen error (err === null) is NOT a firebase error → EmailChangeFailed', async () => {
    const genLink = vi.fn().mockRejectedValue(null);
    const { svc } = makeService({ genLink });
    await expect(svc.requestChange(UID, 'old@example.com', valid)).rejects.toBeInstanceOf(
      EmailChangeFailedException,
    );
  });
});

describe('EmailChangeService.confirmChange', () => {
  it('returns changed:false and does nothing when the email has not swapped', async () => {
    const { svc, auth } = makeService();
    auth.getUser = vi.fn().mockResolvedValue({ email: 'old@example.com', emailVerified: true });
    const res = await svc.confirmChange(UID, 'old@example.com');
    expect(res).toEqual({ changed: false });
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('returns changed:false when the new email is not yet verified', async () => {
    const { svc, auth } = makeService();
    auth.getUser = vi.fn().mockResolvedValue({ email: 'new@example.com', emailVerified: false });
    const res = await svc.confirmChange(UID, 'old@example.com');
    expect(res).toEqual({ changed: false });
  });

  it('returns changed:false when the user record has no email', async () => {
    const { svc, auth } = makeService();
    auth.getUser = vi.fn().mockResolvedValue({ email: undefined, emailVerified: true });
    const res = await svc.confirmChange(UID, 'old@example.com');
    expect(res).toEqual({ changed: false });
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('treats a whitespace/case-only cookie email difference as no swap (normalized compare)', async () => {
    const { svc, auth } = makeService();
    auth.getUser = vi.fn().mockResolvedValue({ email: 'Old@Example.com', emailVerified: true });
    const res = await svc.confirmChange(UID, '  old@example.COM  ');
    expect(res).toEqual({ changed: false });
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('treats emailVerified !== true (e.g. truthy non-boolean) as not verified', async () => {
    const { svc, auth } = makeService();
    // emailVerified is a truthy string, not the boolean true → strict === guard must reject it.
    auth.getUser = vi
      .fn()
      .mockResolvedValue({ email: 'new@example.com', emailVerified: 'yes' });
    const res = await svc.confirmChange(UID, 'old@example.com');
    expect(res).toEqual({ changed: false });
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('syncs Firestore, revokes tokens, and returns changed:true on a verified swap', async () => {
    const { svc, auth } = makeService();
    const update = vi.fn().mockResolvedValue(undefined);
    const docFn = vi.fn().mockReturnValue({ update });
    const collection = vi.fn().mockReturnValue({ doc: docFn });
    auth.getUser = vi.fn().mockResolvedValue({ email: 'new@example.com', emailVerified: true });
    // Re-point firestore so we can assert the update payload + targeted collection/doc.
    (svc as unknown as { firestore: unknown }).firestore = { collection };
    const res = await svc.confirmChange(UID, 'old@example.com');
    expect(res).toEqual({ changed: true, email: 'new@example.com' });
    expect(collection).toHaveBeenCalledWith('users');
    expect(collection).not.toHaveBeenCalledWith('');
    expect(docFn).toHaveBeenCalledWith(UID);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com', updatedAt: expect.any(String) }),
    );
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith(UID);
  });
});
