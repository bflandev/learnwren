import { describe, expect, it } from 'vitest';

import type { CourseId, ISODateString, LessonId, ModuleId } from './common';
import type { CourseAnalyticsView, LessonAnalyticsRow } from './analytics';

describe('analytics model', () => {
  it('accepts a fully-populated LessonAnalyticsRow literal', () => {
    const row: LessonAnalyticsRow = {
      lessonId: 'l1' as LessonId,
      moduleId: 'm1' as ModuleId,
      title: 'Intro',
      completionRatePercent: 50,
      watchedStudents: 3,
      averageWatchedSeconds: 200,
      durationSec: 295,
      averageWatchedPercent: 68,
    };
    expect(row.averageWatchedPercent).toBe(68);
    expect(row.durationSec).toBe(295);
  });

  it('allows null duration and null averageWatchedPercent (video not ready)', () => {
    const row: LessonAnalyticsRow = {
      lessonId: 'l2' as LessonId,
      moduleId: 'm1' as ModuleId,
      title: 'No video yet',
      completionRatePercent: 0,
      watchedStudents: 0,
      averageWatchedSeconds: 0,
      durationSec: null,
      averageWatchedPercent: null,
    };
    expect(row.durationSec).toBeNull();
    expect(row.averageWatchedPercent).toBeNull();
  });

  it('accepts a CourseAnalyticsView with the 7/30/90 windows', () => {
    const view: CourseAnalyticsView = {
      courseId: 'c1' as CourseId,
      enrolledTotal: 4,
      averageCompletionPercent: 42,
      newEnrollments: { last7Days: 1, last30Days: 2, last90Days: 3 },
      totalLessons: 10,
      lessons: [],
      generatedAt: '2026-06-01T00:00:00.000Z' as ISODateString,
    };
    expect(view.newEnrollments.last30Days).toBe(2);
    expect(view.lessons).toEqual([]);
  });
});
