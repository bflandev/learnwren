import type { LessonId, ModuleId } from './common';
import type { VideoState } from './video';

export type PublishBlockReason =
  | { kind: 'COURSE_HAS_NO_MODULES' }
  | {
      kind: 'MODULE_HAS_NO_LESSONS';
      moduleId: ModuleId;
      moduleTitle: string;
      moduleOrder: number;
    }
  | {
      kind: 'LESSON_HAS_NO_VIDEO';
      moduleId: ModuleId;
      moduleTitle: string;
      moduleOrder: number;
      lessonId: LessonId;
      lessonTitle: string;
      lessonOrder: number;
    }
  | {
      kind: 'LESSON_VIDEO_NOT_READY';
      moduleId: ModuleId;
      moduleTitle: string;
      moduleOrder: number;
      lessonId: LessonId;
      lessonTitle: string;
      lessonOrder: number;
      currentState: Exclude<VideoState, 'READY'>;
    };

export type PublishEligibility =
  | { eligible: true; reasons: [] }
  | { eligible: false; reasons: PublishBlockReason[] };
