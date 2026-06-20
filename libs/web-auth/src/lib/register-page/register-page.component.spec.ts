import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { RegisterPageComponent } from './register-page.component';

function setup() {
  TestBed.configureTestingModule({
    imports: [RegisterPageComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: {} } },
    ],
  });
  const fixture = TestBed.createComponent(RegisterPageComponent);
  fixture.detectChanges();
  return { fixture, httpMock: TestBed.inject(HttpTestingController) };
}

describe('RegisterPageComponent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('submits the form and navigates to /register/confirm on success', async () => {
    const { fixture, httpMock } = setup();
    const cmp = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    cmp.form.setValue({ email: 'alice@example.com', password: 'Aa1!aaaaaaaa', displayName: 'Alice' });
    const submitPromise = cmp.submit();
    httpMock.expectOne('/api/auth/register').flush(null, { status: 201, statusText: 'Created' });
    httpMock.expectOne('/api/auth/me').flush({ uid: '1', email: 'alice@example.com', displayName: 'Alice', emailVerified: false });
    await submitPromise;
    expect(navSpy).toHaveBeenCalledWith('/register/confirm?email=alice%40example.com');
    expect(cmp.error()).toBeNull();
  });

  it('shows the enumeration-resistant prose for EMAIL_ALREADY_EXISTS (UC-01-01 ext 3a)', async () => {
    const { fixture, httpMock } = setup();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ email: 'a@b.c', password: 'Aa1!aaaaaaaa', displayName: 'A' });
    const submitPromise = cmp.submit();
    httpMock.expectOne('/api/auth/register').flush(
      { error: { code: 'EMAIL_ALREADY_EXISTS', message: 'Unable…' } },
      { status: 409, statusText: 'Conflict' },
    );
    await submitPromise;
    expect(cmp.error()).toBe('Unable to complete registration. Please check your details.');
  });

  it('shows the unmet-requirements list for WEAK_PASSWORD', async () => {
    const { fixture, httpMock } = setup();
    const cmp = fixture.componentInstance;
    // Valid client-side password so submit() reaches the server; server still returns WEAK_PASSWORD.
    cmp.form.setValue({ email: 'a@b.c', password: 'Aa1!aaaaaaaa', displayName: 'A' });
    const submitPromise = cmp.submit();
    httpMock.expectOne('/api/auth/register').flush(
      {
        error: {
          code: 'WEAK_PASSWORD',
          message: 'weak',
          details: { unmetRequirements: ['MIN_LENGTH', 'DIGIT'] },
        },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await submitPromise;
    expect(cmp.error()).toBe(
      'Password must include: at least 12 characters; at least one digit.',
    );
  });

  it('only enters the WEAK_PASSWORD branch for the WEAK_PASSWORD code', async () => {
    const { fixture, httpMock } = setup();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ email: 'a@b.c', password: 'Aa1!aaaaaaaa', displayName: 'A' });
    const submitPromise = cmp.submit();
    // INVALID_EMAIL carrying unmetRequirements: if the WEAK_PASSWORD guard were
    // broadened, this would wrongly surface the password-requirements list.
    httpMock.expectOne('/api/auth/register').flush(
      {
        error: {
          code: 'INVALID_EMAIL',
          details: { unmetRequirements: ['DIGIT'] },
        },
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await submitPromise;
    expect(cmp.error()).toBe('Please enter a valid email address.');
  });

  for (const { code, message } of [
    { code: 'INVALID_EMAIL', message: 'Please enter a valid email address.' },
    { code: 'EMAIL_TOO_LONG', message: 'Email address must be 254 characters or fewer.' },
    {
      code: 'INVALID_DISPLAY_NAME',
      message: 'Display name is required and must be 80 characters or fewer.',
    },
    { code: 'PASSWORD_TOO_LONG', message: 'Password must be 256 characters or fewer.' },
  ] as const) {
    it(`shows a field-specific message for ${code} (not the generic fallback)`, async () => {
      const { fixture, httpMock } = setup();
      const cmp = fixture.componentInstance;
      cmp.form.setValue({ email: 'a@b.c', password: 'Aa1!aaaaaaaa', displayName: 'A' });
      const submitPromise = cmp.submit();
      httpMock
        .expectOne('/api/auth/register')
        .flush({ error: { code } }, { status: 400, statusText: 'Bad Request' });
      await submitPromise;
      expect(cmp.error()).toBe(message);
    });
  }

  it('client-side validator flags an empty display name', () => {
    const { fixture } = setup();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ email: 'a@b.c', password: 'Aa1!aaaaaaaa', displayName: '' });
    expect(cmp.form.valid).toBe(false);
  });

  it('falls back to a generic message for WEAK_PASSWORD without unmet requirements', async () => {
    const { fixture, httpMock } = setup();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ email: 'a@b.c', password: 'Aa1!aaaaaaaa', displayName: 'A' });
    const submitPromise = cmp.submit();
    httpMock.expectOne('/api/auth/register').flush(
      { error: { code: 'WEAK_PASSWORD' } },
      { status: 400, statusText: 'Bad Request' },
    );
    await submitPromise;
    expect(cmp.error()).toBe('Something went wrong. Please try again.');
  });

  it('falls back to a generic message for an unknown error code', async () => {
    const { fixture, httpMock } = setup();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ email: 'a@b.c', password: 'Aa1!aaaaaaaa', displayName: 'A' });
    const submitPromise = cmp.submit();
    httpMock.expectOne('/api/auth/register').flush(
      {},
      { status: 500, statusText: 'ISE' },
    );
    await submitPromise;
    expect(cmp.error()).toBe('Something went wrong. Please try again.');
  });

  it('does nothing when the form is invalid (no HTTP call)', async () => {
    const { fixture, httpMock } = setup();
    const cmp = fixture.componentInstance;
    // form is empty / invalid by default
    expect(cmp.form.invalid).toBe(true);
    await cmp.submit();
    httpMock.verify();
  });

  it('exposes prose hints for unmet password-policy requirements', () => {
    const { fixture } = setup();
    const cmp = fixture.componentInstance;
    cmp.form.controls.password.setValue('short');
    fixture.detectChanges();
    const hints = cmp.passwordHints();
    expect(hints.some((h) => h.includes('at least 12 characters'))).toBe(true);
  });

  it('returns an empty hints array once the password meets policy', () => {
    const { fixture } = setup();
    const cmp = fixture.componentInstance;
    cmp.form.controls.password.setValue('Aa1!aaaaaaaa');
    fixture.detectChanges();
    expect(cmp.passwordHints()).toEqual([]);
  });

  it('returns no hints (no throw) when a passwordPolicy error lacks an unmet list', () => {
    const { fixture } = setup();
    const cmp = fixture.componentInstance;
    const ctrl = cmp.form.controls.password;
    // Replace the policy validator with one that returns a passwordPolicy error
    // WITHOUT an `unmet` list, then fire valueChanges so the hints signal
    // recomputes against it. The optional chaining on `.unmet?.length` must hold.
    ctrl.setValidators(() => ({ passwordPolicy: {} }));
    ctrl.setValue('anything');
    expect(ctrl.errors).toEqual({ passwordPolicy: {} });
    expect(cmp.passwordHints()).toEqual([]);
  });
});

