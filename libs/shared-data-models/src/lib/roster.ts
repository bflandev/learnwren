import type { CourseId, ISODateString, UserId } from './common';

/** One enrolled student's row in the instructor roster (US-07-01). */
export interface CourseRosterRow {
  userId: UserId;
  displayName: string;
  email: string;
  /** Enrollment.createdAt — when the student first enrolled. */
  enrolledAt: ISODateString;
  /** Distinct completed lessons that still exist in the course; never exceeds totalLessons. */
  completedLessons: number;
  /** Current lesson count of the course. */
  totalLessons: number;
  /** round(completedLessons / totalLessons * 100); 0 when totalLessons === 0. */
  progressPercent: number;
}

/** Response of GET /api/courses/:cid/students — owner-only roster view. */
export interface CourseRosterView {
  courseId: CourseId;
  totalLessons: number;
  /** ACTIVE enrollees, ordered enrolledAt descending (newest first). */
  students: CourseRosterRow[];
}
