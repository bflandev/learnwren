import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DeleteAccountService } from './delete-account.service';

describe('DeleteAccountService (web)', () => {
  let svc: DeleteAccountService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    svc = TestBed.inject(DeleteAccountService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends DELETE /api/profile/account with the current password in the body', async () => {
    const p = svc.deleteAccount({ currentPassword: 'pw' });
    const r = http.expectOne('/api/profile/account');
    expect(r.request.method).toBe('DELETE');
    expect(r.request.body).toEqual({ currentPassword: 'pw' });
    r.flush(null, { status: 204, statusText: 'No Content' });
    await p;
  });
});
