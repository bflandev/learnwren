import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, HttpErrorResponse } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { Router } from '@angular/router';

import { AuthService } from '@learnwren/web-auth';

import { PasswordChangeService } from '../password/password-change.service';

import { ProfilePageComponent } from './profile-page.component';

const MOCK_PROFILE = {
  uid: 'u-1',
  email: 'a@b.c',
  displayName: 'Etta',
  biography: 'hi',
  role: 'STUDENT' as const,
  emailVerified: true,
};

describe('ProfilePageComponent', () => {
  let fixture: ComponentFixture<ProfilePageComponent>;
  let http: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProfilePageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(ProfilePageComponent);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  async function flushGet() {
    fixture.detectChanges();                 // triggers ngOnInit → awaits getProfile()
    http.expectOne('/api/profile').flush(MOCK_PROFILE);  // resolves the awaited Promise
    await fixture.whenStable();              // wait for the microtask continuation in ngOnInit
    fixture.detectChanges();                 // pick up the form-setValue + readonly() change
  }

  it('populates the form from GET /api/profile', async () => {
    await flushGet();
    const cmp = fixture.componentInstance;
    expect(cmp.form.value).toEqual({ displayName: 'Etta', biography: 'hi' });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('a@b.c');
  });

  it('renders read-only email and role', async () => {
    await flushGet();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('STUDENT');
  });

  it('saves and updates AuthService on 200', async () => {
    await flushGet();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ displayName: 'New', biography: 'bio' });
    const saved = cmp.save();
    const req = http.expectOne('/api/profile');
    expect(req.request.method).toBe('PATCH');
    req.flush({ uid: 'u-1', email: 'a@b.c', displayName: 'New', role: 'STUDENT', emailVerified: true });
    await saved;
    expect(auth.currentUser()?.displayName).toBe('New');
    expect(cmp.status()).toBe('saved');
  });

  it('surfaces PROFILE_INVALID errors against the right control', async () => {
    await flushGet();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ displayName: '', biography: '' });
    const saved = cmp.save();
    const req = http.expectOne('/api/profile');
    req.flush(
      { error: { code: 'PROFILE_INVALID', message: 'Profile is invalid.', details: { field: 'displayName', reason: 'must be 1-80 characters' } } },
      { status: 400, statusText: 'Bad Request' },
    );
    await saved;
    expect(cmp.form.controls.displayName.errors).toEqual({ server: 'must be 1-80 characters' });
    expect(cmp.status()).toBe('error');
  });

  it('blocks save when client-side validators fail (over-length biography)', async () => {
    await flushGet();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ displayName: 'A', biography: 'x'.repeat(1001) });
    await cmp.save();
    http.expectNone('/api/profile');         // no PATCH made
    expect(cmp.form.controls.biography.invalid).toBe(true);
  });

  it('renders the profile picture uploader', async () => {
    await flushGet();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('lib-profile-picture-uploader')).toBeTruthy();
  });

  it('seeds readonly() email + role and the form values from the loaded profile', async () => {
    await flushGet();
    const cmp = fixture.componentInstance;
    // Kills the L160 setValue object + L161 readonly.set object-literal mutants.
    expect(cmp.readonly()).toEqual({ email: 'a@b.c', role: 'STUDENT' });
    expect(cmp.form.getRawValue()).toEqual({ displayName: 'Etta', biography: 'hi' });
  });

  it('save() trims nothing but sends the exact raw form value and reaches the saved state', async () => {
    await flushGet();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ displayName: 'Zed', biography: 'b' });
    const saved = cmp.save();
    // busy toggle mid-flight (kills the 'saving' BooleanLiteral/StringLiteral)
    expect(cmp.status()).toBe('saving');
    const req = http.expectOne('/api/profile');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ displayName: 'Zed', biography: 'b' });
    req.flush({ uid: 'u-1', email: 'a@b.c', displayName: 'Zed', role: 'STUDENT', emailVerified: true });
    await saved;
    expect(cmp.status()).toBe('saved');
  });

  it('does not surface a server error when the failure is not a 400 (status guard)', async () => {
    await flushGet();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ displayName: 'A', biography: 'b' });
    const saved = cmp.save();
    http.expectOne('/api/profile').flush(
      { error: { code: 'PROFILE_INVALID', message: 'x', details: { field: 'displayName', reason: 'r' } } },
      { status: 500, statusText: 'Internal Server Error' },
    );
    await saved;
    // L181 `err.status !== 400` guard: a 500 must NOT set a field error.
    expect(cmp.form.controls.displayName.errors?.['server']).toBeUndefined();
    expect(cmp.status()).toBe('error');
  });

  it('does not surface a server error when the 400 code is not PROFILE_INVALID', async () => {
    await flushGet();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ displayName: 'A', biography: 'b' });
    const saved = cmp.save();
    http.expectOne('/api/profile').flush(
      { error: { code: 'SOMETHING_ELSE', message: 'x', details: { field: 'displayName', reason: 'r' } } },
      { status: 400, statusText: 'Bad Request' },
    );
    await saved;
    // L183 code-equality guard.
    expect(cmp.form.controls.displayName.errors?.['server']).toBeUndefined();
  });

  it('maps a PROFILE_INVALID error on the biography field to the biography control', async () => {
    await flushGet();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ displayName: 'A', biography: 'b' });
    const saved = cmp.save();
    http.expectOne('/api/profile').flush(
      { error: { code: 'PROFILE_INVALID', message: 'x', details: { field: 'biography', reason: 'too long' } } },
      { status: 400, statusText: 'Bad Request' },
    );
    await saved;
    // L185 field === 'biography' branch.
    expect(cmp.form.controls.biography.errors).toEqual({ server: 'too long' });
    expect(cmp.form.controls.displayName.errors).toBeNull();
  });

  it('ignores a PROFILE_INVALID error for an unknown field', async () => {
    await flushGet();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ displayName: 'A', biography: 'b' });
    const saved = cmp.save();
    http.expectOne('/api/profile').flush(
      { error: { code: 'PROFILE_INVALID', message: 'x', details: { field: 'role', reason: 'nope' } } },
      { status: 400, statusText: 'Bad Request' },
    );
    await saved;
    expect(cmp.form.controls.displayName.errors).toBeNull();
    expect(cmp.form.controls.biography.errors).toBeNull();
  });
});

