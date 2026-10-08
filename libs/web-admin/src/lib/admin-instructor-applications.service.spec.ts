import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it, afterEach } from 'vitest';

import { AdminInstructorApplicationsService } from './admin-instructor-applications.service';

describe('AdminInstructorApplicationsService', () => {
  let svc: AdminInstructorApplicationsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(AdminInstructorApplicationsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('list GETs the admin list filtered by status', async () => {
    const p = svc.list('DECLINED');
    const req = http.expectOne('/api/admin/instructor-applications?status=DECLINED');
    expect(req.request.method).toBe('GET');
    req.flush({ applications: [] });
    await expect(p).resolves.toEqual({ applications: [] });
  });

  it('approve POSTs to the approve endpoint', async () => {
    const p = svc.approve('u1');
    const req = http.expectOne('/api/admin/instructor-applications/u1/approve');
    expect(req.request.method).toBe('POST');
    req.flush({ status: 'APPROVED' });
    await expect(p).resolves.toEqual({ status: 'APPROVED' });
  });

  it('decline POSTs to the decline endpoint', async () => {
    const p = svc.decline('u1');
    const req = http.expectOne('/api/admin/instructor-applications/u1/decline');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ status: 'DECLINED' });
    await expect(p).resolves.toEqual({ status: 'DECLINED' });
  });

  it('decline sends the reason when given', async () => {
    const p = svc.decline('u1', 'Add a syllabus');
    const req = http.expectOne('/api/admin/instructor-applications/u1/decline');
    expect(req.request.body).toEqual({ reason: 'Add a syllabus' });
    req.flush({ status: 'DECLINED' });
    await p;
  });
});
