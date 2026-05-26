import type { CourseId, ISODateString, LessonId, ModuleId, VideoId } from './common';
import type { CourseStatus } from './course';
import type { VideoState } from './video';

/**
 * Response shape of GET /api/learn/courses/:cid/lessons/:lid.
 * The page composes the manifest URL itself; videoId/videoState are both
 * null when the lesson has no video uploaded yet.
 *
 * `progress` is the caller's per-lesson progress (populated by UC-06-02
 * Mark Complete and UC-06-03 Resume Learning; optional for backwards compatibility
 * with pre-Slice-B clients):
 *   - null when the caller is the course's owner (no enrolment doc),
 *   - { completedAt: null, lastWatchedSeconds: 0 } when the caller is an
 *     enrolled student with no progress row yet,
 *   - { completedAt: <ISO|null>, lastWatchedSeconds: <number> } when a row
 *     exists.
 *
 * `outline` is the course structure projection (added in Slice D) carrying all
 * modules and lessons in order, with per-lesson completion state for the caller.
 */
export interface LessonView {
  course: {
    id: CourseId;
    title: string;
    status: CourseStatus;
  };
  lesson: {
    id: LessonId;
    moduleId: ModuleId;
    title: string;
    description?: string;
    videoId: VideoId | null;
    videoState: VideoState | null;
  };
  progress?: {
    completedAt: ISODateString | null;
    lastWatchedSeconds: number;
  } | null;
  outline: CourseOutline;
}

/**
 * A lesson as projected in the course outline (sidebar/drawer on lesson player).
 * Includes minimal data needed to render the outline and track per-lesson completion.
 */
export interface CourseOutlineLesson {
  id: LessonId;
  title: string;
  videoState: VideoState | null;
  completedAt: ISODateString | null;
}

/**
 * The course outline structure: modules in order, each with its lessons in order.
 * Used by the lesson player's sidebar/drawer (UC-06-04).
 */
export interface CourseOutline {
  modules: Array<{
    id: ModuleId;
    title: string;
    lessons: CourseOutlineLesson[];
  }>;
}