describe('ProfilePageComponent — form validity', () => {
  let fixture: ComponentFixture<ProfilePageComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [ProfilePageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(ProfilePageComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/profile').flush(MOCK_PROFILE);
    await fixture.whenStable();
  });

  // --- profile form (displayName / biography) maxLength validators (L44–L45) ---
  it('displayName accepts exactly 80 chars and rejects 81 (maxLength 80)', () => {
    const c = fixture.componentInstance.form.controls.displayName;
    c.setValue('x'.repeat(80));
    expect(c.valid).toBe(true);
    c.setValue('x'.repeat(81));
    expect(c.hasError('maxlength')).toBe(true);
  });

  it('biography accepts exactly 1000 chars and rejects 1001 (maxLength 1000)', () => {
    const c = fixture.componentInstance.form.controls.biography;
    c.setValue('x'.repeat(1000));
    expect(c.valid).toBe(true);
    c.setValue('x'.repeat(1001));
    expect(c.hasError('maxlength')).toBe(true);
  });

  it('empty displayName is allowed client-side (required intentionally omitted)', () => {
    const c = fixture.componentInstance.form.controls.displayName;
    c.setValue('');
    expect(c.valid).toBe(true);
  });

  // --- email form validators (L53–L54) ---
  it('newEmail is required and must be a valid email', () => {
    const c = fixture.componentInstance.emailForm.controls.newEmail;
    c.setValue('');
    expect(c.hasError('required')).toBe(true);
    c.setValue('not-an-email');
    expect(c.hasError('email')).toBe(true);
    c.setValue('ok@x.com');
    expect(c.valid).toBe(true);
  });

  it('email-form currentPassword is required', () => {
    const c = fixture.componentInstance.emailForm.controls.currentPassword;
    c.setValue('');
    expect(c.hasError('required')).toBe(true);
    c.setValue('pw');
    expect(c.valid).toBe(true);
  });

  // --- password form validators (L63–L65) + group validator (L21–L25) ---
  it('password-form currentPassword and confirmNewPassword are required', () => {
    const cp = fixture.componentInstance.passwordForm.controls.currentPassword;
    const cn = fixture.componentInstance.passwordForm.controls.confirmNewPassword;
    cp.setValue('');
    cn.setValue('');
    expect(cp.hasError('required')).toBe(true);
    expect(cn.hasError('required')).toBe(true);
  });

  it('newPassword applies the password-policy validator (weak value is invalid)', () => {
    const c = fixture.componentInstance.passwordForm.controls.newPassword;
    c.setValue('weak');
    expect(c.valid).toBe(false);
    c.setValue('Bb2@bbbbbbbb');
    expect(c.valid).toBe(true);
  });

  it('the group confirmMismatch validator fires only when both are set and differ', () => {
    const form = fixture.componentInstance.passwordForm;
    form.setValue({
      currentPassword: 'Aa1!aaaaaaaa',
      newPassword: 'Bb2@bbbbbbbb',
      confirmNewPassword: 'different',
    });
    expect(form.hasError('confirmMismatch')).toBe(true);

    // Matching → no confirmMismatch (kills `np !== cp` and the `np && cp` LogicalOperators).
    form.controls.confirmNewPassword.setValue('Bb2@bbbbbbbb');
    expect(form.hasError('confirmMismatch')).toBe(false);
  });

  it('confirmMismatch does NOT fire when newPassword is empty (the np && cp guard)', () => {
    const form = fixture.componentInstance.passwordForm;
    form.setValue({ currentPassword: 'x', newPassword: '', confirmNewPassword: 'something' });
    expect(form.hasError('confirmMismatch')).toBe(false);
  });

  // --- toggles (L87–L89, L120–L122) ---
  it('toggleEmailForm flips emailFormOpen', () => {
    const cmp = fixture.componentInstance;
    expect(cmp.emailFormOpen()).toBe(false);
    cmp.toggleEmailForm();
    expect(cmp.emailFormOpen()).toBe(true);
    cmp.toggleEmailForm();
    expect(cmp.emailFormOpen()).toBe(false);
  });

  it('togglePasswordForm flips passwordFormOpen', () => {
    const cmp = fixture.componentInstance;
    expect(cmp.passwordFormOpen()).toBe(false);
    cmp.togglePasswordForm();
    expect(cmp.passwordFormOpen()).toBe(true);
    cmp.togglePasswordForm();
    expect(cmp.passwordFormOpen()).toBe(false);
  });

  // --- passwordHints computed (L79–L85) ---
  it('passwordHints is empty for a strong password and lists unmet prose for a weak one', () => {
    const cmp = fixture.componentInstance;
    cmp.passwordForm.controls.newPassword.setValue('Bb2@bbbbbbbb');
    expect(cmp.passwordHints()).toEqual([]);

    cmp.passwordForm.controls.newPassword.setValue('weak');
    const hints = cmp.passwordHints();
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.every((h) => typeof h === 'string' && h.length > 0)).toBe(true);
  });
});

