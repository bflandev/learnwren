import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { EmailChangeService } from './email-change.service';

describe('EmailChangeService (web)', () => {
  let svc: EmailChangeService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(EmailChangeService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('POSTs the new email + current password to /api/profile/email', async () => {
    const p = svc.requestChange({ newEmail: 'new@x.com', currentPassword: 'pw' });
    const r = http.expectOne('/api/profile/email');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ newEmail: 'new@x.com', currentPassword: 'pw' });
    r.flush(null, { status: 202, statusText: 'Accepted' });
    await p;
  });

  it('POSTs to /api/profile/email/confirm and returns the response', async () => {
    const p = svc.confirm();
    const r = http.expectOne('/api/profile/email/confirm');
    expect(r.request.method).toBe('POST');
    r.flush({ changed: true, email: 'new@x.com' });
    await expect(p).resolves.toEqual({ changed: true, email: 'new@x.com' });
  });
});
