import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service';
import { sessionExpiredInterceptor } from './session-expired.interceptor';

const USER = { uid: 'u1', email: 'a@x.com', displayName: 'A', role: 'STUDENT' } as never;

describe('sessionExpiredInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let auth: AuthService;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([sessionExpiredInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  async function get401(url: string): Promise<unknown> {
    const p = firstValueFrom(http.get(url)).catch((e: unknown) => e);
    ctrl.expectOne(url).flush({ error: { code: 'UNAUTHENTICATED' } }, { status: 401, statusText: 'Unauthorized' });
    return p;
  }

  it('clears the signed-in user and sends them to log in when an api call says the session is gone', async () => {
    auth.setCurrentUser(USER);
    const err = await get401('/api/me/courses');
    expect((err as { status: number }).status).toBe(401); // the caller still sees the error
    expect(auth.currentUser()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { redirect: '/' } });
  });

  it('leaves a guest alone (a public page probing a guarded endpoint)', async () => {
    await get401('/api/me/enrollments');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores /api/auth/* (login and /me report their own 401s)', async () => {
    auth.setCurrentUser(USER);
    await get401('/api/auth/login');
    expect(auth.currentUser()).toEqual(USER);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores errors other than 401', async () => {
    auth.setCurrentUser(USER);
    const p = firstValueFrom(http.get('/api/x')).catch(() => undefined);
    ctrl.expectOne('/api/x').flush({}, { status: 403, statusText: 'Forbidden' });
    await p;
    expect(auth.currentUser()).toEqual(USER);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('redirects once when several requests fail together', async () => {
    auth.setCurrentUser(USER);
    const a = firstValueFrom(http.get('/api/a')).catch(() => undefined);
    const b = firstValueFrom(http.get('/api/b')).catch(() => undefined);
    ctrl.expectOne('/api/a').flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne('/api/b').flush({}, { status: 401, statusText: 'Unauthorized' });
    await Promise.all([a, b]);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
