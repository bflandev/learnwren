import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { EMPTY, of } from 'rxjs';

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

// Route whose queryParamMap never emits, so toSignal()'s value stays undefined.
function setupNoParams() {
  TestBed.configureTestingModule({
    imports: [LoginPageComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { queryParamMap: EMPTY } },
    ],
  });
  const fixture = TestBed.createComponent(LoginPageComponent);
  fixture.detectChanges();
  return { fixture, httpMock: TestBed.inject(HttpTestingController) };
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

  it('accepts a bare / as a root redirect', async () => {
    const navSpy = await loginOk(new Map([['redirect', '/']]));
    expect(navSpy).toHaveBeenCalledWith('/');
  });

  it('rejects a protocol-relative redirect (//evil.com/path)', async () => {
    const navSpy = await loginOk(new Map([['redirect', '//evil.com/path']]));
    expect(navSpy).toHaveBeenCalledWith('/dashboard');
  });

  it('rejects a URL-encoded protocol-relative redirect (%2F%2Fevil.com)', async () => {
    // Regression note: Angular's queryParamMap.get() decodes %2F%2F to // before
    // the predicate runs, so the component always sees the decoded value.
    // Providing '//evil.com' here mirrors what Angular hands the component.
    const navSpy = await loginOk(new Map([['redirect', '//evil.com']]));
    expect(navSpy).toHaveBeenCalledWith('/dashboard');
  });

  it('rejects a backslash-after-slash redirect (/\\evil.com)', async () => {
    // String literal contains: '/', '\', 'e', 'v', ...
    const navSpy = await loginOk(new Map([['redirect', '/\\evil.com']]));
    expect(navSpy).toHaveBeenCalledWith('/dashboard');
  });

  it('rejects a fully-qualified https redirect', async () => {
    const navSpy = await loginOk(new Map([['redirect', 'https://evil.com']]));
    expect(navSpy).toHaveBeenCalledWith('/dashboard');
  });

  it('rejects a host-like value without a leading slash', async () => {
    const navSpy = await loginOk(new Map([['redirect', 'evil.com']]));
    expect(navSpy).toHaveBeenCalledWith('/dashboard');
  });

  it('rejects an empty redirect value', async () => {
    const navSpy = await loginOk(new Map([['redirect', '']]));
    expect(navSpy).toHaveBeenCalledWith('/dashboard');
  });
});

describe('LoginPageComponent submit early returns and helpers', () => {
  it('does nothing when the form is invalid (no HTTP call)', async () => {
    const { fixture, httpMock } = setup();
    const cmp = fixture.componentInstance;
    // form is empty → required validator fails → submit short-circuits
    expect(cmp.form.invalid).toBe(true);
    await cmp.submit();
    httpMock.verify(); // would throw if any request was made
  });

  it('renders the generic state on an unknown error code', async () => {
    const { fixture, httpMock } = setup();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ email: 'a@b.c', password: 'pw' });
    const submitPromise = cmp.submit();
    httpMock.expectOne('/api/auth/login').flush(
      { error: { code: 'WEIRD_CODE' } },
      { status: 500, statusText: 'ISE' },
    );
    await submitPromise;
    fixture.detectChanges();
    expect(cmp.genericState()).toEqual({ kind: 'generic', message: 'Something went wrong. Please try again.' });
  });

  it('unlockAvailableAtLocal returns a localised time string', () => {
    const { fixture } = setup();
    const cmp = fixture.componentInstance;
    const local = cmp.unlockAvailableAtLocal('2026-05-06T01:00:00.000Z');
    expect(local).toEqual(new Date('2026-05-06T01:00:00.000Z').toLocaleTimeString());
  });
});

describe('LoginPageComponent justChangedEmail notice', () => {
  it('flags justChangedEmail when ?emailChanged=1 is present', () => {
    const { fixture } = setup(new Map([['emailChanged', '1']]));
    expect(fixture.componentInstance.justChangedEmail()).toBe(true);
  });

  it('does not flag justChangedEmail without the query param', () => {
    const { fixture } = setup(new Map());
    expect(fixture.componentInstance.justChangedEmail()).toBe(false);
  });
});

