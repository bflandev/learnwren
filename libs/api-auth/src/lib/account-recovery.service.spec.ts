import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountRecoveryService } from './account-recovery.service';
import { AuthAttemptsRepository } from './auth-attempts.repository';
import { EMAIL_TRANSPORT } from './email-transport/email-transport';
import {
  EmailAlreadyExistsException,
  EmailActionTokenInvalidException,
  InternalAuthException,
  InvalidUnlockTokenException,
  PasswordTooLongException,
  TooManyRequestsException,
  UnlockTokenExpiredException,
  WeakPasswordException,
} from './errors/auth.exception';
import { EmailActionInvalidError, EmailInUseError } from './identity/identity.errors';
import { IDENTITY_PROVIDER, type IdentityProvider } from './identity/identity-provider.port';
import { PasswordPolicyService } from './password-policy.service';

function buildIdentity(overrides: Partial<IdentityProvider> = {}): IdentityProvider {
  return {
    getUserByEmail: vi.fn(async () => ({ uid: 'uid-123', email: 'alice@example.com', emailVerified: false })),
    createEmailActionLink: vi.fn(async () => 'https://verify/abc'),
    applyEmailAction: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as IdentityProvider;
}

function buildAttemptsMock(): {
  repo: AuthAttemptsRepository;
  spies: {
    emailHash: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
    redeemUnlockToken: ReturnType<typeof vi.fn>;
    recordResendVerification: ReturnType<typeof vi.fn>;
    recordPasswordResetRequest: ReturnType<typeof vi.fn>;
  };
} {
  const spies = {
    emailHash: vi.fn(() => 'HASH'),
    clear: vi.fn(async () => undefined),
    redeemUnlockToken: vi.fn(async () => ({ status: 'invalid' as const })),
    recordResendVerification: vi.fn(async () => ({ throttled: false })),
    recordPasswordResetRequest: vi.fn(async () => ({ throttled: false })),
  };
  return { repo: spies as unknown as AuthAttemptsRepository, spies };
}

function buildEmailTransport() {
  return {
    sendUnlockEmail: vi.fn(async () => undefined),
    sendVerificationEmail: vi.fn(async () => undefined),
    sendPasswordResetEmail: vi.fn(async () => undefined),
  };
}

async function buildService(
  identity: IdentityProvider,
  attempts: AuthAttemptsRepository,
  emailTransport: ReturnType<typeof buildEmailTransport>,
): Promise<AccountRecoveryService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      AccountRecoveryService,
      PasswordPolicyService,
      { provide: IDENTITY_PROVIDER, useValue: identity },
      { provide: AuthAttemptsRepository, useValue: attempts },
      { provide: EMAIL_TRANSPORT, useValue: emailTransport },
    ],
  }).compile();
  return moduleRef.get(AccountRecoveryService);
}

