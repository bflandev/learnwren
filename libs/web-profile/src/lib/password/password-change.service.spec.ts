import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { PasswordChangeService } from './password-change.service';

describe('PasswordChangeService (web)', () => {
  let svc: PasswordChangeService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(PasswordChangeService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('POSTs current + new password to /api/profile/password', async () => {
    const p = svc.change({ currentPassword: 'old', newPassword: 'new' });
    const r = http.expectOne('/api/profile/password');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ currentPassword: 'old', newPassword: 'new' });
    r.flush(null, { status: 204, statusText: 'No Content' });
    await p;
  });
});
