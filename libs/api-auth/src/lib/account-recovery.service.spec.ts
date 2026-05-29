import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FIREBASE_AUTH } from '@learnwren/api-firebase';

import { AccountRecoveryService } from './account-recovery.service';
import { AuthAttemptsRepository } from './auth-attempts.repository';
import { EMAIL_TRANSPORT } from './email-transport/email-transport';
import {
  InternalAuthException,
  InvalidUnlockTokenException,
  TooManyRequestsException,
  UnlockTokenExpiredException,
} from './errors/auth.exception';

interface FakeAuth {
  getUserByEmail?: ReturnType<typeof vi.fn>;
  generateEmailVerificationLink: ReturnType<typeof vi.fn>;
  generatePasswordResetLink?: ReturnType<typeof vi.fn>;
}

function buildFakeAuth(): FakeAuth {
  return {
    generateEmailVerificationLink: vi.fn(async () => 'https://verify/abc'),
  };
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
  auth: FakeAuth,
  attempts: AuthAttemptsRepository,
  emailTransport: ReturnType<typeof buildEmailTransport>,
): Promise<AccountRecoveryService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      AccountRecoveryService,
      { provide: FIREBASE_AUTH, useValue: auth },
      { provide: AuthAttemptsRepository, useValue: attempts },
      { provide: EMAIL_TRANSPORT, useValue: emailTransport },
    ],
  }).compile();
  return moduleRef.get(AccountRecoveryService);
}

describe('AccountRecoveryService.resendVerification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['LEARNWREN_PUBLIC_URL'];
  });

  async function build(opts: {
    getUserResult?: unknown | 'not-found';
    throttle?: { throttled: boolean };
  }) {
    const auth = buildFakeAuth();
    const { repo: attempts, spies } = buildAttemptsMock();
    spies.recordResendVerification = vi.fn(async () => opts.throttle ?? { throttled: false });

    if (opts.getUserResult === 'not-found') {
      auth.getUserByEmail = vi.fn(async () => {
        throw Object.assign(new Error('user-not-found'), { code: 'auth/user-not-found' });
      });
    } else {
      auth.getUserByEmail = vi.fn(
        async () =>
          opts.getUserResult ?? { uid: 'uid-123', email: 'alice@example.com', emailVerified: false },
      );
    }

    const emailTransport = buildEmailTransport();
    const service = await buildService(auth, attempts, emailTransport);
    return { service, auth, spies, emailTransport };
  }

  it('throws TOO_MANY_REQUESTS when within throttle window', async () => {
    const { service } = await build({ throttle: { throttled: true } });
    await expect(service.resendVerification('alice@example.com')).rejects.toBeInstanceOf(
      TooManyRequestsException,
    );
  });

  it('returns silently when user does not exist', async () => {
    const { service, auth } = await build({ getUserResult: 'not-found' });
    await expect(service.resendVerification('ghost@example.com')).resolves.toBeUndefined();
    expect(auth.generateEmailVerificationLink).not.toHaveBeenCalled();
  });

  it('returns silently when user is already verified', async () => {
    const { service, auth } = await build({
      getUserResult: { uid: 'uid-123', email: 'alice@example.com', emailVerified: true },
    });
    await expect(service.resendVerification('alice@example.com')).resolves.toBeUndefined();
    expect(auth.generateEmailVerificationLink).not.toHaveBeenCalled();
  });

  it('generates a verification link when user exists and is unverified', async () => {
    const { service, auth, emailTransport } = await build({});
    await service.resendVerification('alice@example.com');
    // Pin the exact URL — kills LogicalOperator + StringLiteral mutants on
    // the `process.env['LEARNWREN_PUBLIC_URL'] ?? 'http://localhost:4200'`
    // default, and ObjectLiteral mutants on the link options.
    expect(auth.generateEmailVerificationLink).toHaveBeenCalledWith('alice@example.com', {
      url: 'http://localhost:4200/login',
    });
    // Pin the transport payload — an ObjectLiteral mutant replacing the
    // `{ to, verificationUrl }` argument with `{}` would otherwise survive
    // (the test would only know the transport was called, not with what).
    expect(emailTransport.sendVerificationEmail).toHaveBeenCalledWith({
      to: 'alice@example.com',
      verificationUrl: 'https://verify/abc',
    });
  });

  it('honours LEARNWREN_PUBLIC_URL when building the continue URL', async () => {
    // Drives the non-default branch of `process.env['LEARNWREN_PUBLIC_URL'] ??
    // 'http://localhost:4200'`. Without this, a StringLiteral mutant changing
    // the env-var KEY to '' survives (env unset → both read undefined → default).
    const { service, auth } = await build({});
    process.env['LEARNWREN_PUBLIC_URL'] = 'https://app.learnwren.com';
    await service.resendVerification('alice@example.com');
    expect(auth.generateEmailVerificationLink).toHaveBeenCalledWith('alice@example.com', {
      url: 'https://app.learnwren.com/login',
    });
    delete process.env['LEARNWREN_PUBLIC_URL'];
  });

  it('propagates a non-user-not-found Firebase error from getUserByEmail (does not silently succeed)', async () => {
    // The catch only swallows `auth/user-not-found` for enumeration resistance.
    // A ConditionalExpression mutant flipping the guard to `true` would
    // silently swallow ANY Firebase error and return success.
    const { service, auth } = await build({});
    auth.getUserByEmail = vi.fn(async () => {
      throw Object.assign(new Error('quota'), { code: 'auth/quota-exceeded' });
    });
    await expect(service.resendVerification('alice@example.com')).rejects.toMatchObject({
      code: 'auth/quota-exceeded',
    });
  });

  it('throws InternalAuthException when generateEmailVerificationLink fails', async () => {
    // The catch around the Firebase call rethrows InternalAuthException. A
    // BlockStatement mutant emptying the catch body would let the original
    // failure bubble up unmapped — losing the consistent error contract.
    const { service, auth } = await build({});
    auth.generateEmailVerificationLink = vi.fn(async () => {
      throw new Error('Admin SDK timeout');
    });
    await expect(service.resendVerification('alice@example.com')).rejects.toBeInstanceOf(
      InternalAuthException,
    );
  });
});