describe('AccountRecoveryService.resendVerification', () => {
  beforeEach(() => vi.clearAllMocks());

  async function build(opts: { getUserResult?: unknown | null; throttle?: { throttled: boolean } }) {
    const identity = buildIdentity({
      getUserByEmail: vi.fn(
        async () =>
          (opts.getUserResult === undefined
            ? { uid: 'uid-123', email: 'alice@example.com', emailVerified: false }
            : opts.getUserResult) as never,
      ),
    });
    const { repo: attempts, spies } = buildAttemptsMock();
    spies.recordResendVerification = vi.fn(async () => opts.throttle ?? { throttled: false });

    const emailTransport = buildEmailTransport();
    const service = await buildService(identity, attempts, emailTransport);
    return { service, identity, spies, emailTransport };
  }

  it('throws TOO_MANY_REQUESTS when within throttle window', async () => {
    const { service } = await build({ throttle: { throttled: true } });
    await expect(service.resendVerification('alice@example.com')).rejects.toBeInstanceOf(
      TooManyRequestsException,
    );
  });

  it('returns silently when user does not exist', async () => {
    const { service, identity } = await build({ getUserResult: null });
    await expect(service.resendVerification('ghost@example.com')).resolves.toBeUndefined();
    expect(identity.createEmailActionLink).not.toHaveBeenCalled();
  });

  it('returns silently when user is already verified', async () => {
    const { service, identity } = await build({
      getUserResult: { uid: 'uid-123', email: 'alice@example.com', emailVerified: true },
    });
    await expect(service.resendVerification('alice@example.com')).resolves.toBeUndefined();
    expect(identity.createEmailActionLink).not.toHaveBeenCalled();
  });

  it('generates a verification link via the identity provider when user exists and is unverified', async () => {
    const { service, identity, emailTransport } = await build({});
    await service.resendVerification('alice@example.com');
    // Pins the email-action-link call shape: a StringLiteral mutant on the
    // kind or the continuePath would survive without this.
    expect(identity.createEmailActionLink).toHaveBeenCalledWith('verify-email', 'alice@example.com', '/login');
    expect(emailTransport.sendVerificationEmail).toHaveBeenCalledWith({
      to: 'alice@example.com',
      verificationUrl: 'https://verify/abc',
    });
  });

  it('propagates a raw error from identity.getUserByEmail (does not silently succeed)', async () => {
    const { service, identity } = await build({});
    (identity.getUserByEmail as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('quota exceeded'));
    await expect(service.resendVerification('alice@example.com')).rejects.toThrow('quota exceeded');
  });

  it('throws InternalAuthException when createEmailActionLink fails', async () => {
    const { service, identity } = await build({});
    (identity.createEmailActionLink as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Admin SDK timeout'));
    await expect(service.resendVerification('alice@example.com')).rejects.toBeInstanceOf(
      InternalAuthException,
    );
  });
});

describe('AccountRecoveryService.requestPasswordReset', () => {
  beforeEach(() => vi.clearAllMocks());

  async function build(opts: { getUserResult?: unknown | null; throttle?: { throttled: boolean } }) {
    const identity = buildIdentity({
      getUserByEmail: vi.fn(
        async () =>
          (opts.getUserResult === undefined
            ? { uid: 'uid-123', email: 'alice@example.com', emailVerified: false }
            : opts.getUserResult) as never,
      ),
      createEmailActionLink: vi.fn(async () => 'https://reset/abc'),
    });
    const { repo: attempts, spies } = buildAttemptsMock();
    spies.recordPasswordResetRequest = vi.fn(async () => opts.throttle ?? { throttled: false });

    const emailTransport = buildEmailTransport();
    const service = await buildService(identity, attempts, emailTransport);
    return { service, identity, spies, emailTransport };
  }

  it('throws TOO_MANY_REQUESTS when within throttle window', async () => {
    const { service } = await build({ throttle: { throttled: true } });
    await expect(service.requestPasswordReset('alice@example.com')).rejects.toBeInstanceOf(
      TooManyRequestsException,
    );
  });

  it('returns silently when user does not exist', async () => {
    const { service, identity } = await build({ getUserResult: null });
    await expect(service.requestPasswordReset('ghost@example.com')).resolves.toBeUndefined();
    expect(identity.createEmailActionLink).not.toHaveBeenCalled();
  });

  it('generates a reset link via the identity provider when user exists', async () => {
    const { service, identity } = await build({});
    await service.requestPasswordReset('alice@example.com');
    // Pins the continuePath so a StringLiteral mutant cannot drop `?reset=ok`
    // (the signal the front-end uses to render the success state).
    expect(identity.createEmailActionLink).toHaveBeenCalledWith(
      'reset-password',
      'alice@example.com',
      '/login?reset=ok',
    );
  });

  it('dispatches the reset link via emailTransport.sendPasswordResetEmail', async () => {
    const { service, emailTransport } = await build({});
    await service.requestPasswordReset('alice@example.com');
    expect(emailTransport.sendPasswordResetEmail).toHaveBeenCalledWith({
      to: 'alice@example.com',
      resetUrl: 'https://reset/abc',
    });
  });

  it('propagates a raw error from identity.getUserByEmail (does not silently succeed)', async () => {
    const { service, identity } = await build({});
    (identity.getUserByEmail as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('quota exceeded'));
    await expect(service.requestPasswordReset('alice@example.com')).rejects.toThrow('quota exceeded');
  });

  it('throws InternalAuthException when createEmailActionLink fails', async () => {
    const { service, identity } = await build({});
    (identity.createEmailActionLink as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Admin SDK timeout'));
    await expect(service.requestPasswordReset('alice@example.com')).rejects.toBeInstanceOf(
      InternalAuthException,
    );
  });

  it('does NOT clear lockout state when called for a locked email', async () => {
    const { service, spies } = await build({});
    await service.requestPasswordReset('alice@example.com');
    expect(spies.clear).not.toHaveBeenCalled();
  });
});

describe('AccountRecoveryService.unlock', () => {
  beforeEach(() => vi.clearAllMocks());

  async function build(redeemResult: { status: 'ok' | 'invalid' | 'expired' }) {
    const identity = buildIdentity();
    const { repo: attempts, spies } = buildAttemptsMock();
    spies.redeemUnlockToken = vi.fn(async () => redeemResult);
    const emailTransport = buildEmailTransport();
    return buildService(identity, attempts, emailTransport);
  }

  it('returns void on a valid token', async () => {
    const service = await build({ status: 'ok' });
    await expect(service.unlock('GOOD-TOKEN')).resolves.toBeUndefined();
  });

  it('throws INVALID_UNLOCK_TOKEN on an unknown token', async () => {
    const service = await build({ status: 'invalid' });
    await expect(service.unlock('BAD-TOKEN')).rejects.toBeInstanceOf(InvalidUnlockTokenException);
  });

  it('throws UNLOCK_TOKEN_EXPIRED on a token whose lock has elapsed', async () => {
    const service = await build({ status: 'expired' });
    await expect(service.unlock('OLD-TOKEN')).rejects.toBeInstanceOf(UnlockTokenExpiredException);
  });
});

describe('AccountRecoveryService.sendUnlockEmail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves the canonical email via identity.getUserByEmail and sends the unlock link', async () => {
    const identity = buildIdentity({
      getUserByEmail: vi.fn(async () => ({ uid: 'uid-123', email: 'alice@example.com', emailVerified: true })),
    });
    const { repo: attempts } = buildAttemptsMock();
    const emailTransport = buildEmailTransport();
    const service = await buildService(identity, attempts, emailTransport);
    const lockedUntil = new Date(Date.now() + 15 * 60_000);

    await service.sendUnlockEmail('alice@example.com', 'utok-XYZ', lockedUntil);

    expect(emailTransport.sendUnlockEmail).toHaveBeenCalledWith({
      to: 'alice@example.com',
      unlockUrl: expect.stringContaining('/auth/unlock?token=utok-XYZ'),
      unlockAvailableAt: lockedUntil,
    });
  });

  it('does NOT send an unlock email when the locked-out email maps to no user (null)', async () => {
    const identity = buildIdentity({ getUserByEmail: vi.fn(async () => null) });
    const { repo: attempts } = buildAttemptsMock();
    const emailTransport = buildEmailTransport();
    const service = await buildService(identity, attempts, emailTransport);

    await service.sendUnlockEmail('typo@example.com', 'utok', new Date());

    expect(emailTransport.sendUnlockEmail).not.toHaveBeenCalled();
  });

  it('does NOT send an unlock email when identity.getUserByEmail throws', async () => {
    const identity = buildIdentity({
      getUserByEmail: vi.fn(async () => {
        throw new Error('provider down');
      }),
    });
    const { repo: attempts } = buildAttemptsMock();
    const emailTransport = buildEmailTransport();
    const service = await buildService(identity, attempts, emailTransport);

    await expect(service.sendUnlockEmail('alice@example.com', 'utok', new Date())).resolves.toBeUndefined();
    expect(emailTransport.sendUnlockEmail).not.toHaveBeenCalled();
  });

  it('does not crash when the email transport fails (best-effort)', async () => {
    const identity = buildIdentity({
      getUserByEmail: vi.fn(async () => ({ uid: 'uid-123', email: 'alice@example.com', emailVerified: true })),
    });
    const { repo: attempts } = buildAttemptsMock();
    const emailTransport = buildEmailTransport();
    emailTransport.sendUnlockEmail = vi.fn(async () => {
      throw new Error('SMTP down');
    });
    const service = await buildService(identity, attempts, emailTransport);

    await expect(
      service.sendUnlockEmail('alice@example.com', 'utok', new Date()),
    ).resolves.toBeUndefined();
  });
});

