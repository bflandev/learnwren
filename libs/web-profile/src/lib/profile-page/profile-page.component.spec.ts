import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, expect, it, beforeEach } from 'vitest';

import { AuthService } from '@learnwren/web-auth';

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
