import { describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';

import { AuthException, EmailInUseError, type IdentityProvider } from '@learnwren/api-auth';
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
  verifyPassword?: () => Promise<unknown>;
  genLink?: () => Promise<string>;
  sendEmail?: () => Promise<void>;
} = {}) {
  const identity = {
    createEmailActionLink: overrides.genLink ?? vi.fn().mockResolvedValue('https://app/verify?oobCode=x'),
    getUser: vi.fn(),
    revokeAllSessions: vi.fn().mockResolvedValue(undefined),
  } as unknown as IdentityProvider;
  const verification = {
    verifyPassword: overrides.verifyPassword ?? vi.fn().mockResolvedValue('t'),
    clearFailures: vi.fn().mockResolvedValue(undefined),
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
    identity,
    firestore as never,
    verification as never,
    transport as never,
  );
  return { svc, auth: identity, verification, transport };
}

describe('EmailChangeService.requestChange', () => {
  const valid = { newEmail: 'new@example.com', currentPassword: 'pw' };

  it('rejects an invalid new email before touching Firebase', async () => {
    const { svc, verification } = makeService();
    await expect(svc.requestChange(UID, 'old@example.com', { ...valid, newEmail: 'nope' }))
      .rejects.toBeInstanceOf(EmailInvalidException);
    expect(verification.verifyPassword).not.toHaveBeenCalled();
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
    const { svc, verification } = makeService();
    await expect(
      svc.requestChange(UID, 'old@example.com', { ...valid, newEmail: badEmail }),
    ).rejects.toBeInstanceOf(EmailInvalidException);
    expect(verification.verifyPassword).not.toHaveBeenCalled();
  });

  it.each([
    'simple@example.com',
    'user.name+tag@sub.example.co.uk',
    'a@b.c',
  ])('accepts well-formed new email %j through the regex guard', async (goodEmail) => {
    const { svc, auth } = makeService();
    await svc.requestChange(UID, 'old@example.com', { ...valid, newEmail: goodEmail });
    expect(auth.createEmailActionLink).toHaveBeenCalledWith(
      'change-email',
      'old@example.com',
      '/settings/profile/email-changed',
      goodEmail,
    );
  });

  it('normalizes the new email (trim + lowercase) before reauth, link-gen and send', async () => {
    const { svc, auth, transport } = makeService();
    await svc.requestChange(UID, 'old@example.com', {
      ...valid,
      newEmail: '  NEW@Example.COM  ',
    });
    expect(auth.createEmailActionLink).toHaveBeenCalledWith(
      'change-email',
      'old@example.com',
      '/settings/profile/email-changed',
      'new@example.com',
    );
    expect(transport.sendEmailChangeVerificationEmail).toHaveBeenCalledWith({
      to: 'new@example.com',
      verificationUrl: 'https://app/verify?oobCode=x',
    });
  });

  it('treats a whitespace/case-only difference from the current email as unchanged', async () => {
    const { svc, verification } = makeService();
    await expect(
      svc.requestChange(UID, '  Old@Example.com ', { ...valid, newEmail: ' OLD@example.COM ' }),
    ).rejects.toBeInstanceOf(EmailUnchangedException);
    expect(verification.verifyPassword).not.toHaveBeenCalled();
  });

  it('wraps a non-INVALID_CREDENTIALS AuthException from reauth as EmailChangeFailedException', async () => {
    const verifyPassword = vi.fn().mockRejectedValue(new AuthException('NETWORK', 'down', 503));
    const { svc } = makeService({ verifyPassword });
    await expect(svc.requestChange(UID, 'old@example.com', valid)).rejects.toBeInstanceOf(
      EmailChangeFailedException,
    );
  });

  it('wraps a non-AuthException reauth error as EmailChangeFailedException', async () => {
    const verifyPassword = vi.fn().mockRejectedValue(new Error('boom'));
    const { svc } = makeService({ verifyPassword });
    await expect(svc.requestChange(UID, 'old@example.com', valid)).rejects.toBeInstanceOf(
      EmailChangeFailedException,
    );
  });

  it('wraps a non-EmailInUseError link-gen error as EmailChangeFailedException', async () => {
    const genLink = vi.fn().mockRejectedValue(new Error('internal error'));
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
    const verifyPassword = vi.fn().mockRejectedValue(
      new AuthException('INVALID_CREDENTIALS', 'bad', 401),
    );
    const { svc } = makeService({ verifyPassword });
    await expect(svc.requestChange(UID, 'old@example.com', valid))
      .rejects.toBeInstanceOf(CurrentPasswordInvalidException);
  });

  it('maps EmailInUseError to EMAIL_ALREADY_IN_USE', async () => {
    const genLink = vi.fn().mockRejectedValue(new EmailInUseError());
    const { svc } = makeService({ genLink });
    await expect(svc.requestChange(UID, 'old@example.com', valid))
      .rejects.toBeInstanceOf(EmailAlreadyInUseException);
  });

  it('generates the verify-and-change link and emails the NEW address on success', async () => {
    const { svc, auth, transport, verification } = makeService();
    await svc.requestChange(UID, 'old@example.com', valid);
    expect(auth.createEmailActionLink).toHaveBeenCalledWith(
      'change-email',
      'old@example.com',
      '/settings/profile/email-changed',
      'new@example.com',
    );
    expect(transport.sendEmailChangeVerificationEmail).toHaveBeenCalledWith({
      to: 'new@example.com',
      verificationUrl: 'https://app/verify?oobCode=x',
    });
    // reauth goes through the shared lockout-honoring seam with the exact args.
    expect(verification.verifyPassword).toHaveBeenCalledWith('old@example.com', 'pw');
    // …and a successful re-auth resets the shared lockout counter.
    expect(verification.clearFailures).toHaveBeenCalledWith('old@example.com');
  });

  it('rethrows ACCOUNT_LOCKED from the lockout-honoring re-auth unchanged (renders via the AuthException filter)', async () => {
    const locked = new AuthException('ACCOUNT_LOCKED', 'Account is temporarily locked.', 423);
    const verifyPassword = vi.fn().mockRejectedValue(locked);
    const { svc, auth } = makeService({ verifyPassword });
    await expect(svc.requestChange(UID, 'old@example.com', valid)).rejects.toBe(locked);
    expect(auth.createEmailActionLink).not.toHaveBeenCalled();
  });

  it('does not clear the lockout counter when re-auth fails', async () => {
    const verifyPassword = vi
      .fn()
      .mockRejectedValue(new AuthException('INVALID_CREDENTIALS', 'bad', 401));
    const { svc, verification } = makeService({ verifyPassword });
    await expect(svc.requestChange(UID, 'old@example.com', valid)).rejects.toBeInstanceOf(
      CurrentPasswordInvalidException,
    );
    expect(verification.clearFailures).not.toHaveBeenCalled();
  });

  it('a valid new email passes the guard and reaches reauth (kills the always-false condition)', async () => {
    const { svc, verification } = makeService();
    await svc.requestChange(UID, 'old@example.com', valid);
    expect(verification.verifyPassword).toHaveBeenCalledTimes(1);
  });

  it('a malformed email is stopped AT the guard — reauth/link-gen/send are never reached', async () => {
    // If the guard condition is forced to `false`, this malformed email would
    // flow through to reauth/link-gen; asserting they are NOT called pins the guard.
    const { svc, verification, auth, transport } = makeService();
    await expect(
      svc.requestChange(UID, 'old@example.com', { ...valid, newEmail: 'nope' }),
    ).rejects.toBeInstanceOf(EmailInvalidException);
    expect(verification.verifyPassword).not.toHaveBeenCalled();
    expect(auth.createEmailActionLink).not.toHaveBeenCalled();
    expect(transport.sendEmailChangeVerificationEmail).not.toHaveBeenCalled();
  });

  it('an Error reauth failure carries the original error as cause', async () => {
    const boom = new Error('network down');
    const verifyPassword = vi.fn().mockRejectedValue(boom);
    const { svc } = makeService({ verifyPassword });
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
});

describe('EmailChangeService.confirmChange', () => {
  it('returns changed:false and does nothing when the email has not swapped', async () => {
    const { svc, auth } = makeService();
    auth.getUser = vi.fn().mockResolvedValue({ email: 'old@example.com', emailVerified: true });
    const res = await svc.confirmChange(UID, 'old@example.com');
    expect(res).toEqual({ changed: false });
    expect(auth.revokeAllSessions).not.toHaveBeenCalled();
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
    expect(auth.revokeAllSessions).not.toHaveBeenCalled();
  });

  it('treats a whitespace/case-only cookie email difference as no swap (normalized compare)', async () => {
    const { svc, auth } = makeService();
    auth.getUser = vi.fn().mockResolvedValue({ email: 'Old@Example.com', emailVerified: true });
    const res = await svc.confirmChange(UID, '  old@example.COM  ');
    expect(res).toEqual({ changed: false });
    expect(auth.revokeAllSessions).not.toHaveBeenCalled();
  });

  it('treats emailVerified !== true (e.g. truthy non-boolean) as not verified', async () => {
    const { svc, auth } = makeService();
    // emailVerified is a truthy string, not the boolean true → strict === guard must reject it.
    auth.getUser = vi
      .fn()
      .mockResolvedValue({ email: 'new@example.com', emailVerified: 'yes' });
    const res = await svc.confirmChange(UID, 'old@example.com');
    expect(res).toEqual({ changed: false });
    expect(auth.revokeAllSessions).not.toHaveBeenCalled();
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
    expect(auth.revokeAllSessions).toHaveBeenCalledWith(UID);
  });

  it('wraps a raw getUser failure as EmailChangeFailedException (enveloped, not a raw 500)', async () => {
    const { svc, auth } = makeService();
    const boom = new Error('auth backend down');
    auth.getUser = vi.fn().mockRejectedValue(boom);
    await expect(svc.confirmChange(UID, 'old@example.com')).rejects.toMatchObject({
      code: 'EMAIL_CHANGE_FAILED',
      cause: boom,
    });
  });

  it('wraps a null getUser result (unknown user) as EmailChangeFailedException', async () => {
    const { svc, auth } = makeService();
    auth.getUser = vi.fn().mockResolvedValue(null);
    await expect(svc.confirmChange(UID, 'old@example.com')).rejects.toBeInstanceOf(
      EmailChangeFailedException,
    );
  });

  it('wraps a raw Firestore update failure as EmailChangeFailedException', async () => {
    const { svc, auth } = makeService();
    const boom = new Error('firestore down');
    const update = vi.fn().mockRejectedValue(boom);
    const collection = vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ update }) });
    auth.getUser = vi.fn().mockResolvedValue({ email: 'new@example.com', emailVerified: true });
    (svc as unknown as { firestore: unknown }).firestore = { collection };
    await expect(svc.confirmChange(UID, 'old@example.com')).rejects.toMatchObject({
      code: 'EMAIL_CHANGE_FAILED',
      cause: boom,
    });
    // The change was NOT applied, so no tokens are revoked.
    expect(auth.revokeAllSessions).not.toHaveBeenCalled();
  });

  it('swallows a revokeAllSessions failure once the email change is applied (best-effort)', async () => {
    const { svc, auth } = makeService();
    auth.getUser = vi.fn().mockResolvedValue({ email: 'new@example.com', emailVerified: true });
    auth.revokeAllSessions = vi.fn().mockRejectedValue(new Error('revoke down'));
    const errSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const res = await svc.confirmChange(UID, 'old@example.com');
    expect(res).toEqual({ changed: true, email: 'new@example.com' });
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('[profile] email-change revoke failed'),
    );
    errSpy.mockRestore();
  });
});
