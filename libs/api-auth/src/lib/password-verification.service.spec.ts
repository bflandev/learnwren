import { describe, expect, it, vi } from 'vitest';

import { PasswordVerificationService } from './password-verification.service';
import {
  AccountLockedException,
  InvalidCredentialsException,
  InternalAuthException,
} from './errors/auth.exception';
import type { IdentityProvider } from './identity/identity-provider.port';

const EMAIL = 'alice@example.com';
const PASSWORD = 'Aa1!aaaaaaaa';
const PROOF = { uid: 'uid-123' };

function makeService(overrides: {
  verifyPassword?: ReturnType<typeof vi.fn>;
  read?: ReturnType<typeof vi.fn>;
  recordFailure?: ReturnType<typeof vi.fn>;
} = {}) {
  const identity = {
    verifyPassword: overrides.verifyPassword ?? vi.fn(async () => PROOF),
  } as unknown as IdentityProvider;
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
    identity,
    attempts as never,
    recovery as never,
  );
  return { svc, identity, attempts, recovery };
}

describe('PasswordVerificationService.verifyPassword', () => {
  it('returns the PasswordProof on success without recording a failure', async () => {
    const { svc, identity, attempts } = makeService();

    await expect(svc.verifyPassword(EMAIL, PASSWORD)).resolves.toEqual(PROOF);

    expect(attempts.emailHash).toHaveBeenCalledWith(EMAIL);
    expect(identity.verifyPassword).toHaveBeenCalledWith(EMAIL, PASSWORD);
    expect(attempts.recordFailure).not.toHaveBeenCalled();
    expect(attempts.clear).not.toHaveBeenCalled();
  });

  it('rejects with AccountLockedException BEFORE calling the identity provider when a lock window is active', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const read = vi.fn(async () => ({ failedCount: 3, lockedUntil: future }));
    const { svc, identity, attempts } = makeService({ read });

    await expect(svc.verifyPassword(EMAIL, PASSWORD)).rejects.toBeInstanceOf(
      AccountLockedException,
    );
    expect(read).toHaveBeenCalledWith('HASH');
    expect(identity.verifyPassword).not.toHaveBeenCalled();
    expect(attempts.recordFailure).not.toHaveBeenCalled();
  });

  it('records a failure and rethrows on INVALID_CREDENTIALS below the threshold', async () => {
    const verifyPassword = vi.fn(async () => {
      throw new InvalidCredentialsException();
    });
    const { svc, attempts, recovery } = makeService({ verifyPassword });

    await expect(svc.verifyPassword(EMAIL, PASSWORD)).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
    expect(attempts.recordFailure).toHaveBeenCalledWith('HASH');
    expect(recovery.sendUnlockEmail).not.toHaveBeenCalled();
  });

  it('sends the unlock email and throws AccountLockedException when the failure trips the lock', async () => {
    const lockedUntil = new Date(Date.now() + 15 * 60_000);
    const verifyPassword = vi.fn(async () => {
      throw new InvalidCredentialsException();
    });
    const recordFailure = vi.fn(async () => ({
      locked: true,
      unlockToken: 'utok',
      lockedUntil,
    }));
    const { svc, recovery } = makeService({ verifyPassword, recordFailure });

    const err = await svc.verifyPassword(EMAIL, PASSWORD).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AccountLockedException);
    expect((err as AccountLockedException).details?.unlockAvailableAt).toBe(
      lockedUntil.toISOString(),
    );
    expect(recovery.sendUnlockEmail).toHaveBeenCalledWith(EMAIL, 'utok', lockedUntil);
  });

  it('propagates a non-credentials error without recording a failure', async () => {
    const verifyPassword = vi.fn(async () => {
      throw new InternalAuthException();
    });
    const { svc, attempts } = makeService({ verifyPassword });

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
