import type { CourseId, ISODateString, UserId } from './common';
import type { UserRole } from './user';
import type { CourseStatus } from './course';
import type { EnrollmentStatus } from './enrollment';

/** One row of the admin user directory (GET /api/admin/users). */
export interface AdminUserListRow {
  id: UserId;
  /** '(no display name)' fallback applied server-side when the stored name is blank. */
  displayName: string;
  email: string;
  role: UserRole;
  createdAt: ISODateString;
}

/** Response of GET /api/admin/users. */
export interface AdminUserListResponse {
  users: AdminUserListRow[];
  /** Count after the search filter, before paging. */
  total: number;
  page: number;
  pageSize: number;
  /** True when the users collection exceeded the admin scan cap. */
  capped: boolean;
}

/** One enrollment in a user's history (any status). */
export interface AdminUserEnrollmentRow {
  courseId: CourseId;
  /** '(course deleted)' when the referenced course no longer exists. */
  courseTitle: string;
  status: EnrollmentStatus;
  /** Enrollment.createdAt. */
  enrolledAt: ISODateString;
}

/** One course authored by the user (instructors only). */
export interface AdminAuthoredCourseRow {
  courseId: CourseId;
  title: string;
  status: CourseStatus;
}

/** Response of GET /api/admin/users/:uid. */
export interface AdminUserDetail {
  id: UserId;
  displayName: string;
  email: string;
  biography: string;
  photoUrl?: string;
  role: UserRole;
  createdAt: ISODateString;
  /** Enrollment history (ACTIVE + WITHDRAWN), newest first. */
  enrollments: AdminUserEnrollmentRow[];
  /** Courses this user authored; empty unless they own some. */
  authoredCourses: AdminAuthoredCourseRow[];
}
