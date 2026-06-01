import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { CourseAnalyticsView } from '@learnwren/shared-data-models';

import { AnalyticsService } from './analytics.service';

describe('AnalyticsService (web)', () => {
  let service: AnalyticsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AnalyticsService);
    http = TestBed.inject(HttpTestingController);
  });

  it('GETs /api/courses/:cid/analytics with credentials', async () => {
    const promise = service.getAnalytics('course-1');
    const reqs = http.match('/api/courses/course-1/analytics');
    expect(reqs).toHaveLength(1);
    expect(reqs[0].request.method).toBe('GET');
    expect(reqs[0].request.withCredentials).toBe(true);
    reqs[0].flush({
      courseId: 'course-1',
      enrolledTotal: 0,
      averageCompletionPercent: 0,
      newEnrollments: { last7Days: 0, last30Days: 0, last90Days: 0 },
      totalLessons: 0,
      lessons: [],
      generatedAt: '2026-06-01T00:00:00.000Z',
    } as CourseAnalyticsView);
    const view = await promise;
    expect(view.courseId).toBe('course-1');
  });
});
