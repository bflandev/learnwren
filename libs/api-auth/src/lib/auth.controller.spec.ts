import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EMAIL_TRANSPORT } from './email-transport/email-transport';
import { SessionCookieHelper } from './session-cookie.helper';
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

async function buildController(authServiceMock: Partial<AuthService>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      { provide: AuthService, useValue: authServiceMock },
      SessionCookieHelper,
      {
        provide: EMAIL_TRANSPORT,
        useValue: {
          sendUnlockEmail: vi.fn(async () => undefined),
          sendVerificationEmail: vi.fn(async () => undefined),
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
    const ctrl = await buildController({ resendVerification } as never);
    await expect(
      ctrl.resendVerification({ email: 'a@b.c' } as never),
    ).resolves.toBeUndefined();
  });

  it('propagates TooManyRequestsException', async () => {
    const resendVerification = vi.fn(async () => {
      throw new TooManyRequestsException();
    });
    const ctrl = await buildController({ resendVerification } as never);
    await expect(
      ctrl.resendVerification({ email: 'a@b.c' } as never),
    ).rejects.toBeInstanceOf(TooManyRequestsException);
  });
});

describe('AuthController.requestPasswordReset', () => {
  it('forwards the email to the service and returns void on 202', async () => {
    // The handler body must call authService.requestPasswordReset(dto.email).
    // A BlockStatement mutant emptying the function body would still resolve
    // void, so we assert the side effect explicitly.
    const requestPasswordReset = vi.fn(async () => undefined);
    const ctrl = await buildController({ requestPasswordReset } as never);
    await expect(
      ctrl.requestPasswordReset({ email: 'a@b.c' } as never),
    ).resolves.toBeUndefined();
    expect(requestPasswordReset).toHaveBeenCalledWith('a@b.c');
  });
});

describe('AuthController.unlock', () => {
  it('returns void on 204', async () => {
    const unlock = vi.fn(async () => undefined);
    const ctrl = await buildController({ unlock } as never);
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
    const ctrl = await buildController({ unlock } as never);
    await expect(ctrl.unlock({ token: 'tok' } as never)).rejects.toBe(ex);
  });
});

describe('AuthController.logout', () => {
  it('clears the cookie and calls logoutSideEffects', async () => {
    const logoutSideEffects = vi.fn(async () => undefined);
    const ctrl = await buildController({ logoutSideEffects } as never);
    const res = buildResMock();

    await ctrl.logout({ cookies: { __session: 'old' } } as never, res as never);

    expect(logoutSideEffects).toHaveBeenCalledWith('old');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      '__session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
    );
  });

  it('passes undefined to logoutSideEffects when req.cookies is missing entirely', async () => {
    // The controller uses `req.cookies?.[NAME]` — without optional chaining
    // it would throw on requests where cookie-parser hasn't run. Verifies
    // the optional chain isn't dropped.
    const logoutSideEffects = vi.fn(async () => undefined);
    const ctrl = await buildController({ logoutSideEffects } as never);
    const res = buildResMock();

    await ctrl.logout({} as never, res as never);

    expect(logoutSideEffects).toHaveBeenCalledWith(undefined);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      '__session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
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
