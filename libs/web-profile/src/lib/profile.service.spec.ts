import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import type { UserId } from '@learnwren/shared-data-models';

import { ProfileService } from './profile.service';

describe('ProfileService', () => {
  let svc: ProfileService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(ProfileService);
    http = TestBed.inject(HttpTestingController);
  });

  it('getProfile() issues GET /api/profile and returns the body', async () => {
    const p = svc.getProfile();
    const req = http.expectOne('/api/profile');
    expect(req.request.method).toBe('GET');
    req.flush({ uid: 'u-1', email: 'a@b.c', displayName: 'A', biography: '', role: 'STUDENT', emailVerified: true });
    await expect(p).resolves.toMatchObject({ displayName: 'A', biography: '' });
  });

  it('updateProfile() PATCHes /api/profile with the body and returns MeResponse', async () => {
    const p = svc.updateProfile({ displayName: 'New', biography: 'hi' });
    const req = http.expectOne('/api/profile');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ displayName: 'New', biography: 'hi' });
    req.flush({ uid: 'u-1' as UserId, email: 'a@b.c', displayName: 'New', role: 'STUDENT', emailVerified: true });
    await expect(p).resolves.toMatchObject({ displayName: 'New' });
  });

  it('updateProfile() rejects with HttpErrorResponse on 400', async () => {
    const p = svc.updateProfile({ displayName: '', biography: '' });
    const req = http.expectOne('/api/profile');
    req.flush(
      { error: { code: 'PROFILE_INVALID', message: 'Profile is invalid.', details: { field: 'displayName', reason: 'must be 1-80 characters' } } },
      { status: 400, statusText: 'Bad Request' },
    );
    await expect(p).rejects.toMatchObject({ status: 400 });
  });
});
