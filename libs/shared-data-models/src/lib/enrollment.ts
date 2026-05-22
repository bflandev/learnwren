import type { CourseId, EnrollmentId, ISODateString, LessonId, UserId } from './common';

export interface LessonProgress {
  lessonId: LessonId;
  completedAt: ISODateString | null;
  lastWatchedSeconds: number;
}

/** ACTIVE = enrolled; WITHDRAWN = soft-deleted, progress retained for re-enrol. */
export const ENROLLMENT_STATUSES = ['ACTIVE', 'WITHDRAWN'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export interface Enrollment {
  id: EnrollmentId; // deterministic composite — `${userId}__${courseId}`
  userId: UserId;
  courseId: CourseId;
  status: EnrollmentStatus;
  progress: LessonProgress[];
  withdrawnAt: ISODateString | null; // set on unenrol, cleared on enrol/re-enrol
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Response of GET /api/enrollments/:courseId — the caller's state for one course. */
export interface EnrollmentStatusView {
  enrollment: Enrollment | null; // the caller's enrolment (any status), or null
  isOwner: boolean; // true when the caller is the course's instructor
}
