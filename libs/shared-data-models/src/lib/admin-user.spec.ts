import { describe, expect, it } from 'vitest';

import type { CourseId, ISODateString, UserId } from './common';
import type {
  AdminAuthoredCourseRow,
  AdminUserDetail,
  AdminUserEnrollmentRow,
  AdminUserListResponse,
  AdminUserListRow,
  AdminUserStatusResponse,
} from './admin-user';

describe('admin-user model', () => {
  it('accepts a fully-populated AdminUserListRow', () => {
    const row: AdminUserListRow = {
      id: 'u1' as UserId,
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      role: 'STUDENT',
      status: 'ACTIVE',
      createdAt: '2026-06-01T00:00:00.000Z' as ISODateString,
    };
    expect(row.role).toBe('STUDENT');
    expect(row.status).toBe('ACTIVE');
  });

  it('accepts an AdminUserListResponse with paging + capped', () => {
    const res: AdminUserListResponse = {
      users: [],
      total: 0,
      page: 1,
      pageSize: 20,
      capped: false,
    };
    expect(res.capped).toBe(false);
  });

  it('accepts an AdminUserDetail with enrollment + authored sections', () => {
    const enrolment: AdminUserEnrollmentRow = {
      courseId: 'c1' as CourseId,
      courseTitle: 'Intro',
      status: 'ACTIVE',
      enrolledAt: '2026-06-02T00:00:00.000Z' as ISODateString,
    };
    const authored: AdminAuthoredCourseRow = {
      courseId: 'c2' as CourseId,
      title: 'Advanced',
      status: 'PUBLISHED',
    };
    const detail: AdminUserDetail = {
      id: 'u1' as UserId,
      displayName: 'Ada',
      email: 'ada@example.com',
      biography: '',
      role: 'INSTRUCTOR',
      status: 'ACTIVE',
      createdAt: '2026-06-01T00:00:00.000Z' as ISODateString,
      enrollments: [enrolment],
      authoredCourses: [authored],
    };
    expect(detail.enrollments[0]?.status).toBe('ACTIVE');
    expect(detail.authoredCourses[0]?.status).toBe('PUBLISHED');
  });

  it('accepts an AdminUserStatusResponse', () => {
    const res: AdminUserStatusResponse = { id: 'u1' as UserId, status: 'SUSPENDED' };
    expect(res.status).toBe('SUSPENDED');
  });
});
