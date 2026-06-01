import { describe, expect, it } from 'vitest';

import type { CourseId, ISODateString, UserId } from './common';
import type { CourseRosterRow, CourseRosterView } from './roster';

describe('roster model', () => {
  it('accepts a fully-populated CourseRosterRow literal', () => {
    const row: CourseRosterRow = {
      userId: 'u1' as UserId,
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      enrolledAt: '2026-05-22T10:00:00.000Z' as ISODateString,
      completedLessons: 7,
      totalLessons: 10,
      progressPercent: 70,
    };
    expect(row.progressPercent).toBe(70);
    expect(row.email).toContain('@');
  });

  it('accepts a CourseRosterView wrapping rows', () => {
    const view: CourseRosterView = {
      courseId: 'c1' as CourseId,
      totalLessons: 10,
      students: [],
    };
    expect(view.students).toEqual([]);
    expect(view.totalLessons).toBe(10);
  });
});
