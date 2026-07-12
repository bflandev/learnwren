import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';

import { AuthService } from '@learnwren/web-auth';
import type { AuthenticatedUser } from '@learnwren/web-auth';

import { InstructorApplicationService } from './instructor-application.service';
import { InstructorApplicationComponent } from './instructor-application.component';

function user(role: AuthenticatedUser['role']): AuthenticatedUser {
  return {
    uid: 'u1' as AuthenticatedUser['uid'], email: 'a@b.c', displayName: 'Ada',
    role, emailVerified: true, photoUrl: undefined,
  } as AuthenticatedUser;
}

describe('InstructorApplicationComponent', () => {
  let svc: { getApplication: ReturnType<typeof vi.fn>; submit: ReturnType<typeof vi.fn> };
  let auth: { currentUser: ReturnType<typeof signal<AuthenticatedUser | null>> };

  function create(role: AuthenticatedUser['role']) {
    auth = { currentUser: signal<AuthenticatedUser | null>(user(role)) };
    TestBed.configureTestingModule({
      imports: [InstructorApplicationComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: InstructorApplicationService, useValue: svc },
        { provide: AuthService, useValue: auth },
      ],
    });
    const fixture = TestBed.createComponent(InstructorApplicationComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    svc = {
      getApplication: vi.fn().mockResolvedValue({ status: 'NONE' }),
      submit: vi.fn(),
    };
  });

  it('is not visible to an INSTRUCTOR (and never fetches status)', async () => {
    const fixture = create('INSTRUCTOR');
    await fixture.whenStable();
    expect(svc.getApplication).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).not.toContain('Become an Instructor');
  });

  it('shows a banner instead of rejecting when the initial load fails', async () => {
    svc.getApplication.mockRejectedValue(new HttpErrorResponse({ status: 500, statusText: 'ISE' }));
    const fixture = create('STUDENT');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.bannerError()).toBe(
      'Could not load your application status. Please try again later.',
    );
    expect(fixture.nativeElement.textContent).toContain('Could not load your application status');
  });

  it('shows the under-review card when an application is PENDING', async () => {
    svc.getApplication.mockResolvedValue({ status: 'PENDING', statement: 's', expertise: 'e', createdAt: 't' });
    const fixture = create('STUDENT');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('under review');
  });

  it('submits the form and swaps to the under-review card', async () => {
    svc.submit.mockResolvedValue({ status: 'PENDING', statement: 's', expertise: 'e', createdAt: 't' });
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    cmp.open();
    cmp.form.setValue({ statement: 'I teach', expertise: 'Rust' });
    await cmp.submit();
    expect(svc.submit).toHaveBeenCalledWith({ statement: 'I teach', expertise: 'Rust' });
    expect(cmp.application()?.status).toBe('PENDING');
    expect(cmp.formOpen()).toBe(false);
    expect(cmp.form.controls.statement.value).toBe('');
    expect(cmp.status()).toBe('idle');
  });

  it('marks all controls touched and does not call submit when the form is invalid', async () => {
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    cmp.open();
    // form is empty/invalid — do NOT call setValue
    await cmp.submit();
    expect(svc.submit).not.toHaveBeenCalled();
    expect(cmp.form.controls.statement.touched).toBe(true);
    expect(cmp.form.controls.expertise.touched).toBe(true);
  });

  it('maps an INSTRUCTOR_APPLICATION_INVALID field error onto the control', async () => {
    svc.submit.mockRejectedValue(
      new HttpErrorResponse({
        status: 400,
        error: { error: { code: 'INSTRUCTOR_APPLICATION_INVALID', message: 'x', details: { field: 'statement' } } },
      }),
    );
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    cmp.open();
    cmp.form.setValue({ statement: 'I teach', expertise: 'Rust' });
    await cmp.submit();
    expect(cmp.form.controls.statement.errors?.['server']).toBeTruthy();
    expect(cmp.status()).toBe('idle');
  });

  it('shows a banner and re-fetches on INSTRUCTOR_APPLICATION_EXISTS', async () => {
    svc.submit.mockRejectedValue(
      new HttpErrorResponse({
        status: 409,
        error: { error: { code: 'INSTRUCTOR_APPLICATION_EXISTS', message: 'already' } },
      }),
    );
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    cmp.open();
    cmp.form.setValue({ statement: 'I teach', expertise: 'Rust' });
    svc.getApplication.mockResolvedValue({ status: 'PENDING', statement: 's', expertise: 'e', createdAt: 't' });
    await cmp.submit();
    expect(cmp.bannerError()).toBe('already');
    expect(svc.getApplication).toHaveBeenCalledTimes(2);
    expect(cmp.status()).toBe('idle');
  });

  it('initial signals: status "idle", formOpen false, no banner; form starts invalid (both controls required)', async () => {
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    // Pins the initial signal literals (status='idle', formOpen=false) read before any action.
    expect(cmp.status()).toBe('idle');
    expect(cmp.formOpen()).toBe(false);
    expect(cmp.bannerError()).toBeNull();
    // Empty controls are invalid → Validators.required arrays + the '' initial value matter.
    expect(cmp.form.invalid).toBe(true);
    expect(cmp.form.controls.statement.value).toBe('');
    expect(cmp.form.controls.expertise.value).toBe('');
    expect(cmp.form.controls.statement.hasError('required')).toBe(true);
    expect(cmp.form.controls.expertise.hasError('required')).toBe(true);
  });

  it('each control is individually required: filling only one leaves the other invalid', async () => {
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    // Statement filled, expertise empty → statement valid, expertise still required.
    cmp.form.setValue({ statement: 'I teach', expertise: '' });
    expect(cmp.form.controls.statement.valid).toBe(true);
    expect(cmp.form.controls.expertise.hasError('required')).toBe(true);
    // Now the reverse → kills dropping the required validator on either control.
    cmp.form.setValue({ statement: '', expertise: 'Rust' });
    expect(cmp.form.controls.statement.hasError('required')).toBe(true);
    expect(cmp.form.controls.expertise.valid).toBe(true);
    // Both filled → whole form valid.
    cmp.form.setValue({ statement: 'I teach', expertise: 'Rust' });
    expect(cmp.form.valid).toBe(true);
  });

  it('pending() is false for a NONE application and true once PENDING', async () => {
    svc.getApplication.mockResolvedValue({ status: 'NONE' });
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    // Kills the L41 `=== 'PENDING'` conditional: NONE must be false.
    expect(cmp.pending()).toBe(false);
    cmp.application.set({ status: 'PENDING', statement: 's', expertise: 'e', createdAt: 't' });
    expect(cmp.pending()).toBe(true);
  });

  it('open() sets formOpen to true (kills the open() block + the true literal)', async () => {
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    expect(cmp.formOpen()).toBe(false);
    cmp.open();
    expect(cmp.formOpen()).toBe(true);
  });

  it('submit sets status to "submitting" mid-flight before the service resolves', async () => {
    let resolveSubmit!: (v: unknown) => void;
    svc.submit.mockReturnValue(new Promise((res) => (resolveSubmit = res)));
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    cmp.open();
    cmp.form.setValue({ statement: 'I teach', expertise: 'Rust' });
    const p = cmp.submit();
    // Kills the L62 'submitting' StringLiteral — observed synchronously before resolve.
    expect(cmp.status()).toBe('submitting');
    expect(cmp.bannerError()).toBeNull();
    resolveSubmit({ status: 'PENDING', statement: 's', expertise: 'e', createdAt: 't' });
    await p;
    expect(cmp.status()).toBe('idle');
  });

  it('non-HttpErrorResponse failure shows the generic banner and does not re-fetch', async () => {
    svc.submit.mockRejectedValue(new Error('boom'));
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    cmp.open();
    cmp.form.setValue({ statement: 'I teach', expertise: 'Rust' });
    svc.getApplication.mockClear();
    await cmp.submit();
    // Kills the L77 guard + the L78 generic-message StringLiteral.
    expect(cmp.bannerError()).toBe('Something went wrong. Please try again.');
    // The early return means load() (re-fetch) must NOT run on this branch.
    expect(svc.getApplication).not.toHaveBeenCalled();
    expect(cmp.status()).toBe('idle');
  });

  it('maps an INSTRUCTOR_APPLICATION_INVALID field error onto the EXPERTISE control', async () => {
    svc.submit.mockRejectedValue(
      new HttpErrorResponse({
        status: 400,
        error: { error: { code: 'INSTRUCTOR_APPLICATION_INVALID', message: 'bad expertise', details: { field: 'expertise' } } },
      }),
    );
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    cmp.open();
    cmp.form.setValue({ statement: 'I teach', expertise: 'Rust' });
    svc.getApplication.mockClear();
    await cmp.submit();
    // Kills the L86 `field === 'expertise'` arm + the field-error path.
    expect(cmp.form.controls.expertise.errors?.['server']).toBe('bad expertise');
    // Field-error path returns early — no banner, no re-fetch.
    expect(cmp.bannerError()).toBeNull();
    expect(svc.getApplication).not.toHaveBeenCalled();
  });

  it('INVALID code with an unknown field falls through to the banner + refresh (not a control error)', async () => {
    svc.submit.mockRejectedValue(
      new HttpErrorResponse({
        status: 400,
        error: { error: { code: 'INSTRUCTOR_APPLICATION_INVALID', message: 'weird field', details: { field: 'nope' } } },
      }),
    );
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    cmp.open();
    cmp.form.setValue({ statement: 'I teach', expertise: 'Rust' });
    svc.getApplication.mockClear();
    await cmp.submit();
    // field is neither 'statement' nor 'expertise' → both === checks false → banner branch.
    expect(cmp.form.controls.statement.errors).toBeNull();
    expect(cmp.form.controls.expertise.errors).toBeNull();
    expect(cmp.bannerError()).toBe('weird field');
    expect(svc.getApplication).toHaveBeenCalledTimes(1);
  });

  it('a NON-invalid code carrying a field does NOT set a control error (kills code===INVALID → true)', async () => {
    // EXISTS code + details.field=statement: original skips the field branch (code !== INVALID)
    // and shows a banner; a `true` mutant would wrongly set the statement control error.
    svc.submit.mockRejectedValue(
      new HttpErrorResponse({
        status: 409,
        error: { error: { code: 'INSTRUCTOR_APPLICATION_EXISTS', message: 'dupe', details: { field: 'statement' } } },
      }),
    );
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    cmp.open();
    cmp.form.setValue({ statement: 'I teach', expertise: 'Rust' });
    await cmp.submit();
    expect(cmp.form.controls.statement.errors).toBeNull();
    expect(cmp.bannerError()).toBe('dupe');
  });

  it('uses the default banner message when the error body omits a message', async () => {
    svc.submit.mockRejectedValue(
      new HttpErrorResponse({ status: 409, error: { error: { code: 'INSTRUCTOR_APPLICATION_EXISTS' } } }),
    );
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    cmp.open();
    cmp.form.setValue({ statement: 'I teach', expertise: 'Rust' });
    await cmp.submit();
    // Kills the `?? 'Could not submit your application.'` fallback + the ?? logical operator.
    expect(cmp.bannerError()).toBe('Could not submit your application.');
  });

  it('handles an error body present but with no inner "error" object (kills body?.error chains on code/message)', async () => {
    // body === {} is truthy but body.error is undefined: original `body?.error?.code`
    // and `body?.error?.message` short-circuit to undefined; the mutants `body?.error.code`
    // / `body?.error.message` would throw reading `.code`/`.message` of undefined.
    svc.submit.mockRejectedValue(new HttpErrorResponse({ status: 500, error: {} }));
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    cmp.open();
    cmp.form.setValue({ statement: 'I teach', expertise: 'Rust' });
    await cmp.submit();
    expect(cmp.bannerError()).toBe('Could not submit your application.');
    expect(cmp.form.controls.statement.errors).toBeNull();
  });

  it('INVALID code with no details object falls through to the banner (kills details?.field chain)', async () => {
    // code === INVALID but body.error.details is undefined: original `details?.field`
    // → undefined → neither control matches → banner. Mutant `details.field` would throw.
    svc.submit.mockRejectedValue(
      new HttpErrorResponse({
        status: 400,
        error: { error: { code: 'INSTRUCTOR_APPLICATION_INVALID', message: 'no details' } },
      }),
    );
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    cmp.open();
    cmp.form.setValue({ statement: 'I teach', expertise: 'Rust' });
    await cmp.submit();
    expect(cmp.form.controls.statement.errors).toBeNull();
    expect(cmp.form.controls.expertise.errors).toBeNull();
    expect(cmp.bannerError()).toBe('no details');
  });

  it('uses the default banner message when the error body is entirely absent (null error)', async () => {
    // body undefined → body?.error?.code/message all undefined; kills the body?.error optional chains.
    svc.submit.mockRejectedValue(new HttpErrorResponse({ status: 500, error: null }));
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    cmp.open();
    cmp.form.setValue({ statement: 'I teach', expertise: 'Rust' });
    await cmp.submit();
    expect(cmp.bannerError()).toBe('Could not submit your application.');
    expect(cmp.form.controls.statement.errors).toBeNull();
  });
});
