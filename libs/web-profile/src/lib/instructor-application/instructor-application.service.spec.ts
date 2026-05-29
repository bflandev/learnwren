import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { InstructorApplicationService } from './instructor-application.service';

describe('InstructorApplicationService', () => {
  let svc: InstructorApplicationService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [InstructorApplicationService, provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(InstructorApplicationService);
    http = TestBed.inject(HttpTestingController);
  });

  it('getApplication GETs /api/profile/instructor-application', async () => {
    const p = svc.getApplication();
    const r = http.expectOne('/api/profile/instructor-application');
    expect(r.request.method).toBe('GET');
    r.flush({ status: 'NONE' });
    expect(await p).toEqual({ status: 'NONE' });
  });

  it('submit POSTs the statement + expertise', async () => {
    const p = svc.submit({ statement: 's', expertise: 'e' });
    const r = http.expectOne('/api/profile/instructor-application');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ statement: 's', expertise: 'e' });
    r.flush({ status: 'PENDING', statement: 's', expertise: 'e', createdAt: 't' });
    expect((await p).status).toBe('PENDING');
  });
});
