import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AccountRecoveryService } from './account-recovery.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ConsoleEmailTransport } from './email-transport/console-email-transport';
import { EMAIL_TRANSPORT } from './email-transport/email-transport';
import { SessionCookieHelper } from './session-cookie.helper';
import { SessionCookieService } from './session-cookie.service';
import { FirebaseSessionGuard } from './firebase-session.guard';
import {
  AccountLockedException,
  EmailNotVerifiedException,
  InvalidCredentialsException,
  InvalidUnlockTokenException,
  TooManyRequestsException,
  UnlockTokenExpiredException,
} from './errors/auth.exception';

function buildResMock() {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader: vi.fn((k: string, v: string) => {
      headers[k] = v;
    }),
  };
}

async function buildController(
  authServiceMock: Partial<AuthService>,
  transportOverride?: unknown,
  overrides: {
    recovery?: Partial<AccountRecoveryService>;
    sessionCookies?: Partial<SessionCookieService>;
  } = {},
) {
  const moduleRef = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      { provide: AuthService, useValue: authServiceMock },
      {
        provide: AccountRecoveryService,
        useValue:
          overrides.recovery ??
          ({
            resendVerification: vi.fn(async () => undefined),
            requestPasswordReset: vi.fn(async () => undefined),
            unlock: vi.fn(async () => undefined),
          } as Partial<AccountRecoveryService>),
      },
      {
        provide: SessionCookieService,
        useValue:
          overrides.sessionCookies ??
          ({ revokeFromCookie: vi.fn(async () => undefined) } as Partial<SessionCookieService>),
      },
      SessionCookieHelper,
      {
        provide: EMAIL_TRANSPORT,
        useValue:
          transportOverride ?? {
            sendUnlockEmail: vi.fn(async () => undefined),
            sendVerificationEmail: vi.fn(async () => undefined),
            sendPasswordResetEmail: vi.fn(async () => undefined),
          },
      },
    ],
  })
    .overrideGuard(FirebaseSessionGuard)
    .useValue({ canActivate: () => true })
    .compile();
  return moduleRef.get(AuthController);
}

describe('AuthController.register', () => {
  it('sets the session cookie from the AuthService result', async () => {
    const register = vi.fn(async () => ({
      uid: 'uid-1',
      email: 'a@b.c',
      role: 'STUDENT',
      cookie: 'COOKIE',
      maxAgeSeconds: 432000,
      emailVerificationSent: true,
    }));
    const ctrl = await buildController({ register } as never);
    const res = buildResMock();
    const body = await ctrl.register(
      { email: 'a@b.c', password: 'Aa1!aaaaaaaa', displayName: 'A' } as never,
      res as never,
    );
    expect(body).toEqual({ uid: 'uid-1', role: 'STUDENT', email: 'a@b.c', emailVerified: false });
    // Pin the exact body forwarded to the service so an empty-object mutant
    // cannot replace the destructured request fields.
    expect(register).toHaveBeenCalledWith({
      email: 'a@b.c',
      password: 'Aa1!aaaaaaaa',
      displayName: 'A',
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('__session=COOKIE'),
    );
    // Pin the cookie's Max-Age — derived from maxAgeSeconds passed to
    // toSetCookie's options object. An ObjectLiteral mutant on `{ maxAgeSeconds }`
    // would drop the field and fall through to the helper's default.
    expect(res.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('Max-Age=432000'),
    );
  });
});

describe('AuthController.login', () => {
  it('sets the session cookie on success', async () => {
    const login = vi.fn(async () => ({
      uid: 'uid-1',
      email: 'a@b.c',
      role: 'STUDENT',
      displayName: 'A',
      emailVerified: true,
      cookie: 'COOKIE',
      maxAgeSeconds: 432000,
    }));
    const ctrl = await buildController({ login } as never);
    const res = buildResMock();
    const body = await ctrl.login({ email: 'a@b.c', password: 'pw' } as never, res as never);
    expect(body).toEqual({ uid: 'uid-1', role: 'STUDENT', displayName: 'A', emailVerified: true });
    expect(login).toHaveBeenCalledWith({ email: 'a@b.c', password: 'pw' });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('__session=COOKIE'),
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('Max-Age=432000'),
    );
  });

  it.each([
    () => new InvalidCredentialsException(),
    () => new EmailNotVerifiedException(),
    () => new AccountLockedException(new Date('2026-05-06T01:00:00.000Z')),
  ])('propagates %s without setting a cookie', async (factory) => {
    const ex = factory();
    const login = vi.fn(async () => {
      throw ex;
    });
    const ctrl = await buildController({ login } as never);
    const res = buildResMock();
    await expect(
      ctrl.login({ email: 'a@b.c', password: 'pw' } as never, res as never),
    ).rejects.toBe(ex);
    expect(res.setHeader).not.toHaveBeenCalled();
  });
});

