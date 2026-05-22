import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';

import { LoginPageComponent } from './login-page.component';

function setup(queryParamMap: Map<string, string> = new Map()) {
  TestBed.configureTestingModule({
    imports: [LoginPageComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { queryParamMap: of({ get: (k: string) => queryParamMap.get(k) ?? null }) } },
    ],
  });
  const fixture = TestBed.createComponent(LoginPageComponent);
  fixture.detectChanges();
  return {
    fixture,
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('LoginPageComponent error states', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders "Invalid email or password" on 401', async () => {
    const { fixture, httpMock } = setup();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ email: 'a@b.c', password: 'pw' });
    const submitPromise = cmp.submit();
    httpMock.expectOne('/api/auth/login').flush(
      { error: { code: 'INVALID_CREDENTIALS' } },
      { status: 401, statusText: 'Unauthorized' },
    );
    await submitPromise;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Invalid email or password.');
  });

  it('renders the resend affordance on 403 EMAIL_NOT_VERIFIED', async () => {
    const { fixture, httpMock } = setup();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ email: 'a@b.c', password: 'pw' });
    const submitPromise = cmp.submit();
    httpMock.expectOne('/api/auth/login').flush(
      { error: { code: 'EMAIL_NOT_VERIFIED', details: { resendAvailable: true } } },
      { status: 403, statusText: 'Forbidden' },
    );
    await submitPromise;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'Please verify your email address',
    );
    expect(fixture.nativeElement.textContent).toContain('Resend verification email');
  });

  it('renders the lockout time on 423 ACCOUNT_LOCKED', async () => {
    const { fixture, httpMock } = setup();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ email: 'a@b.c', password: 'pw' });
    const submitPromise = cmp.submit();
    const unlockAvailableAt = new Date('2026-05-06T01:00:00.000Z').toISOString();
    httpMock.expectOne('/api/auth/login').flush(
      { error: { code: 'ACCOUNT_LOCKED', details: { unlockAvailableAt } } },
      { status: 423, statusText: 'Locked' },
    );
    await submitPromise;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('temporarily locked');
  });

  it('shows the just-reset hint when ?reset=ok and lockout fires', async () => {
    const { fixture, httpMock } = setup(new Map([['reset', 'ok']]));
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ email: 'a@b.c', password: 'pw' });
    const submitPromise = cmp.submit();
    httpMock.expectOne('/api/auth/login').flush(
      {
        error: {
          code: 'ACCOUNT_LOCKED',
          details: { unlockAvailableAt: '2026-05-06T01:00:00.000Z' },
        },
      },
      { status: 423, statusText: 'Locked' },
    );
    await submitPromise;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("just reset your password");
  });
});

describe('LoginPageComponent post-login navigation', () => {
  async function loginOk(queryParamMap: Map<string, string>) {
    const { fixture, httpMock } = setup(queryParamMap);
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ email: 'a@b.c', password: 'Aa1!aaaaaaaa' });
    const submitPromise = cmp.submit();
    httpMock.expectOne('/api/auth/login').flush({});
    httpMock.expectOne('/api/auth/me').flush({
      uid: 'u1', email: 'a@b.c', displayName: 'A', role: 'STUDENT', emailVerified: true,
    });
    await submitPromise;
    return navSpy;
  }

  it('navigates to the redirect param after a successful login', async () => {
    const navSpy = await loginOk(new Map([['redirect', '/catalog/c-1?enroll=1']]));
    expect(navSpy).toHaveBeenCalledWith('/catalog/c-1?enroll=1');
  });

  it('navigates to /dashboard when there is no redirect param', async () => {
    const navSpy = await loginOk(new Map());
    expect(navSpy).toHaveBeenCalledWith('/dashboard');
  });

  it('ignores a redirect value that does not start with /', async () => {
    const navSpy = await loginOk(new Map([['redirect', 'http://evil.example.com']]));
    expect(navSpy).toHaveBeenCalledWith('/dashboard');
  });
});
