import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Auth } from '@angular/fire/auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service';

const fakeFirebaseUser = {
  getIdToken: vi.fn(async () => 'fresh.id.token'),
};

const signInWithEmailAndPasswordMock = vi.fn(async () => ({
  user: fakeFirebaseUser,
}));
const signOutMock = vi.fn(async () => undefined);

vi.mock('@angular/fire/auth', async (orig) => {
  const actual = (await orig<typeof import('@angular/fire/auth')>());
  return {
    ...actual,
    signInWithEmailAndPassword: (...args: unknown[]) =>
      signInWithEmailAndPasswordMock(...args),
    signOut: (...args: unknown[]) => signOutMock(...args),
  };
});

describe('AuthService', () => {
  let httpMock: HttpTestingController;
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeFirebaseUser.getIdToken.mockResolvedValue('fresh.id.token');

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Auth, useValue: {} as unknown as Auth },
        AuthService,
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('register posts then signs in then exchanges then refreshes', async () => {
    const promise = service.register({
      email: 'a@b.c',
      password: 'Aa1!aaaaaaaa',
      displayName: 'A',
    });

    const reg = httpMock.expectOne('/api/auth/register');
    expect(reg.request.method).toBe('POST');
    reg.flush({ uid: 'uid-1', email: 'a@b.c', emailVerificationSent: true });

    await Promise.resolve();
    await Promise.resolve();

    const session = httpMock.expectOne('/api/auth/session');
    expect(session.request.method).toBe('POST');
    expect(session.request.body).toEqual({ idToken: 'fresh.id.token' });
    session.flush({ uid: 'uid-1', role: 'STUDENT' });

    const me = httpMock.expectOne('/api/auth/me');
    expect(me.request.method).toBe('GET');
    me.flush({
      uid: 'uid-1', email: 'a@b.c', displayName: 'A',
      role: 'STUDENT', emailVerified: false,
    });

    await promise;
    expect(service.currentUser()?.uid).toBe('uid-1');
    expect(signInWithEmailAndPasswordMock).toHaveBeenCalledWith({}, 'a@b.c', 'Aa1!aaaaaaaa');
    expect(fakeFirebaseUser.getIdToken).toHaveBeenCalledWith(true);
  });

  it('login skips /auth/register and runs the rest of the flow', async () => {
    const promise = service.login({ email: 'a@b.c', password: 'Aa1!aaaaaaaa' });

    await Promise.resolve();
    await Promise.resolve();

    const session = httpMock.expectOne('/api/auth/session');
    session.flush({ uid: 'uid-1', role: 'STUDENT' });

    const me = httpMock.expectOne('/api/auth/me');
    me.flush({
      uid: 'uid-1', email: 'a@b.c', displayName: 'A',
      role: 'STUDENT', emailVerified: false,
    });

    await promise;
    expect(service.currentUser()?.uid).toBe('uid-1');
    httpMock.verify();
  });

  it('refresh sets currentUser to null on 401', async () => {
    const promise = service.refresh();
    const me = httpMock.expectOne('/api/auth/me');
    me.flush({ error: { code: 'UNAUTHENTICATED', message: 'no' } }, { status: 401, statusText: 'Unauthorized' });
    await promise;
    expect(service.currentUser()).toBeNull();
  });

  it('logout clears the signal even when the API call fails', async () => {
    service['currentUserSignal'].set({
      uid: 'uid-1', email: 'a@b.c', displayName: 'A', role: 'STUDENT', emailVerified: false,
    });
    const promise = service.logout();
    const out = httpMock.expectOne('/api/auth/logout');
    out.flush({ error: { code: 'INTERNAL', message: 'x' } }, { status: 500, statusText: 'Server error' });
    await promise;
    expect(service.currentUser()).toBeNull();
    expect(signOutMock).toHaveBeenCalled();
  });
});