describe('AccountRecoveryService.requestPasswordReset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['LEARNWREN_PUBLIC_URL'];
  });

  async function build(opts: {
    getUserResult?: unknown | 'not-found';
    throttle?: { throttled: boolean };
  }) {
    const auth = buildFakeAuth();
    const { repo: attempts, spies } = buildAttemptsMock();
    spies.recordPasswordResetRequest = vi.fn(async () => opts.throttle ?? { throttled: false });

    if (opts.getUserResult === 'not-found') {
      auth.getUserByEmail = vi.fn(async () => {
        throw Object.assign(new Error('not-found'), { code: 'auth/user-not-found' });
      });
    } else {
      auth.getUserByEmail = vi.fn(
        async () => opts.getUserResult ?? { uid: 'uid-123', email: 'alice@example.com' },
      );
    }
    auth.generatePasswordResetLink = vi.fn(async () => 'https://reset/abc');

    const emailTransport = buildEmailTransport();
    const service = await buildService(auth, attempts, emailTransport);
    return { service, auth, spies, emailTransport };
  }

  it('throws TOO_MANY_REQUESTS when within throttle window', async () => {
    const { service } = await build({ throttle: { throttled: true } });
    await expect(service.requestPasswordReset('alice@example.com')).rejects.toBeInstanceOf(
      TooManyRequestsException,
    );
  });

  it('returns silently when user does not exist', async () => {
    const { service, auth } = await build({ getUserResult: 'not-found' });
    await expect(service.requestPasswordReset('ghost@example.com')).resolves.toBeUndefined();
    expect(auth.generatePasswordResetLink).not.toHaveBeenCalled();
  });

  it('generates a reset link when user exists', async () => {
    const { service, auth } = await build({});
    await service.requestPasswordReset('alice@example.com');
    // Pin the full URL so a StringLiteral mutant cannot drop `?reset=ok` (the
    // signal the front-end uses to render the success state).
    expect(auth.generatePasswordResetLink).toHaveBeenCalledWith('alice@example.com', {
      url: 'http://localhost:4200/login?reset=ok',
    });
  });

  it('dispatches the reset link via emailTransport.sendPasswordResetEmail', async () => {
    // generatePasswordResetLink on the Admin SDK only returns a URL — it does
    // not send any email. We must explicitly hand the link to the transport,
    // or "Forgot password?" is silently dead in production.
    const { service, emailTransport } = await build({});
    await service.requestPasswordReset('alice@example.com');
    expect(emailTransport.sendPasswordResetEmail).toHaveBeenCalledWith({
      to: 'alice@example.com',
      resetUrl: 'https://reset/abc',
    });
  });

  it('propagates a non-user-not-found Firebase error from getUserByEmail (does not silently succeed)', async () => {
    const { service, auth } = await build({});
    auth.getUserByEmail = vi.fn(async () => {
      throw Object.assign(new Error('quota'), { code: 'auth/quota-exceeded' });
    });
    await expect(service.requestPasswordReset('alice@example.com')).rejects.toMatchObject({
      code: 'auth/quota-exceeded',
    });
  });

  it('throws InternalAuthException when generatePasswordResetLink fails', async () => {
    // Same contract as resendVerification — the catch must rethrow as
    // InternalAuthException, not let the Admin SDK error bubble up unmapped.
    const { service, auth } = await build({});
    auth.generatePasswordResetLink = vi.fn(async () => {
      throw new Error('Admin SDK timeout');
    });
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
    const auth = buildFakeAuth();
    const { repo: attempts, spies } = buildAttemptsMock();
    spies.redeemUnlockToken = vi.fn(async () => redeemResult);
    const emailTransport = buildEmailTransport();
    return buildService(auth, attempts, emailTransport);
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

describe('AccountRecoveryService.sendInitialVerificationEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['LEARNWREN_PUBLIC_URL'];
  });

  it('sends the verification email and returns true on success', async () => {
    const auth = buildFakeAuth();
    const { repo: attempts } = buildAttemptsMock();
    const emailTransport = buildEmailTransport();
    const service = await buildService(auth, attempts, emailTransport);

    const sent = await service.sendInitialVerificationEmail('alice@example.com', 'uid-1' as never);

    expect(sent).toBe(true);
    expect(auth.generateEmailVerificationLink).toHaveBeenCalledWith('alice@example.com', {
      url: 'http://localhost:4200/login',
    });
    // Pin the transport payload so an ObjectLiteral mutant replacing
    // `{ to, verificationUrl }` with `{}` is caught.
    expect(emailTransport.sendVerificationEmail).toHaveBeenCalledWith({
      to: 'alice@example.com',
      verificationUrl: 'https://verify/abc',
    });
  });

  it('returns false (best-effort) when link generation fails', async () => {
    const auth = buildFakeAuth();
    auth.generateEmailVerificationLink = vi.fn(async () => {
      throw new Error('Admin SDK down');
    });
    const { repo: attempts } = buildAttemptsMock();
    const emailTransport = buildEmailTransport();
    const service = await buildService(auth, attempts, emailTransport);

    const sent = await service.sendInitialVerificationEmail('alice@example.com', 'uid-1' as never);

    expect(sent).toBe(false);
    expect(emailTransport.sendVerificationEmail).not.toHaveBeenCalled();
  });
});
