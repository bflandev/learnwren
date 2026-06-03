import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { NotificationsService } from './notifications.service';

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return { http: TestBed.inject(HttpTestingController), service: TestBed.inject(NotificationsService) };
}

describe('web NotificationsService', () => {
  it('POSTs to the notify endpoint with credentials and returns the result', async () => {
    const { http, service } = setup();
    const promise = service.notifyModule('c1', 'm1');
    const req = http.expectOne('/api/courses/c1/modules/m1/notify');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ notifiedCount: 4 });
    expect(await promise).toEqual({ notifiedCount: 4 });
  });
});