describe('LoginPageComponent justChangedPassword notice', () => {
  it('flags justChangedPassword when ?passwordChanged=1 is present', () => {
    const { fixture } = setup(new Map([['passwordChanged', '1']]));
    expect(fixture.componentInstance.justChangedPassword()).toBe(true);
  });

  it('does not flag justChangedPassword without the query param', () => {
    const { fixture } = setup(new Map());
    expect(fixture.componentInstance.justChangedPassword()).toBe(false);
  });
});

describe('LoginPageComponent.resendVerification', () => {
  it('no-ops when the email field is empty', async () => {
    const { fixture, httpMock } = setup();
    const cmp = fixture.componentInstance;
    // email is empty
    await cmp.resendVerification();
    httpMock.verify();
  });

  it('marks the unverified state as resendSent on success', async () => {
    const { fixture, httpMock } = setup();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ email: 'a@b.c', password: 'pw' });
    const p = cmp.resendVerification();
    const req = httpMock.expectOne('/api/auth/resend-verification');
    expect(req.request.body).toEqual({ email: 'a@b.c' });
    req.flush(null, { status: 202, statusText: 'Accepted' });
    await p;
    expect(cmp.unverifiedState()).toEqual({ kind: 'unverified', resendSent: true });
  });

  it('falls back to a generic error message on failure', async () => {
    const { fixture, httpMock } = setup();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ email: 'a@b.c', password: 'pw' });
    const p = cmp.resendVerification();
    httpMock
      .expectOne('/api/auth/resend-verification')
      .flush(null, { status: 500, statusText: 'ISE' });
    await p;
    expect(cmp.genericState()).toEqual({
      kind: 'generic',
      message: 'Could not send. Please try again.',
    });
  });
});

describe('LoginPageComponent busy state + reset notice', () => {
  it('starts not busy', () => {
    expect(setup().fixture.componentInstance.busy()).toBe(false);
  });

  it('sets busy true during submit and clears it after the response', async () => {
    const { fixture, httpMock } = setup();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ email: 'a@b.c', password: 'pw' });
    const p = cmp.submit();
    expect(cmp.busy()).toBe(true);
    httpMock.expectOne('/api/auth/login').flush(
      { error: { code: 'INVALID_CREDENTIALS' } },
      { status: 401, statusText: 'Unauthorized' },
    );
    await p;
    expect(cmp.busy()).toBe(false);
  });

  it('flags justResetPassword when ?reset=ok', () => {
    expect(setup(new Map([['reset', 'ok']])).fixture.componentInstance.justResetPassword()).toBe(true);
  });

  it('does not flag justResetPassword without the reset param', () => {
    expect(setup(new Map()).fixture.componentInstance.justResetPassword()).toBe(false);
  });

  it('does not flag justResetPassword for a non-"ok" reset value', () => {
    expect(setup(new Map([['reset', 'nope']])).fixture.componentInstance.justResetPassword()).toBe(false);
  });

  it('enforces required + email on the email field and required on the password', () => {
    const f = setup().fixture.componentInstance.form;
    f.setValue({ email: '', password: '' });
    expect(f.invalid).toBe(true);
    f.setValue({ email: 'not-an-email', password: 'pw' });
    expect(f.controls.email.errors).toEqual({ email: true });
    f.setValue({ email: 'a@b.c', password: '' });
    expect(f.controls.password.errors).toEqual({ required: true });
    f.setValue({ email: 'a@b.c', password: 'pw' });
    expect(f.valid).toBe(true);
  });

  it('initialises both controls to empty strings with the email validators', () => {
    const f = setup().fixture.componentInstance.form;
    expect(f.controls.email.value).toBe('');
    expect(f.controls.password.value).toBe('');
    f.controls.email.setValue('');
    expect(f.controls.email.errors).toEqual({ required: true });
  });

  it('the password control carries the required validator (set in the TS form definition)', () => {
    // Deliberately do NOT call detectChanges(): the template's `required`
    // attribute would otherwise attach Angular's RequiredValidator directive and
    // mask whether the TS-side Validators.required is present. Reading the form
    // before the view renders isolates the programmatic validator.
    TestBed.configureTestingModule({
      imports: [LoginPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: of({ get: () => null }) } },
      ],
    });
    const cmp = TestBed.createComponent(LoginPageComponent).componentInstance;
    cmp.form.controls.password.setValue('');
    expect(cmp.form.controls.password.errors).toEqual({ required: true });
    cmp.form.controls.password.setValue('x');
    expect(cmp.form.controls.password.errors).toBeNull();
  });
});

