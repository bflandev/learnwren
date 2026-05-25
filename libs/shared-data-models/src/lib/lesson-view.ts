import type { CourseId, ISODateString, LessonId, ModuleId, VideoId } from './common';
import type { CourseStatus } from './course';
import type { VideoState } from './video';

/**
 * Response shape of GET /api/learn/courses/:cid/lessons/:lid.
 * The page composes the manifest URL itself; videoId/videoState are both
 * null when the lesson has no video uploaded yet.
 *
 * progress is null for the course owner (no enrolment row); enrolled students
 * receive { completedAt: <iso> | null } where null means not yet completed.
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
    description: string;
    videoId: VideoId | null;
    videoState: VideoState | null;
  };
  progress: { completedAt: ISODateString | null } | null;
}