describe('ProfilePageComponent — change email', () => {
  let fixture: ComponentFixture<ProfilePageComponent>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProfilePageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(ProfilePageComponent);
    http = TestBed.inject(HttpTestingController);
  });

  async function flushGet() {
    fixture.detectChanges();
    http.expectOne('/api/profile').flush(MOCK_PROFILE);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('on success shows the "verification sent" state with the new address', async () => {
    await flushGet();
    const cmp = fixture.componentInstance;
    cmp.emailForm.setValue({ newEmail: 'new@x.com', currentPassword: 'pw' });
    const p = cmp.submitEmailChange();
    const req = http.expectOne('/api/profile/email');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ newEmail: 'new@x.com', currentPassword: 'pw' });
    req.flush(null, { status: 202, statusText: 'Accepted' });
    await p;
    expect(cmp.emailStatus()).toBe('sent');
    expect(cmp.pendingEmail()).toBe('new@x.com');
  });

  it('sets emailStatus to "sending" mid-flight before the request resolves', async () => {
    await flushGet();
    const cmp = fixture.componentInstance;
    cmp.emailForm.setValue({ newEmail: 'new@x.com', currentPassword: 'pw' });
    const p = cmp.submitEmailChange();
    // Kills the 'sending' StringLiteral / busy toggle.
    expect(cmp.emailStatus()).toBe('sending');
    http.expectOne('/api/profile/email').flush(null, { status: 202, statusText: 'Accepted' });
    await p;
    expect(cmp.emailStatus()).toBe('sent');
    // success path also closes the form (L102 BooleanLiteral).
    expect(cmp.emailFormOpen()).toBe(false);
  });

  it('falls back to the default email-error message when the body omits one', async () => {
    await flushGet();
    const cmp = fixture.componentInstance;
    cmp.emailForm.setValue({ newEmail: 'new@x.com', currentPassword: 'pw' });
    const p = cmp.submitEmailChange();
    http.expectOne('/api/profile/email').flush(
      { error: { details: { field: 'newEmail' } } },
      { status: 400, statusText: 'Bad Request' },
    );
    await p;
    // Pins the `?? 'Could not change email.'` fallback (L114).
    expect(cmp.emailForm.controls.newEmail.errors?.['server']).toBe('Could not change email.');
  });

  it('ignores an email server error that is not an HttpErrorResponse', async () => {
    await flushGet();
    const cmp = fixture.componentInstance;
    cmp.emailForm.setValue({ newEmail: 'new@x.com', currentPassword: 'pw' });
    const p = cmp.submitEmailChange();
    // Force a non-HttpErrorResponse rejection by erroring the connection with a plain object.
    http.expectOne('/api/profile/email').error(new ProgressEvent('error'));
    await p;
    // applyEmailServerError early-returns; no field error set, status is 'error'.
    expect(cmp.emailStatus()).toBe('error');
  });

  it('maps a CURRENT_PASSWORD_INVALID error to the password field', async () => {
    await flushGet();
    const cmp = fixture.componentInstance;
    cmp.emailForm.setValue({ newEmail: 'new@x.com', currentPassword: 'wrong' });
    const p = cmp.submitEmailChange();
    http.expectOne('/api/profile/email').flush(
      { error: { code: 'CURRENT_PASSWORD_INVALID', message: 'Current password is incorrect.', details: { field: 'currentPassword' } } },
      { status: 400, statusText: 'Bad Request' },
    );
    await p;
    expect(cmp.emailForm.controls.currentPassword.errors?.['server']).toBe('Current password is incorrect.');
    expect(cmp.emailStatus()).toBe('error');
  });

  it('maps an EMAIL_ALREADY_IN_USE error (409) to the newEmail field', async () => {
    await flushGet();
    const cmp = fixture.componentInstance;
    cmp.emailForm.setValue({ newEmail: 'taken@x.com', currentPassword: 'pw' });
    const p = cmp.submitEmailChange();
    http.expectOne('/api/profile/email').flush(
      { error: { code: 'EMAIL_ALREADY_IN_USE', message: 'That email address is already in use.', details: { field: 'newEmail' } } },
      { status: 409, statusText: 'Conflict' },
    );
    await p;
    expect(cmp.emailForm.controls.newEmail.errors?.['server']).toBe('That email address is already in use.');
  });

  it('does not call the API when the email form is invalid', async () => {
    await flushGet();
    const cmp = fixture.componentInstance;
    cmp.emailForm.setValue({ newEmail: '', currentPassword: '' });
    await cmp.submitEmailChange();
    http.expectNone('/api/profile/email');
    expect(cmp.emailForm.controls.newEmail.touched).toBe(true);
    expect(cmp.emailStatus()).not.toBe('sent');
  });

  it('sets error status without a field error on a non-field failure (EMAIL_CHANGE_FAILED)', async () => {
    await flushGet();
    const cmp = fixture.componentInstance;
    cmp.emailForm.setValue({ newEmail: 'new@x.com', currentPassword: 'pw' });
    const p = cmp.submitEmailChange();
    http.expectOne('/api/profile/email').flush(
      { error: { code: 'EMAIL_CHANGE_FAILED', message: 'Server error.' } },
      { status: 500, statusText: 'Internal Server Error' },
    );
    await p;
    expect(cmp.emailStatus()).toBe('error');
    expect(cmp.emailForm.controls.newEmail.errors?.['server']).toBeUndefined();
    expect(cmp.emailForm.controls.currentPassword.errors?.['server']).toBeUndefined();
  });
});

