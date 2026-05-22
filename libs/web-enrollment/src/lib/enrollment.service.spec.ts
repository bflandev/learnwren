import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { EnrollmentService } from './enrollment.service';

describe('EnrollmentService', () => {
  let service: EnrollmentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EnrollmentService);
    http = TestBed.inject(HttpTestingController);
  });

  it('GET /api/enrollments/:courseId for enrolment status', async () => {
    const promise = service.getEnrollmentStatus('c-1');
    http.expectOne('/api/enrollments/c-1').flush({ enrollment: null, isOwner: false });
    expect((await promise).isOwner).toBe(false);
  });

  it('POST /api/enrollments with the courseId in the body', async () => {
    const promise = service.enroll('c-1');
    const req = http.expectOne('/api/enrollments');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ courseId: 'c-1' });
    req.flush({ id: 'c-1__e' });
    await promise;
  });

  it('DELETE /api/enrollments/:courseId to unenrol', async () => {
    const promise = service.unenroll('c-1');
    const req = http.expectOne('/api/enrollments/c-1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    await promise;
  });
});