describe('AccountRecoveryService.sendInitialVerificationEmail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends the verification email and returns true on success', async () => {
    const identity = buildIdentity();
    const { repo: attempts } = buildAttemptsMock();
    const emailTransport = buildEmailTransport();
    const service = await buildService(identity, attempts, emailTransport);

    const sent = await service.sendInitialVerificationEmail('alice@example.com', 'uid-1' as never);

    expect(sent).toBe(true);
    expect(identity.createEmailActionLink).toHaveBeenCalledWith('verify-email', 'alice@example.com', '/login');
    expect(emailTransport.sendVerificationEmail).toHaveBeenCalledWith({
      to: 'alice@example.com',
      verificationUrl: 'https://verify/abc',
    });
  });

  it('returns false (best-effort) when link generation fails', async () => {
    const identity = buildIdentity({
      createEmailActionLink: vi.fn(async () => {
        throw new Error('Admin SDK down');
      }),
    });
    const { repo: attempts } = buildAttemptsMock();
    const emailTransport = buildEmailTransport();
    const service = await buildService(identity, attempts, emailTransport);

    const sent = await service.sendInitialVerificationEmail('alice@example.com', 'uid-1' as never);

    expect(sent).toBe(false);
    expect(emailTransport.sendVerificationEmail).not.toHaveBeenCalled();
  });
});

