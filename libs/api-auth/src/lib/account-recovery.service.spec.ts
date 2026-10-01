import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountRecoveryService } from './account-recovery.service';
import { AuthAttemptsRepository } from './auth-attempts.repository';
import { EMAIL_TRANSPORT } from './email-transport/email-transport';
import {
  InternalAuthException,
  InvalidUnlockTokenException,
  TooManyRequestsException,
  UnlockTokenExpiredException,
} from './errors/auth.exception';
import { IDENTITY_PROVIDER, type IdentityProvider } from './identity/identity-provider.port';

function buildIdentity(overrides: Partial<IdentityProvider> = {}): IdentityProvider {
  return {
    getUserByEmail: vi.fn(async () => ({ uid: 'uid-123', email: 'alice@example.com', emailVerified: false })),
    createEmailActionLink: vi.fn(async () => 'https://verify/abc'),
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