describe('ProfilePageComponent — change password', () => {
  let fixture: ComponentFixture<ProfilePageComponent>;
  let http: HttpTestingController;
  let auth: AuthService;
  const change = vi.fn();
  const navigate = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    change.mockReset();
    navigate.mockReset().mockResolvedValue(true);
    TestBed.configureTestingModule({
      imports: [ProfilePageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PasswordChangeService, useValue: { change } },
        { provide: Router, useValue: { navigate } },
      ],
    });
    fixture = TestBed.createComponent(ProfilePageComponent);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    fixture.detectChanges();
    http.expectOne('/api/profile').flush(MOCK_PROFILE);
  });

  it('on 204 logs out and navigates to /login?passwordChanged=1', async () => {
    change.mockResolvedValue(undefined);
    const logout = vi.spyOn(auth, 'logout').mockResolvedValue(undefined);
    const cmp = fixture.componentInstance;
    cmp.passwordForm.setValue({
      currentPassword: 'Aa1!aaaaaaaa',
      newPassword: 'Bb2@bbbbbbbb',
      confirmNewPassword: 'Bb2@bbbbbbbb',
    });

    await cmp.submitPasswordChange();

    expect(change).toHaveBeenCalledWith({
      currentPassword: 'Aa1!aaaaaaaa',
      newPassword: 'Bb2@bbbbbbbb',
    });
    expect(logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { passwordChanged: 1 } });
  });

  it('does not submit when confirmNewPassword does not match', async () => {
    const cmp = fixture.componentInstance;
    cmp.passwordForm.setValue({
      currentPassword: 'Aa1!aaaaaaaa',
      newPassword: 'Bb2@bbbbbbbb',
      confirmNewPassword: 'mismatch',
    });

    await cmp.submitPasswordChange();
    expect(change).not.toHaveBeenCalled();
  });

  it('maps NEW_PASSWORD_WEAK to a server error on the newPassword control', async () => {
    change.mockRejectedValue(
      new HttpErrorResponse({
        status: 400,
        error: {
          error: {
            code: 'NEW_PASSWORD_WEAK',
            message: 'weak',
            details: { field: 'newPassword', unmetRequirements: ['DIGIT'] },
          },
        },
      }),
    );
    const cmp = fixture.componentInstance;
    cmp.passwordForm.setValue({
      currentPassword: 'Aa1!aaaaaaaa',
      newPassword: 'Bb2@bbbbbbbb',
      confirmNewPassword: 'Bb2@bbbbbbbb',
    });

    await cmp.submitPasswordChange();
    expect(cmp.passwordForm.controls.newPassword.errors?.['server']).toBeTruthy();
  });

  it('maps CURRENT_PASSWORD_INVALID to a server error on the currentPassword control', async () => {
    change.mockRejectedValue(
      new HttpErrorResponse({
        status: 400,
        error: { error: { code: 'CURRENT_PASSWORD_INVALID', message: 'Current password is incorrect.' } },
      }),
    );
    const cmp = fixture.componentInstance;
    cmp.passwordForm.setValue({
      currentPassword: 'WrongPass1!',
      newPassword: 'Bb2@bbbbbbbb',
      confirmNewPassword: 'Bb2@bbbbbbbb',
    });

    await cmp.submitPasswordChange();
    expect(cmp.passwordForm.controls.currentPassword.errors?.['server']).toBeTruthy();
  });

  it('sets passwordStatus to "saving" and clears the banner mid-flight', async () => {
    let resolve!: () => void;
    change.mockReturnValue(new Promise<void>((res) => (resolve = res)));
    vi.spyOn(auth, 'logout').mockResolvedValue(undefined);
    const cmp = fixture.componentInstance;
    cmp.passwordBannerError.set('stale');
    cmp.passwordForm.setValue({
      currentPassword: 'Aa1!aaaaaaaa',
      newPassword: 'Bb2@bbbbbbbb',
      confirmNewPassword: 'Bb2@bbbbbbbb',
    });
    const p = cmp.submitPasswordChange();
    // Kills the 'saving' StringLiteral and the L130 banner-clear (set null).
    expect(cmp.passwordStatus()).toBe('saving');
    expect(cmp.passwordBannerError()).toBeNull();
    resolve();
    await p;
  });

  it('maps PASSWORD_UNCHANGED to a server error on the newPassword control', async () => {
    change.mockRejectedValue(
      new HttpErrorResponse({
        status: 400,
        error: { error: { code: 'PASSWORD_UNCHANGED', message: 'same as old' } },
      }),
    );
    const cmp = fixture.componentInstance;
    cmp.passwordForm.setValue({
      currentPassword: 'Aa1!aaaaaaaa',
      newPassword: 'Bb2@bbbbbbbb',
      confirmNewPassword: 'Bb2@bbbbbbbb',
    });
    await cmp.submitPasswordChange();
    // L151 `code === 'PASSWORD_UNCHANGED'` branch of the OR.
    expect(cmp.passwordForm.controls.newPassword.errors?.['server']).toBe('same as old');
  });

  it('falls back to the default banner message when an uncoded failure omits a message', async () => {
    change.mockRejectedValue(
      new HttpErrorResponse({ status: 500, error: { error: {} } }),
    );
    const cmp = fixture.componentInstance;
    cmp.passwordForm.setValue({
      currentPassword: 'Aa1!aaaaaaaa',
      newPassword: 'Bb2@bbbbbbbb',
      confirmNewPassword: 'Bb2@bbbbbbbb',
    });
    await cmp.submitPasswordChange();
    // Pins the `?? 'Could not change password.'` fallback (L148).
    expect(cmp.passwordBannerError()).toBe('Could not change password.');
  });

  it('ignores a password failure that is not an HttpErrorResponse (no banner, no field error)', async () => {
    change.mockRejectedValue(new Error('network'));
    const cmp = fixture.componentInstance;
    cmp.passwordForm.setValue({
      currentPassword: 'Aa1!aaaaaaaa',
      newPassword: 'Bb2@bbbbbbbb',
      confirmNewPassword: 'Bb2@bbbbbbbb',
    });
    await cmp.submitPasswordChange();
    // L145 `instanceof HttpErrorResponse` early-return.
    expect(cmp.passwordBannerError()).toBeNull();
    expect(cmp.passwordForm.controls.newPassword.errors?.['server']).toBeFalsy();
    expect(cmp.passwordStatus()).toBe('error');
  });

  it('does not call the service when the password form is invalid', async () => {
    const cmp = fixture.componentInstance;
    cmp.passwordForm.setValue({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
    await cmp.submitPasswordChange();
    // L125 invalid guard.
    expect(change).not.toHaveBeenCalled();
  });

  it('routes PASSWORD_CHANGE_FAILED to the form-level banner, not a field', async () => {
    change.mockRejectedValue(
      new HttpErrorResponse({
        status: 500,
        error: { error: { code: 'PASSWORD_CHANGE_FAILED', message: 'We could not change your password. Please try again.' } },
      }),
    );
    const cmp = fixture.componentInstance;
    cmp.passwordForm.setValue({
      currentPassword: 'Aa1!aaaaaaaa',
      newPassword: 'Bb2@bbbbbbbb',
      confirmNewPassword: 'Bb2@bbbbbbbb',
    });

    await cmp.submitPasswordChange();
    expect(cmp.passwordBannerError()).toBeTruthy();
    expect(cmp.passwordForm.controls.newPassword.errors?.['server']).toBeFalsy();
  });
});
