import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AdminHealthReport } from '@learnwren/shared-data-models';

import { AdminHealthService } from './admin-health.service';

describe('AdminHealthService', () => {
  let service: AdminHealthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminHealthService);
    http = TestBed.inject(HttpTestingController);
  });

  it('GETs /api/admin/health and resolves the report', async () => {
    const report: AdminHealthReport = {
      services: [{ key: 'webServer', status: 'UP' }],
      stats: {
        storageUsedBytes: 0,
        registeredUsers: 1,
        publishedCourses: 0,
        pendingTranscodeJobs: 0,
      },
      alerts: [],
      generatedAt: '2026-07-17T00:00:00.000Z' as AdminHealthReport['generatedAt'],
    };

    const promise = service.getReport();
    const req = http.expectOne('/api/admin/health');
    expect(req.request.method).toBe('GET');
    req.flush(report);
    expect(await promise).toEqual(report);
    http.verify();
  });
});
