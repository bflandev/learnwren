import type {
  Lesson,
  Module,
  PublishBlockReason,
  PublishEligibility,
  VideoId,
  VideoState,
} from '@learnwren/shared-data-models';

interface ModuleCtx {
  moduleId: Module['id'];
  moduleTitle: string;
  moduleOrder: number;
}

interface LessonCtx extends ModuleCtx {
  lessonId: Lesson['id'];
  lessonTitle: string;
  lessonOrder: number;
}

export function composeReasons(
  modules: Module[],
  lessonsByModule: Lesson[][],
  videoStateById: Map<VideoId, VideoState>,
): PublishEligibility {
  if (modules.length === 0) {
    return {
      eligible: false,
      reasons: [{ kind: 'COURSE_HAS_NO_MODULES' }],
    };
  }

  const reasons: PublishBlockReason[] = [];
  for (const [i, m] of modules.entries()) {
    reasons.push(...moduleReasons(m, lessonsByModule[i] ?? [], videoStateById));
  }

  if (reasons.length === 0) {
    return { eligible: true, reasons: [] };
  }
  return { eligible: false, reasons };
}

function moduleReasons(
  module_: Module,
  lessons: Lesson[],
  videoStateById: Map<VideoId, VideoState>,
): PublishBlockReason[] {
  const moduleCtx: ModuleCtx = {
    moduleId: module_.id,
    moduleTitle: module_.title,
    moduleOrder: module_.order,
  };
  if (lessons.length === 0) {
    return [{ kind: 'MODULE_HAS_NO_LESSONS', ...moduleCtx }];
  }
  const out: PublishBlockReason[] = [];
  for (const l of lessons) {
    const lessonCtx: LessonCtx = {
      ...moduleCtx,
      lessonId: l.id,
      lessonTitle: l.title,
      lessonOrder: l.order,
    };
    const reason = lessonReason(l, videoStateById, lessonCtx);
    if (reason) out.push(reason);
  }
  return out;
}

function lessonReason(
  lesson: Lesson,
  videoStateById: Map<VideoId, VideoState>,
  ctx: LessonCtx,
): PublishBlockReason | null {
  if (!lesson.videoId) {
    return { kind: 'LESSON_HAS_NO_VIDEO', ...ctx };
  }
  const state = videoStateById.get(lesson.videoId);
  if (state === undefined) {
    // Orphan: lesson.videoId set but Video doc missing → fold into LESSON_HAS_NO_VIDEO
    return { kind: 'LESSON_HAS_NO_VIDEO', ...ctx };
  }
  if (state !== 'READY') {
    return {
      kind: 'LESSON_VIDEO_NOT_READY',
      ...ctx,
      currentState: state as Exclude<VideoState, 'READY'>,
    };
  }
  return null;
}
