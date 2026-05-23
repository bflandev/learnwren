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
    expect(cmp.error()).toContain('at least 12 characters');
    expect(cmp.error()).toContain('at least one digit');
  });

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
});
