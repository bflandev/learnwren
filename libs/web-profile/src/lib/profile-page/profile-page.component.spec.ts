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