describe('AuthController.resendVerification', () => {
  it('returns void on 202', async () => {
    const resendVerification = vi.fn(async () => undefined);
    const ctrl = await buildController({} as never, undefined, {
      recovery: { resendVerification } as Partial<AccountRecoveryService>,
    });
    await expect(
      ctrl.resendVerification({ email: 'a@b.c' } as never),
    ).resolves.toBeUndefined();
  });

  it('propagates TooManyRequestsException', async () => {
    const resendVerification = vi.fn(async () => {
      throw new TooManyRequestsException();
    });
    const ctrl = await buildController({} as never, undefined, {
      recovery: { resendVerification } as Partial<AccountRecoveryService>,
    });
    await expect(
      ctrl.resendVerification({ email: 'a@b.c' } as never),
    ).rejects.toBeInstanceOf(TooManyRequestsException);
  });
});

describe('AuthController.requestPasswordReset', () => {
  it('forwards the email to the service and returns void on 202', async () => {
    // The handler body must call recovery.requestPasswordReset(dto.email).
    // A BlockStatement mutant emptying the function body would still resolve
    // void, so we assert the side effect explicitly.
    const requestPasswordReset = vi.fn(async () => undefined);
    const ctrl = await buildController({} as never, undefined, {
      recovery: { requestPasswordReset } as Partial<AccountRecoveryService>,
    });
    await expect(
      ctrl.requestPasswordReset({ email: 'a@b.c' } as never),
    ).resolves.toBeUndefined();
    expect(requestPasswordReset).toHaveBeenCalledWith('a@b.c');
  });
});

describe('AuthController.unlock', () => {
  it('returns void on 204', async () => {
    const unlock = vi.fn(async () => undefined);
    const ctrl = await buildController({} as never, undefined, {
      recovery: { unlock } as Partial<AccountRecoveryService>,
    });
    await expect(ctrl.unlock({ token: 'tok' } as never)).resolves.toBeUndefined();
  });

  it.each([
    () => new InvalidUnlockTokenException(),
    () => new UnlockTokenExpiredException(),
  ])('propagates %s', async (factory) => {
    const ex = factory();
    const unlock = vi.fn(async () => {
      throw ex;
    });
    const ctrl = await buildController({} as never, undefined, {
      recovery: { unlock } as Partial<AccountRecoveryService>,
    });
    await expect(ctrl.unlock({ token: 'tok' } as never)).rejects.toBe(ex);
  });
});

describe('AuthController.logout', () => {
  it('clears the cookie and calls revokeFromCookie', async () => {
    const revokeFromCookie = vi.fn(async () => undefined);
    const ctrl = await buildController({} as never, undefined, {
      sessionCookies: { revokeFromCookie } as Partial<SessionCookieService>,
    });
    const res = buildResMock();

    await ctrl.logout({ cookies: { __session: 'old' } } as never, res as never);

    expect(revokeFromCookie).toHaveBeenCalledWith('old');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      '__session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
    );
  });

  it('passes undefined to revokeFromCookie when req.cookies is missing entirely', async () => {
    // The controller uses `req.cookies?.[NAME]` — without optional chaining
    // it would throw on requests where cookie-parser hasn't run. Verifies
    // the optional chain isn't dropped.
    const revokeFromCookie = vi.fn(async () => undefined);
    const ctrl = await buildController({} as never, undefined, {
      sessionCookies: { revokeFromCookie } as Partial<SessionCookieService>,
    });
    const res = buildResMock();

    await ctrl.logout({} as never, res as never);

    expect(revokeFromCookie).toHaveBeenCalledWith(undefined);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      '__session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
    );
  });
});

