import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { EmailActionPageComponent } from './email-action-page.component';

function setup(params: Record<string, string | null>) {
  TestBed.configureTestingModule({
    imports: [EmailActionPageComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { queryParamMap: { get: (k: string) => params[k] ?? null } },
        },
      },
    ],
  });
  return TestBed;
}

describe('EmailActionPageComponent', () => {
  it('shows invalid state and sends no POST when token is missing', () => {
    const tb = setup({ mode: 'verify-email' });
    const httpMock = tb.inject(HttpTestingController);
    const fixture = tb.createComponent(EmailActionPageComponent);
    fixture.detectChanges();
    httpMock.verify();
    expect(fixture.nativeElement.textContent).toMatch(/invalid or has expired/i);
  });

  it('shows invalid state and sends no POST when mode is missing', () => {
    const tb = setup({ token: 'TOK' });
    const httpMock = tb.inject(HttpTestingController);
    const fixture = tb.createComponent(EmailActionPageComponent);
    fixture.detectChanges();
    httpMock.verify();
    expect(fixture.nativeElement.textContent).toMatch(/invalid or has expired/i);
  });

  it('shows invalid state and sends no POST for an unknown mode', () => {
    const tb = setup({ mode: 'frobnicate', token: 'TOK' });
    const httpMock = tb.inject(HttpTestingController);
    const fixture = tb.createComponent(EmailActionPageComponent);
    fixture.detectChanges();
    httpMock.verify();
    expect(fixture.nativeElement.textContent).toMatch(/invalid or has expired/i);
  });

  describe('verify-email', () => {
    it('POSTs on init (pending), then shows verified on ok', async () => {
      const tb = setup({ mode: 'verify-email', token: 'TOK' });
      const httpMock = tb.inject(HttpTestingController);
      const fixture = tb.createComponent(EmailActionPageComponent);
      const initPromise = fixture.componentInstance.ngOnInit();
      expect(fixture.componentInstance.state()).toEqual({ kind: 'pending' });
      httpMock
        .expectOne('/api/auth/email-action')
        .flush(null, { status: 204, statusText: 'No Content' });
      await initPromise;
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Email verified');
      const link = fixture.nativeElement.querySelector('a');
      expect(link.textContent).toContain('Continue to sign in');
      expect(link.getAttribute('href')).toBe('/login');
    });

    it('shows invalid state on TOKEN_INVALID_OR_EXPIRED', async () => {
      const tb = setup({ mode: 'verify-email', token: 'BAD' });
      const httpMock = tb.inject(HttpTestingController);
      const fixture = tb.createComponent(EmailActionPageComponent);
      const initPromise = fixture.componentInstance.ngOnInit();
      httpMock
        .expectOne('/api/auth/email-action')
        .flush(
          { error: { code: 'TOKEN_INVALID_OR_EXPIRED' } },
          { status: 400, statusText: 'Bad Request' },
        );
      await initPromise;
      fixture.detectChanges();
      expect(fixture.componentInstance.state()).toEqual({ kind: 'invalid' });
      expect(fixture.nativeElement.textContent).toMatch(/invalid or has expired/i);
    });

    it('shows error alert on any other error', async () => {
      const tb = setup({ mode: 'verify-email', token: 'X' });
      const httpMock = tb.inject(HttpTestingController);
      const fixture = tb.createComponent(EmailActionPageComponent);
      const initPromise = fixture.componentInstance.ngOnInit();
      httpMock.expectOne('/api/auth/email-action').flush({}, { status: 500, statusText: 'ISE' });
      await initPromise;
      fixture.detectChanges();
      expect(fixture.componentInstance.state()).toEqual({ kind: 'error' });
    });
  });

  describe('change-email', () => {
    it('POSTs on init and navigates to the email-changed landing page on ok', async () => {
      const tb = setup({ mode: 'change-email', token: 'TOK' });
      const httpMock = tb.inject(HttpTestingController);
      const fixture = tb.createComponent(EmailActionPageComponent);
      const router = tb.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      const initPromise = fixture.componentInstance.ngOnInit();
      httpMock
        .expectOne('/api/auth/email-action')
        .flush(null, { status: 204, statusText: 'No Content' });
      await initPromise;
      expect(navigateSpy).toHaveBeenCalledWith('/settings/profile/email-changed');
    });

    it('shows taken state on EMAIL_ALREADY_EXISTS', async () => {
      const tb = setup({ mode: 'change-email', token: 'TOK' });
      const httpMock = tb.inject(HttpTestingController);
      const fixture = tb.createComponent(EmailActionPageComponent);
      const initPromise = fixture.componentInstance.ngOnInit();
      httpMock
        .expectOne('/api/auth/email-action')
        .flush(
          { error: { code: 'EMAIL_ALREADY_EXISTS' } },
          { status: 409, statusText: 'Conflict' },
        );
      await initPromise;
      fixture.detectChanges();
      expect(fixture.componentInstance.state()).toEqual({ kind: 'taken' });
      expect(fixture.nativeElement.textContent).toMatch(/already in use/i);
    });

    it('shows invalid state on TOKEN_INVALID_OR_EXPIRED', async () => {
      const tb = setup({ mode: 'change-email', token: 'BAD' });
      const httpMock = tb.inject(HttpTestingController);
      const fixture = tb.createComponent(EmailActionPageComponent);
      const initPromise = fixture.componentInstance.ngOnInit();
      httpMock
        .expectOne('/api/auth/email-action')
        .flush(
          { error: { code: 'TOKEN_INVALID_OR_EXPIRED' } },
          { status: 400, statusText: 'Bad Request' },
        );
      await initPromise;
      fixture.detectChanges();
      expect(fixture.componentInstance.state()).toEqual({ kind: 'invalid' });
    });
  });

  describe('reset-password', () => {
    it('renders a form with no POST on init', () => {
      const tb = setup({ mode: 'reset-password', token: 'TOK' });
      const httpMock = tb.inject(HttpTestingController);
      const fixture = tb.createComponent(EmailActionPageComponent);
      fixture.detectChanges();
      httpMock.verify();
      expect(fixture.componentInstance.state()).toEqual({ kind: 'resetForm' });
      const label = fixture.nativeElement.querySelector('label');
      expect(label.textContent).toContain('New password');
      const button = fixture.nativeElement.querySelector('button[type="submit"]');
      expect(button.textContent).toContain('Set new password');
    });

    it('sends no POST when the submitted password fails client validation', () => {
      const tb = setup({ mode: 'reset-password', token: 'TOK' });
      const httpMock = tb.inject(HttpTestingController);
      const fixture = tb.createComponent(EmailActionPageComponent);
      fixture.detectChanges();
      fixture.componentInstance.form.controls.password.setValue('short');
      fixture.componentInstance.submit();
      httpMock.verify();
    });

    it('POSTs with newPassword and navigates to /login?reset=ok on a valid submit', async () => {
      const tb = setup({ mode: 'reset-password', token: 'TOK' });
      const httpMock = tb.inject(HttpTestingController);
      const fixture = tb.createComponent(EmailActionPageComponent);
      const router = tb.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      fixture.detectChanges();
      fixture.componentInstance.form.controls.password.setValue('Brand-New-Pass-42!');
      const submitPromise = fixture.componentInstance.submit();
      expect(fixture.componentInstance.busy()).toBe(true);
      const req = httpMock.expectOne('/api/auth/email-action');
      expect(req.request.body).toEqual({
        mode: 'reset-password',
        token: 'TOK',
        newPassword: 'Brand-New-Pass-42!',
      });
      req.flush(null, { status: 204, statusText: 'No Content' });
      await submitPromise;
      expect(navigateSpy).toHaveBeenCalledWith('/login?reset=ok');
      expect(fixture.componentInstance.busy()).toBe(false);
    });

    it('shows unmet rules on WEAK_PASSWORD', async () => {
      const tb = setup({ mode: 'reset-password', token: 'TOK' });
      const httpMock = tb.inject(HttpTestingController);
      const fixture = tb.createComponent(EmailActionPageComponent);
      fixture.detectChanges();
      fixture.componentInstance.form.controls.password.setValue('Brand-New-Pass-42!');
      const submitPromise = fixture.componentInstance.submit();
      httpMock.expectOne('/api/auth/email-action').flush(
        {
          error: {
            code: 'WEAK_PASSWORD',
            details: { unmetRequirements: ['MIN_LENGTH', 'DIGIT'] },
          },
        },
        { status: 400, statusText: 'Bad Request' },
      );
      await submitPromise;
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toMatch(/at least 12 characters/i);
      expect(fixture.nativeElement.textContent).toMatch(/at least one digit/i);
    });

    it('shows invalid state on TOKEN_INVALID_OR_EXPIRED', async () => {
      const tb = setup({ mode: 'reset-password', token: 'BAD' });
      const httpMock = tb.inject(HttpTestingController);
      const fixture = tb.createComponent(EmailActionPageComponent);
      fixture.detectChanges();
      fixture.componentInstance.form.controls.password.setValue('Brand-New-Pass-42!');
      const submitPromise = fixture.componentInstance.submit();
      httpMock
        .expectOne('/api/auth/email-action')
        .flush(
          { error: { code: 'TOKEN_INVALID_OR_EXPIRED' } },
          { status: 400, statusText: 'Bad Request' },
        );
      await submitPromise;
      fixture.detectChanges();
      expect(fixture.componentInstance.state()).toEqual({ kind: 'invalid' });
    });

    it('shows a generic error alert on any other failure', async () => {
      const tb = setup({ mode: 'reset-password', token: 'X' });
      const httpMock = tb.inject(HttpTestingController);
      const fixture = tb.createComponent(EmailActionPageComponent);
      fixture.detectChanges();
      fixture.componentInstance.form.controls.password.setValue('Brand-New-Pass-42!');
      const submitPromise = fixture.componentInstance.submit();
      httpMock.expectOne('/api/auth/email-action').flush({}, { status: 500, statusText: 'ISE' });
      await submitPromise;
      fixture.detectChanges();
      expect(fixture.componentInstance.state()).toEqual({ kind: 'resetForm' });
      expect(fixture.nativeElement.textContent).toMatch(/something went wrong/i);
    });

    it('disables the submit button while submitting', async () => {
      const tb = setup({ mode: 'reset-password', token: 'TOK' });
      const httpMock = tb.inject(HttpTestingController);
      const fixture = tb.createComponent(EmailActionPageComponent);
      const router = tb.inject(Router);
      vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      fixture.detectChanges();
      fixture.componentInstance.form.controls.password.setValue('Brand-New-Pass-42!');
      const submitPromise = fixture.componentInstance.submit();
      fixture.detectChanges();
      const button = fixture.nativeElement.querySelector('button[type="submit"]');
      expect(button.disabled).toBe(true);
      httpMock
        .expectOne('/api/auth/email-action')
        .flush(null, { status: 204, statusText: 'No Content' });
      await submitPromise;
    });
  });

  describe('error mapping and hints', () => {
    async function initWith(mode: string, body: unknown, status: number) {
      const tb = setup({ mode, token: 'TOK' });
      const httpMock = tb.inject(HttpTestingController);
      const fixture = tb.createComponent(EmailActionPageComponent);
      const initPromise = fixture.componentInstance.ngOnInit();
      httpMock.expectOne('/api/auth/email-action').flush(body, { status, statusText: 'X' });
      await initPromise;
      return fixture.componentInstance;
    }

    async function submitWith(body: unknown) {
      const tb = setup({ mode: 'reset-password', token: 'TOK' });
      const httpMock = tb.inject(HttpTestingController);
      const fixture = tb.createComponent(EmailActionPageComponent);
      fixture.detectChanges();
      fixture.componentInstance.form.controls.password.setValue('Brand-New-Pass-42!');
      const submitPromise = fixture.componentInstance.submit();
      httpMock.expectOne('/api/auth/email-action').flush(body, { status: 400, statusText: 'Bad Request' });
      await submitPromise;
      return fixture.componentInstance;
    }

    it('change-email shows error (not taken) on a non-conflict failure', async () => {
      const c = await initWith('change-email', { error: { code: 'INTERNAL' } }, 500);
      expect(c.state()).toEqual({ kind: 'error' });
    });

    it('joins unmet WEAK_PASSWORD rules with "; " in one message', async () => {
      const c = await submitWith({
        error: { code: 'WEAK_PASSWORD', details: { unmetRequirements: ['MIN_LENGTH', 'DIGIT'] } },
      });
      expect(c.error()).toMatch(/^Password must include: .+; .+\.$/);
    });

    it('WEAK_PASSWORD without unmet rules falls back to the generic message', async () => {
      const c = await submitWith({ error: { code: 'WEAK_PASSWORD' } });
      expect(c.error()).toBe('Something went wrong. Please try again.');
    });

    it('PASSWORD_TOO_LONG shows the length limit', async () => {
      const c = await submitWith({ error: { code: 'PASSWORD_TOO_LONG' } });
      expect(c.error()).toBe('Password must be 256 characters or fewer.');
    });

    it('the password field starts empty and hints track the policy', () => {
      const tb = setup({ mode: 'reset-password', token: 'TOK' });
      const fixture = tb.createComponent(EmailActionPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      expect(c.form.controls.password.value).toBe('');
      c.form.controls.password.setValue('short');
      expect(c.passwordHints().length).toBeGreaterThan(0);
      expect(c.passwordHints().every((h) => typeof h === 'string' && h.length > 0)).toBe(true);
      c.form.controls.password.setValue('Brand-New-Pass-42!');
      expect(c.passwordHints()).toEqual([]);
    });
  });
});
