import { describe, expect, it } from 'vitest';

import type { CourseId, EnrollmentId, ISODateString, UserId } from './common';
import { ENROLLMENT_STATUSES, type Enrollment } from './enrollment';

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
      createdAt: '2026-05-22T10:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-22T10:00:00.000Z' as ISODateString,
    };
    expect(e.status).toBe('ACTIVE');
    expect(e.withdrawnAt).toBeNull();
  });
});
