import { describe, expect, it } from 'vitest';

import type { CourseId, EnrollmentId, ISODateString, LessonId, UserId } from './common';
import { ENROLLMENT_STATUSES, type Enrollment, type EnrollmentListView, type LessonProgress } from './enrollment';

describe('enrollment model', () => {
  it('exposes the ACTIVE and WITHDRAWN statuses', () => {
    expect(ENROLLMENT_STATUSES).toEqual(['ACTIVE', 'WITHDRAWN']);
  });

  it('accepts a fully-populated Enrollment literal', () => {
    const e: Enrollment = {
      id: 'u1__c1' as EnrollmentId,
      userId: 'u1' as UserId,
      courseId: 'c1' as CourseId,
      status: 'ACTIVE',
      progress: [],
      withdrawnAt: null,
      lastAccessedLessonId: null,
      lastAccessedAt: null,
      createdAt: '2026-05-22T10:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-22T10:00:00.000Z' as ISODateString,
    };
    expect(e.status).toBe('ACTIVE');
    expect(e.withdrawnAt).toBeNull();
  });
});

describe('Enrollment (Slice C)', () => {
  it('accepts lastAccessedLessonId and lastAccessedAt as nullable companion fields', () => {
    const e: Enrollment = {
      id: 'u__c' as EnrollmentId,
      userId: 'u' as UserId,
      courseId: 'c' as CourseId,
      status: 'ACTIVE',
      progress: [],
      withdrawnAt: null,
      lastAccessedLessonId: 'lesson-x' as LessonId,
      lastAccessedAt: '2026-05-25T12:00:00.000Z' as ISODateString,
      createdAt: '2026-05-01T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-25T12:00:00.000Z' as ISODateString,
    };
    expect(e.lastAccessedLessonId).toBe('lesson-x');
    expect(e.lastAccessedAt).toMatch(/2026/);
  });

  it('accepts null for both companion fields', () => {
    const e: Pick<Enrollment, 'lastAccessedLessonId' | 'lastAccessedAt'> = {
      lastAccessedLessonId: null,
      lastAccessedAt: null,
    };
    expect(e.lastAccessedLessonId).toBeNull();
    expect(e.lastAccessedAt).toBeNull();
  });

  it('LessonProgress has a numeric lastWatchedSeconds', () => {
    const p: LessonProgress = { lessonId: 'l' as LessonId, completedAt: null, lastWatchedSeconds: 42 };
    expect(p.lastWatchedSeconds).toBe(42);
  });
});

describe('completion rollup types', () => {
  it('Enrollment carries a completedAt stamp', () => {
    const enrollment: Enrollment = {
      id: 'u1__c1' as EnrollmentId,
      userId: 'u1' as UserId,
      courseId: 'c1' as CourseId,
      status: 'ACTIVE',
      progress: [],
      withdrawnAt: null,
      lastAccessedLessonId: null,
      lastAccessedAt: null,
      completedAt: '2026-07-09T00:00:00.000Z' as ISODateString,
      createdAt: '2026-07-01T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-07-09T00:00:00.000Z' as ISODateString,
    };
    expect(enrollment.completedAt).toBe('2026-07-09T00:00:00.000Z');
  });

  it('EnrollmentListView shapes the GET /api/enrollments response', () => {
    const view: EnrollmentListView = {
      enrollments: [
        {
          courseId: 'c1' as CourseId,
          courseTitle: 'Course 1',
          completedAt: null,
        },
      ],
    };
    expect(view.enrollments[0].courseTitle).toBe('Course 1');
  });
});
