import type { CourseId, EnrollmentId, ISODateString, LessonId, UserId } from './common';

export interface LessonProgress {
  lessonId: LessonId;
  completedAt: ISODateString | null;
  lastWatchedSeconds: number;
}

export interface Enrollment {
  id: EnrollmentId;
  userId: UserId;
  courseId: CourseId;
  progress: LessonProgress[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
