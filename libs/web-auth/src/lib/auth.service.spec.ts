import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';

import { AuthService } from './auth.service';

const baseUser = {
  uid: 'u-1',
  email: 'a@b.c',
  displayName: 'A',
  role: 'STUDENT' as const,
  emailVerified: true,
};

describe('AuthService.login', () => {
  let svc: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('happy path: posts /auth/login, sets currentUser, returns ok', async () => {
    const promise = svc.login('a@b.c', 'pw');
    const req = httpMock.expectOne({ method: 'POST', url: '/api/auth/login' });
    expect(req.request.body).toEqual({ email: 'a@b.c', password: 'pw' });
    req.flush({ uid: 'u-1', role: 'STUDENT', displayName: 'A', emailVerified: true });
    // currentUser refresh is via /auth/me
    const me = httpMock.expectOne({ method: 'GET', url: '/api/auth/me' });
    me.flush(baseUser);
    const result = await promise;
    expect(result).toEqual({ ok: true });
    expect(svc.currentUser()).toEqual(baseUser);
  });

  it('returns ok=false with code on 401', async () => {
    const promise = svc.login('a@b.c', 'pw');
    const req = httpMock.expectOne({ method: 'POST', url: '/api/auth/login' });
    req.flush({ error: { code: 'INVALID_CREDENTIALS' } }, { status: 401, statusText: 'Unauthorized' });
    const result = await promise;
    expect(result).toEqual({ ok: false, code: 'INVALID_CREDENTIALS' });
    expect(svc.currentUser()).toBeNull();
  });

  it('returns ok=false with EMAIL_NOT_VERIFIED on 403', async () => {
    const promise = svc.login('a@b.c', 'pw');
    httpMock.expectOne('/api/auth/login').flush(
      { error: { code: 'EMAIL_NOT_VERIFIED', details: { resendAvailable: true } } },
      { status: 403, statusText: 'Forbidden' },
    );
    expect(await promise).toEqual({
      ok: false,
      code: 'EMAIL_NOT_VERIFIED',
      details: { resendAvailable: true },
    });
  });

  it('returns ok=false with ACCOUNT_LOCKED on 423', async () => {
    const promise = svc.login('a@b.c', 'pw');
    httpMock.expectOne('/api/auth/login').flush(
      {
        error: {
          code: 'ACCOUNT_LOCKED',
          details: { unlockAvailableAt: '2026-05-06T01:00:00.000Z' },
        },
      },
      { status: 423, statusText: 'Locked' },
    );
    expect(await promise).toEqual({
      ok: false,
      code: 'ACCOUNT_LOCKED',
      details: { unlockAvailableAt: '2026-05-06T01:00:00.000Z' },
    });
  });
});

describe('AuthService.register', () => {
  let svc: AuthService;
  let httpMock: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('happy path: posts /auth/register, then refreshes currentUser via /auth/me', async () => {
    const promise = svc.register({ email: 'a@b.c', password: 'pw', displayName: 'A' });
    httpMock.expectOne('/api/auth/register').flush({
      uid: 'u-1',
      email: 'a@b.c',
      role: 'STUDENT',
      emailVerified: false,
    });
    httpMock.expectOne('/api/auth/me').flush({ ...baseUser, emailVerified: false });
    expect(await promise).toEqual({ ok: true });
    expect(svc.currentUser()?.emailVerified).toBe(false);
  });

  for (const code of [
    'INVALID_EMAIL',
    'EMAIL_TOO_LONG',
    'INVALID_DISPLAY_NAME',
    'PASSWORD_TOO_LONG',
  ] as const) {
    it(`maps a 400 ${code} from register to the same code (not INTERNAL)`, async () => {
      const promise = svc.register({ email: 'a@b.c', password: 'pw', displayName: 'A' });
      httpMock
        .expectOne('/api/auth/register')
        .flush({ error: { code } }, { status: 400, statusText: 'Bad Request' });
      expect(await promise).toEqual({ ok: false, code });
    });
  }
});