describe('RegisterPageComponent busy state', () => {
  it('starts not busy', () => {
    expect(setup().fixture.componentInstance.busy()).toBe(false);
  });

  it('sets busy true during submit and clears it after the response', async () => {
    const { fixture, httpMock } = setup();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ email: 'a@b.c', password: 'Aa1!aaaaaaaa', displayName: 'A' });
    const p = cmp.submit();
    expect(cmp.busy()).toBe(true);
    httpMock.expectOne('/api/auth/register').flush(
      { error: { code: 'EMAIL_ALREADY_EXISTS' } },
      { status: 409, statusText: 'Conflict' },
    );
    await p;
    expect(cmp.busy()).toBe(false);
  });

  it('rejects a malformed email and an over-long display name', () => {
    const f = setup().fixture.componentInstance.form;
    f.setValue({ email: 'not-an-email', password: 'Aa1!aaaaaaaa', displayName: 'A' });
    expect(f.controls.email.valid).toBe(false);
    f.setValue({ email: 'a@b.c', password: 'Aa1!aaaaaaaa', displayName: 'x'.repeat(81) });
    expect(f.controls.displayName.valid).toBe(false);
    f.setValue({ email: 'a@b.c', password: 'Aa1!aaaaaaaa', displayName: 'A' });
    expect(f.valid).toBe(true);
  });

  it('initialises every control to an empty string', () => {
    const f = setup().fixture.componentInstance.form;
    expect(f.controls.displayName.value).toBe('');
    expect(f.controls.email.value).toBe('');
    expect(f.controls.password.value).toBe('');
  });

  it('attaches the expected validators to each control', () => {
    const f = setup().fixture.componentInstance.form;

    f.controls.displayName.setValue('');
    expect(f.controls.displayName.errors).toEqual({ required: true });
    f.controls.displayName.setValue('x'.repeat(81));
    expect(f.controls.displayName.errors).toEqual({
      maxlength: { requiredLength: 80, actualLength: 81 },
    });

    f.controls.email.setValue('');
    expect(f.controls.email.errors).toEqual({ required: true });
    f.controls.email.setValue('nope');
    expect(f.controls.email.errors).toEqual({ email: true });

    f.controls.password.setValue('');
    expect(f.controls.password.errors).toMatchObject({ required: true });
    f.controls.password.setValue('short');
    expect(f.controls.password.errors).toMatchObject({ passwordPolicy: {} });
    expect(f.controls.password.errors?.['required']).toBeUndefined();
  });
});
