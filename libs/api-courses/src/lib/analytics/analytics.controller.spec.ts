import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Course, CourseAnalyticsView, CourseId } from '@learnwren/shared-data-models';

import type { CourseScopedRequest } from '../types/loaded-course';
import { AnalyticsController } from './analytics.controller';
import type { AnalyticsService } from './analytics.service';

const CID = 'course-1' as CourseId;
const course = { id: CID } as Course;

describe('AnalyticsController', () => {
  let svc: { getAnalytics: ReturnType<typeof vi.fn> };
  let controller: AnalyticsController;

  beforeEach(() => {
    svc = {
      getAnalytics: vi.fn().mockResolvedValue({
        courseId: CID,
        enrolledTotal: 0,
        averageCompletionPercent: 0,
        newEnrollments: { last7Days: 0, last30Days: 0, last90Days: 0 },
        totalLessons: 0,
        lessons: [],
        generatedAt: '2026-06-01T00:00:00.000Z',
      } as CourseAnalyticsView),
    };
    controller = new AnalyticsController(svc as unknown as AnalyticsService);
  });

  it('GET :cid/analytics delegates the guard-loaded course to the service', async () => {
    const req = { user: { uid: 'owner' }, course } as CourseScopedRequest;
    const view = await controller.getAnalytics(req);
    expect(svc.getAnalytics).toHaveBeenCalledWith(course);
    expect(view.courseId).toBe(CID);
  });

  it('throws if the owner guard did not attach the course', async () => {
    const req = { user: { uid: 'owner' } } as CourseScopedRequest;
    await expect(controller.getAnalytics(req)).rejects.toThrow();
  });
});
