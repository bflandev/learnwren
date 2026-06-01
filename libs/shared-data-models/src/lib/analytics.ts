import type { CourseId, ISODateString, LessonId, ModuleId } from './common';

/** Per-lesson analytics row (US-07-02). */
export interface LessonAnalyticsRow {
  lessonId: LessonId;
  moduleId: ModuleId;
  title: string;
  /** ACTIVE students with completedAt for this lesson ÷ enrolledTotal, rounded. 0 when no students. */
  completionRatePercent: number;
  /** ACTIVE students who have a progress row for this lesson. */
  watchedStudents: number;
  /** Mean lastWatchedSeconds over watchedStudents (furthest position, NOT cumulative watch time). 0 when none. */
  averageWatchedSeconds: number;
  /** Lesson video's READY duration, or null when the video is missing/processing. */
  durationSec: number | null;
  /** averageWatchedSeconds ÷ durationSec, rounded; null when durationSec is unavailable. */
  averageWatchedPercent: number | null;
}

/** Response of GET /api/courses/:cid/analytics — owner-only course analytics. */
export interface CourseAnalyticsView {
  courseId: CourseId;
  enrolledTotal: number;
  /** Mean per-student progress % across ACTIVE enrollees. 0 when no students/lessons. */
  averageCompletionPercent: number;
  newEnrollments: {
    last7Days: number;
    last30Days: number;
    last90Days: number;
  };
  totalLessons: number;
  /** One row per current lesson, ordered by module order then lesson order. */
  lessons: LessonAnalyticsRow[];
  /** Request-time timestamp; conveys freshness in the UI. */
  generatedAt: ISODateString;
}
