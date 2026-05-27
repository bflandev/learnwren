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

  function flushGet() {
    fixture.detectChanges();
    http.expectOne('/api/profile').flush(MOCK_PROFILE);
    fixture.detectChanges();
  }

  it('populates the form from GET /api/profile', () => {
    flushGet();
    const cmp = fixture.componentInstance;
    expect(cmp.form.value).toEqual({ displayName: 'Etta', biography: 'hi' });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('a@b.c');
  });

  it('renders read-only email and role', () => {
    flushGet();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('STUDENT');
  });

  it('saves and updates AuthService on 200', async () => {
    flushGet();
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
    flushGet();
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
    flushGet();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ displayName: 'A', biography: 'x'.repeat(1001) });
    await cmp.save();
    http.expectNone('/api/profile');         // no PATCH made
    expect(cmp.form.controls.biography.invalid).toBe(true);
  });
});