describe('LoginPageComponent initial state + derived computeds', () => {
  it('starts in the "none" error state', () => {
    expect(setup().fixture.componentInstance.errorState()).toEqual({ kind: 'none' });
  });

  it('unverifiedState is null unless the error kind is unverified', () => {
    const cmp = setup().fixture.componentInstance;
    expect(cmp.unverifiedState()).toBeNull();
    cmp.errorState.set({ kind: 'invalid' });
    expect(cmp.unverifiedState()).toBeNull();
    cmp.errorState.set({ kind: 'unverified', resendSent: false });
    expect(cmp.unverifiedState()).toEqual({ kind: 'unverified', resendSent: false });
  });

  it('lockedState is the state only when the kind is locked, else null', () => {
    const cmp = setup().fixture.componentInstance;
    expect(cmp.lockedState()).toBeNull();
    cmp.errorState.set({ kind: 'invalid' });
    expect(cmp.lockedState()).toBeNull();
    cmp.errorState.set({ kind: 'locked', unlockAvailableAt: '2026-01-01T00:00:00.000Z' });
    expect(cmp.lockedState()).toEqual({
      kind: 'locked',
      unlockAvailableAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('genericState is null unless the error kind is generic', () => {
    const cmp = setup().fixture.componentInstance;
    expect(cmp.genericState()).toBeNull();
    cmp.errorState.set({ kind: 'invalid' });
    expect(cmp.genericState()).toBeNull();
    cmp.errorState.set({ kind: 'generic', message: 'boom' });
    expect(cmp.genericState()).toEqual({ kind: 'generic', message: 'boom' });
  });

  it('resets the error state to "none" synchronously at the start of submit', () => {
    const { fixture, httpMock } = setup();
    const cmp = fixture.componentInstance;
    cmp.errorState.set({ kind: 'invalid' });
    cmp.form.setValue({ email: 'a@b.c', password: 'pw' });
    const p = cmp.submit();
    // Before the HTTP response settles, the prior error must already be cleared.
    expect(cmp.errorState()).toEqual({ kind: 'none' });
    httpMock.expectOne('/api/auth/login').flush(
      { error: { code: 'INVALID_CREDENTIALS' } },
      { status: 401, statusText: 'Unauthorized' },
    );
    return p;
  });

  it('query-derived flags are all false (no throw) when the route never emits params', () => {
    const cmp = setupNoParams().fixture.componentInstance;
    expect(cmp.justResetPassword()).toBe(false);
    expect(cmp.justChangedEmail()).toBe(false);
    expect(cmp.justChangedPassword()).toBe(false);
  });

  it('navigates to /dashboard (no throw) on success when the route never emits params', async () => {
    const { fixture, httpMock } = setupNoParams();
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
    expect(navSpy).toHaveBeenCalledWith('/dashboard');
  });

  it('falls back to an empty unlockAvailableAt when ACCOUNT_LOCKED has no details', async () => {
    const { fixture, httpMock } = setup();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ email: 'a@b.c', password: 'pw' });
    const submitPromise = cmp.submit();
    httpMock.expectOne('/api/auth/login').flush(
      { error: { code: 'ACCOUNT_LOCKED' } },
      { status: 423, statusText: 'Locked' },
    );
    await submitPromise;
    expect(cmp.lockedState()).toEqual({ kind: 'locked', unlockAvailableAt: '' });
  });
});