describe('AuthController.lastTestEmail', () => {
  const ORIG = process.env['LEARNWREN_TEST_OUTBOX_ENABLED'];
  afterEach(() => {
    if (ORIG === undefined) delete process.env['LEARNWREN_TEST_OUTBOX_ENABLED'];
    else process.env['LEARNWREN_TEST_OUTBOX_ENABLED'] = ORIG;
    vi.restoreAllMocks();
  });

  it('404s when the test-outbox feature flag is off', async () => {
    delete process.env['LEARNWREN_TEST_OUTBOX_ENABLED'];
    const ctrl = await buildController({} as never);
    await expect(ctrl.lastTestEmail('a@b.c', 'unlock')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s when the configured transport is not the console transport', async () => {
    process.env['LEARNWREN_TEST_OUTBOX_ENABLED'] = '1';
    // Provide a plain object that is NOT a ConsoleEmailTransport
    const ctrl = await buildController({} as never, {
      sendUnlockEmail: vi.fn(),
      sendVerificationEmail: vi.fn(),
      sendPasswordResetEmail: vi.fn(),
    });
    await expect(ctrl.lastTestEmail('a@b.c', 'unlock')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s when no matching outbox entry exists', async () => {
    process.env['LEARNWREN_TEST_OUTBOX_ENABLED'] = '1';
    vi.spyOn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      require('@nestjs/common').Logger.prototype as any,
      'log',
    ).mockImplementation(() => undefined);
    const transport = new ConsoleEmailTransport();
    const ctrl = await buildController({} as never, transport);
    await expect(ctrl.lastTestEmail('nobody@x.com', 'unlock')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns the last sent url and ISO sentAt when the entry exists', async () => {
    process.env['LEARNWREN_TEST_OUTBOX_ENABLED'] = '1';
    vi.spyOn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      require('@nestjs/common').Logger.prototype as any,
      'log',
    ).mockImplementation(() => undefined);
    const transport = new ConsoleEmailTransport();
    await transport.sendUnlockEmail({
      to: 'a@x.com',
      unlockUrl: 'https://learnwren.com/unlock?token=tok',
      unlockAvailableAt: new Date('2026-05-06T01:00:00.000Z'),
    });
    const ctrl = await buildController({} as never, transport);
    const out = await ctrl.lastTestEmail('a@x.com', 'unlock');
    expect(out.url).toBe('https://learnwren.com/unlock?token=tok');
    expect(out.sentAt).toMatch(/T/); // ISO format
  });

  it('404s in production even with the flag on, a console transport, and an entry', async () => {
    // Defence-in-depth gate: with every OTHER condition satisfied, only the
    // NODE_ENV === 'production' check stands between the caller and the entry.
    // Kills the ConditionalExpression/StringLiteral/BlockStatement mutants on
    // that branch (otherwise unexercised — no prior test sets production).
    const origNodeEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    process.env['LEARNWREN_TEST_OUTBOX_ENABLED'] = '1';
    vi.spyOn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      require('@nestjs/common').Logger.prototype as any,
      'log',
    ).mockImplementation(() => undefined);
    const transport = new ConsoleEmailTransport();
    await transport.sendUnlockEmail({
      to: 'a@x.com',
      unlockUrl: 'https://learnwren.com/unlock?token=tok',
      unlockAvailableAt: new Date('2026-05-06T01:00:00.000Z'),
    });
    const ctrl = await buildController({} as never, transport);
    try {
      await expect(ctrl.lastTestEmail('a@x.com', 'unlock')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    } finally {
      if (origNodeEnv === undefined) delete process.env['NODE_ENV'];
      else process.env['NODE_ENV'] = origNodeEnv;
    }
  });

  it('404s when the flag is a non-"1" value, even with a console transport + entry', async () => {
    // Isolates the flag gate: a console transport with a matching entry would
    // otherwise return it, so a ConditionalExpression mutant skipping the
    // `!== '1'` check is caught here (the flag-off test above passes through to
    // the transport gate and so can't pin this branch alone).
    process.env['LEARNWREN_TEST_OUTBOX_ENABLED'] = '0';
    vi.spyOn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      require('@nestjs/common').Logger.prototype as any,
      'log',
    ).mockImplementation(() => undefined);
    const transport = new ConsoleEmailTransport();
    await transport.sendUnlockEmail({
      to: 'a@x.com',
      unlockUrl: 'https://learnwren.com/unlock?token=tok',
      unlockAvailableAt: new Date('2026-05-06T01:00:00.000Z'),
    });
    const ctrl = await buildController({} as never, transport);
    await expect(ctrl.lastTestEmail('a@x.com', 'unlock')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AuthController.me', () => {
  it('reads request.user (populated by the guard) and returns the merged response', async () => {
    const getMe = vi.fn(async () => ({
      uid: 'uid-1',
      email: 'a@b.c',
      displayName: 'A',
      role: 'STUDENT',
      emailVerified: true,
    }));
    const ctrl = await buildController({ getMe } as never);

    const result = await ctrl.me({
      user: { uid: 'uid-1', email: 'a@b.c', role: 'STUDENT', emailVerified: true },
    } as never);

    expect(getMe).toHaveBeenCalledWith('uid-1', {
      email: 'a@b.c',
      emailVerified: true,
    });
    expect(result.displayName).toBe('A');
  });
});
