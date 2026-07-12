import { describe, expect, it, vi } from 'vitest';

import { PasswordVerificationService } from './password-verification.service';
import {
  AccountLockedException,
  InvalidCredentialsException,
  InternalAuthException,
} from './errors/auth.exception';

const EMAIL = 'alice@example.com';
const PASSWORD = 'Aa1!aaaaaaaa';

function makeService(overrides: {
  signIn?: ReturnType<typeof vi.fn>;
  read?: ReturnType<typeof vi.fn>;
  recordFailure?: ReturnType<typeof vi.fn>;
} = {}) {
  const restClient = {
    signInWithPassword:
      overrides.signIn ?? vi.fn(async () => ({ idToken: 'ID-TOKEN' })),
  };
  const attempts = {
    emailHash: vi.fn(() => 'HASH'),
    read: overrides.read ?? vi.fn(async () => null),
    recordFailure: overrides.recordFailure ?? vi.fn(async () => ({ locked: false })),
    clear: vi.fn(async () => undefined),
  };
  const recovery = {
    sendUnlockEmail: vi.fn(async () => undefined),
  };
  const svc = new PasswordVerificationService(
    restClient as never,
    attempts as never,
    recovery as never,
  );
  return { svc, restClient, attempts, recovery };
}

describe('PasswordVerificationService.verifyPassword', () => {
  it('returns the ID token on success without recording a failure', async () => {
    const { svc, restClient, attempts } = makeService();

    await expect(svc.verifyPassword(EMAIL, PASSWORD)).resolves.toBe('ID-TOKEN');

    expect(attempts.emailHash).toHaveBeenCalledWith(EMAIL);
    expect(restClient.signInWithPassword).toHaveBeenCalledWith({
      email: EMAIL,
      password: PASSWORD,
    });
    expect(attempts.recordFailure).not.toHaveBeenCalled();
    expect(attempts.clear).not.toHaveBeenCalled();
  });

  it('rejects with AccountLockedException BEFORE calling Firebase when a lock window is active', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const read = vi.fn(async () => ({ failedCount: 3, lockedUntil: future }));
    const { svc, restClient, attempts } = makeService({ read });

    await expect(svc.verifyPassword(EMAIL, PASSWORD)).rejects.toBeInstanceOf(
      AccountLockedException,
    );
    expect(read).toHaveBeenCalledWith('HASH');
    expect(restClient.signInWithPassword).not.toHaveBeenCalled();
    expect(attempts.recordFailure).not.toHaveBeenCalled();
  });

  it('records a failure and rethrows on INVALID_CREDENTIALS below the threshold', async () => {
    const signIn = vi.fn(async () => {
      throw new InvalidCredentialsException();
    });
    const { svc, attempts, recovery } = makeService({ signIn });

    await expect(svc.verifyPassword(EMAIL, PASSWORD)).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
    expect(attempts.recordFailure).toHaveBeenCalledWith('HASH');
    expect(recovery.sendUnlockEmail).not.toHaveBeenCalled();
  });

  it('sends the unlock email and throws AccountLockedException when the failure trips the lock', async () => {
    const lockedUntil = new Date(Date.now() + 15 * 60_000);
    const signIn = vi.fn(async () => {
      throw new InvalidCredentialsException();
    });
    const recordFailure = vi.fn(async () => ({
      locked: true,
      unlockToken: 'utok',
      lockedUntil,
    }));
    const { svc, recovery } = makeService({ signIn, recordFailure });

    const err = await svc.verifyPassword(EMAIL, PASSWORD).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AccountLockedException);
    expect((err as AccountLockedException).details?.unlockAvailableAt).toBe(
      lockedUntil.toISOString(),
    );
    expect(recovery.sendUnlockEmail).toHaveBeenCalledWith(EMAIL, 'utok', lockedUntil);
  });

  it('propagates a non-credentials error without recording a failure', async () => {
    const signIn = vi.fn(async () => {
      throw new InternalAuthException();
    });
    const { svc, attempts } = makeService({ signIn });

    await expect(svc.verifyPassword(EMAIL, PASSWORD)).rejects.toBeInstanceOf(
      InternalAuthException,
    );
    expect(attempts.recordFailure).not.toHaveBeenCalled();
  });
});

describe('PasswordVerificationService.clearFailures', () => {
  it('clears the attempts doc keyed by the email hash', async () => {
    const { svc, attempts } = makeService();

    await svc.clearFailures(EMAIL);

    expect(attempts.emailHash).toHaveBeenCalledWith(EMAIL);
    expect(attempts.clear).toHaveBeenCalledWith('HASH');
  });
});
