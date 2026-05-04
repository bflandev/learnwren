import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionCookieHelper } from './session-cookie.helper';
import { FirebaseSessionGuard } from './firebase-session.guard';

interface FakeResponse {
  setHeader: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
}

function buildResponse(): FakeResponse {
  const status = vi.fn(() => ({ json: vi.fn() }));
  return { setHeader: vi.fn(), status };
}

describe('AuthController', () => {
  it('register delegates to AuthService.register and returns the result', async () => {
    const service = {
      register: vi.fn(async () => ({
        uid: 'uid-1',
        email: 'a@b.c',
        emailVerificationSent: true,
      })),
    } as unknown as AuthService;
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: service },
        SessionCookieHelper,
      ],
    })
      .overrideGuard(FirebaseSessionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const controller = moduleRef.get(AuthController);

    const result = await controller.register({
      email: 'a@b.c',
      password: 'Aa1!aaaaaaaa',
      displayName: 'A',
    });
    expect(service.register).toHaveBeenCalled();
    expect(result).toEqual({ uid: 'uid-1', email: 'a@b.c', emailVerificationSent: true });
  });

  it('session sets the __session cookie via Set-Cookie and returns uid + role', async () => {
    const service = {
      createSessionCookie: vi.fn(async () => ({
        cookie: 'cookie.value',
        uid: 'uid-1',
        role: 'STUDENT',
        maxAgeSeconds: 432000,
      })),
    } as unknown as AuthService;
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: service },
        SessionCookieHelper,
      ],
    })
      .overrideGuard(FirebaseSessionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const controller = moduleRef.get(AuthController);
    const res = buildResponse();

    const result = await controller.session({ idToken: 'id.token' }, res as never);

    expect(result).toEqual({ uid: 'uid-1', role: 'STUDENT' });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      '__session=cookie.value; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=432000',
    );
  });

  it('logout clears the cookie and returns 204', async () => {
    const service = {
      logoutSideEffects: vi.fn(async () => undefined),
    } as unknown as AuthService;
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: service },
        SessionCookieHelper,
      ],
    })
      .overrideGuard(FirebaseSessionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const controller = moduleRef.get(AuthController);
    const res = buildResponse();

    await controller.logout({ cookies: { __session: 'old' } } as never, res as never);

    expect(service.logoutSideEffects).toHaveBeenCalledWith('old');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      '__session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
    );
  });

  it('me reads request.user (populated by the guard) and returns the merged response', async () => {
    const service = {
      getMe: vi.fn(async () => ({
        uid: 'uid-1',
        email: 'a@b.c',
        displayName: 'A',
        role: 'STUDENT',
        emailVerified: true,
      })),
    } as unknown as AuthService;
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: service },
        SessionCookieHelper,
      ],
    })
      .overrideGuard(FirebaseSessionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const controller = moduleRef.get(AuthController);

    const result = await controller.me({
      user: { uid: 'uid-1', email: 'a@b.c', role: 'STUDENT', emailVerified: true },
    } as never);

    expect(service.getMe).toHaveBeenCalledWith('uid-1', {
      email: 'a@b.c',
      emailVerified: true,
    });
    expect(result.displayName).toBe('A');
  });
});
