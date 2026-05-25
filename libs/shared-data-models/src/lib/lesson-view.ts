import type { CourseId, ISODateString, LessonId, ModuleId, VideoId } from './common';
import type { CourseStatus } from './course';
import type { VideoState } from './video';

/**
 * Response shape of GET /api/learn/courses/:cid/lessons/:lid.
 * The page composes the manifest URL itself; videoId/videoState are both
 * null when the lesson has no video uploaded yet.
 *
 * `progress` is the caller's per-lesson progress (populated by UC-06-02
 * Mark Complete; optional until that slice lands):
 *   - null when the caller is the course's owner (no enrolment doc),
 *   - { completedAt: null } when the caller is an enrolled student who has not
 *     yet completed this lesson,
 *   - { completedAt: <ISO> } when the caller has previously marked it complete.
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
  progress?: { completedAt: ISODateString | null } | null;
}