describe('AuthService.resendVerification / requestPasswordReset / unlock', () => {
  let svc: AuthService;
  let httpMock: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('resendVerification posts to /auth/resend-verification', async () => {
    const promise = svc.resendVerification('a@b.c');
    const req = httpMock.expectOne('/api/auth/resend-verification');
    expect(req.request.body).toEqual({ email: 'a@b.c' });
    req.flush(null, { status: 202, statusText: 'Accepted' });
    await promise;
  });

  it('requestPasswordReset posts to /auth/request-password-reset', async () => {
    const promise = svc.requestPasswordReset('a@b.c');
    const req = httpMock.expectOne('/api/auth/request-password-reset');
    expect(req.request.body).toEqual({ email: 'a@b.c' });
    req.flush(null, { status: 202, statusText: 'Accepted' });
    await promise;
  });

  it('unlock posts to /auth/unlock and returns ok on 204', async () => {
    const promise = svc.unlock('TOK');
    const req = httpMock.expectOne('/api/auth/unlock');
    expect(req.request.body).toEqual({ token: 'TOK' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(await promise).toEqual({ ok: true });
  });

  it('unlock returns ok=false with INVALID_UNLOCK_TOKEN on 400', async () => {
    const promise = svc.unlock('BAD');
    httpMock
      .expectOne('/api/auth/unlock')
      .flush({ error: { code: 'INVALID_UNLOCK_TOKEN' } }, { status: 400, statusText: 'Bad Request' });
    expect(await promise).toEqual({ ok: false, code: 'INVALID_UNLOCK_TOKEN' });
  });

  it('unlock returns ok=false with UNLOCK_TOKEN_EXPIRED on 410', async () => {
    const promise = svc.unlock('OLD');
    httpMock
      .expectOne('/api/auth/unlock')
      .flush({ error: { code: 'UNLOCK_TOKEN_EXPIRED' } }, { status: 410, statusText: 'Gone' });
    expect(await promise).toEqual({ ok: false, code: 'UNLOCK_TOKEN_EXPIRED' });
  });

  it('unlock returns INTERNAL on a 500 with unknown error body', async () => {
    const promise = svc.unlock('X');
    httpMock
      .expectOne('/api/auth/unlock')
      .flush({ error: { code: 'WHATEVER' } }, { status: 500, statusText: 'ISE' });
    expect(await promise).toEqual({ ok: false, code: 'INTERNAL' });
  });

  it('unlock returns INTERNAL on a non-HttpErrorResponse failure', async () => {
    const promise = svc.unlock('X');
    httpMock.expectOne('/api/auth/unlock').error(new ProgressEvent('network'));
    expect(await promise).toEqual({ ok: false, code: 'INTERNAL' });
  });
});

describe('AuthService.login error edge cases', () => {
  let svc: AuthService;
  let httpMock: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('maps WEAK_PASSWORD code through toLoginErr', async () => {
    const promise = svc.login('a@b.c', 'pw');
    httpMock.expectOne('/api/auth/login').flush(
      { error: { code: 'WEAK_PASSWORD', details: { unmetRequirements: ['MIN_LENGTH'] } } },
      { status: 400, statusText: 'Bad Request' },
    );
    expect(await promise).toEqual({
      ok: false,
      code: 'WEAK_PASSWORD',
      details: { unmetRequirements: ['MIN_LENGTH'] },
    });
  });

  it('maps EMAIL_ALREADY_EXISTS code through toLoginErr', async () => {
    const promise = svc.login('a@b.c', 'pw');
    httpMock.expectOne('/api/auth/login').flush(
      { error: { code: 'EMAIL_ALREADY_EXISTS' } },
      { status: 409, statusText: 'Conflict' },
    );
    expect(await promise).toEqual({ ok: false, code: 'EMAIL_ALREADY_EXISTS' });
  });

  it('returns INTERNAL on an unknown server error code', async () => {
    const promise = svc.login('a@b.c', 'pw');
    httpMock.expectOne('/api/auth/login').flush(
      { error: { code: 'UNKNOWN' } },
      { status: 500, statusText: 'ISE' },
    );
    expect(await promise).toEqual({ ok: false, code: 'INTERNAL' });
  });

  it('returns INTERNAL on a non-HttpErrorResponse failure (network error)', async () => {
    const promise = svc.login('a@b.c', 'pw');
    httpMock.expectOne('/api/auth/login').error(new ProgressEvent('network'));
    expect(await promise).toEqual({ ok: false, code: 'INTERNAL' });
  });
});

describe('AuthService.register error path', () => {
  let svc: AuthService;
  let httpMock: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('maps a 409 EMAIL_ALREADY_EXISTS through toLoginErr', async () => {
    const promise = svc.register({ email: 'a@b.c', password: 'pw', displayName: 'A' });
    httpMock.expectOne('/api/auth/register').flush(
      { error: { code: 'EMAIL_ALREADY_EXISTS' } },
      { status: 409, statusText: 'Conflict' },
    );
    expect(await promise).toEqual({ ok: false, code: 'EMAIL_ALREADY_EXISTS' });
  });

  it('maps a 400 WEAK_PASSWORD with unmet requirements through toLoginErr', async () => {
    const promise = svc.register({ email: 'a@b.c', password: 'pw', displayName: 'A' });
    httpMock.expectOne('/api/auth/register').flush(
      { error: { code: 'WEAK_PASSWORD', details: { unmetRequirements: ['DIGIT'] } } },
      { status: 400, statusText: 'Bad Request' },
    );
    expect(await promise).toEqual({
      ok: false,
      code: 'WEAK_PASSWORD',
      details: { unmetRequirements: ['DIGIT'] },
    });
  });

  it('returns INTERNAL on a 500 without a recognised code', async () => {
    const promise = svc.register({ email: 'a@b.c', password: 'pw', displayName: 'A' });
    httpMock.expectOne('/api/auth/register').flush(
      {},
      { status: 500, statusText: 'ISE' },
    );
    expect(await promise).toEqual({ ok: false, code: 'INTERNAL' });
  });
});

describe('AuthService.logout', () => {
  let svc: AuthService;
  let httpMock: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('clears the currentUser signal even when the server call succeeds', async () => {
    const promise = svc.logout();
    httpMock.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await promise;
    expect(svc.currentUser()).toBeNull();
    expect(svc.isAuthenticated()).toBe(false);
  });

  it('still clears the currentUser signal when the server call fails', async () => {
    const promise = svc.logout();
    httpMock.expectOne('/api/auth/logout').flush(null, { status: 500, statusText: 'ISE' });
    await promise;
    expect(svc.currentUser()).toBeNull();
  });
});

describe('AuthService.refresh', () => {
  let svc: AuthService;
  let httpMock: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('populates currentUser on success', async () => {
    const promise = svc.refresh();
    httpMock.expectOne('/api/auth/me').flush(baseUser);
    await promise;
    expect(svc.currentUser()).toEqual(baseUser);
    expect(svc.isAuthenticated()).toBe(true);
  });

  it('clears currentUser on 401', async () => {
    const promise = svc.refresh();
    httpMock
      .expectOne('/api/auth/me')
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    await promise;
    expect(svc.currentUser()).toBeNull();
  });

  it('rethrows on non-401 errors', async () => {
    const promise = svc.refresh();
    httpMock.expectOne('/api/auth/me').flush(null, { status: 500, statusText: 'ISE' });
    await expect(promise).rejects.toBeDefined();
  });
});

describe('AuthService.setCurrentUser', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('replaces the current user signal value', () => {
    const svc = TestBed.inject(AuthService);
    const me = { uid: 'u-1', email: 'a@b.c', displayName: 'New', role: 'STUDENT' as const, emailVerified: true };
    svc.setCurrentUser(me);
    expect(svc.currentUser()).toEqual(me);
    expect(svc.isAuthenticated()).toBe(true);
  });
});