describe('AccountRecoveryService.applyEmailAction', () => {
  beforeEach(() => vi.clearAllMocks());

  async function build(identityOverrides: Partial<IdentityProvider> = {}) {
    const identity = buildIdentity(identityOverrides);
    const { repo: attempts } = buildAttemptsMock();
    const emailTransport = buildEmailTransport();
    const service = await buildService(identity, attempts, emailTransport);
    return { service, identity };
  }

  it('rejects an unknown mode with EmailActionTokenInvalidException without calling identity', async () => {
    const { service, identity } = await build();
    await expect(service.applyEmailAction('bogus-mode', 'tok')).rejects.toBeInstanceOf(
      EmailActionTokenInvalidException,
    );
    expect(identity.applyEmailAction).not.toHaveBeenCalled();
  });

  it('calls identity.applyEmailAction with no password for verify-email, even if one is supplied', async () => {
    const { service, identity } = await build();
    // A newPassword on a non-reset mode must never reach the identity provider.
    await service.applyEmailAction('verify-email', 'tok-1', 'Str0ng!Passw0rd');
    expect(identity.applyEmailAction).toHaveBeenCalledWith('verify-email', 'tok-1', undefined);
  });

  it('calls identity.applyEmailAction with no password for change-email, even if one is supplied', async () => {
    const { service, identity } = await build();
    await service.applyEmailAction('change-email', 'tok-2', 'Str0ng!Passw0rd');
    expect(identity.applyEmailAction).toHaveBeenCalledWith('change-email', 'tok-2', undefined);
  });

  it('throws WeakPasswordException with MIN_LENGTH unmet when reset-password has no newPassword', async () => {
    const { service, identity } = await build();
    const err = await service.applyEmailAction('reset-password', 'tok-3').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WeakPasswordException);
    // An absent newPassword must be treated as '' (too short), not any other placeholder.
    expect((err as WeakPasswordException).details?.unmetRequirements).toContain('MIN_LENGTH');
    expect(identity.applyEmailAction).not.toHaveBeenCalled();
  });

  it('throws WeakPasswordException when the reset password fails policy', async () => {
    const { service, identity } = await build();
    await expect(
      service.applyEmailAction('reset-password', 'tok-4', 'weak'),
    ).rejects.toBeInstanceOf(WeakPasswordException);
    expect(identity.applyEmailAction).not.toHaveBeenCalled();
  });

  it('throws PasswordTooLongException when the reset password exceeds PASSWORD_MAX', async () => {
    const { service, identity } = await build();
    const tooLong = `Aa1!${'x'.repeat(260)}`;
    await expect(
      service.applyEmailAction('reset-password', 'tok-5', tooLong),
    ).rejects.toBeInstanceOf(PasswordTooLongException);
    expect(identity.applyEmailAction).not.toHaveBeenCalled();
  });

  it('calls identity.applyEmailAction with the new password on a valid reset', async () => {
    const { service, identity } = await build();
    await service.applyEmailAction('reset-password', 'tok-6', 'Str0ng!Passw0rd');
    expect(identity.applyEmailAction).toHaveBeenCalledWith('reset-password', 'tok-6', 'Str0ng!Passw0rd');
  });

  it('maps EmailActionInvalidError to EmailActionTokenInvalidException', async () => {
    const { service } = await build({
      applyEmailAction: vi.fn(async () => {
        throw new EmailActionInvalidError();
      }),
    });
    await expect(service.applyEmailAction('verify-email', 'tok-7')).rejects.toBeInstanceOf(
      EmailActionTokenInvalidException,
    );
  });

  it('maps EmailInUseError to EmailAlreadyExistsException', async () => {
    const { service } = await build({
      applyEmailAction: vi.fn(async () => {
        throw new EmailInUseError();
      }),
    });
    await expect(service.applyEmailAction('change-email', 'tok-8')).rejects.toBeInstanceOf(
      EmailAlreadyExistsException,
    );
  });

  it('logs and throws InternalAuthException for any other identity error', async () => {
    const { service } = await build({
      applyEmailAction: vi.fn(async () => {
        throw new Error('db exploded');
      }),
    });
    await expect(service.applyEmailAction('verify-email', 'tok-9')).rejects.toBeInstanceOf(
      InternalAuthException,
    );
  });

  it('never logs the raw token', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service } = await build();
    const secretToken = 'SECRET-TOKEN-VALUE';
    await service.applyEmailAction('verify-email', secretToken);
    const allLoggedText = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().join(' ');
    expect(allLoggedText).not.toContain(secretToken);
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
