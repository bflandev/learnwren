import type {
  Lesson,
  Module,
  PublishBlockReason,
  PublishEligibility,
  VideoId,
  VideoState,
} from '@learnwren/shared-data-models';

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

  for (let i = 0; i < modules.length; i++) {
    const m = modules[i];
    if (m === undefined) continue;
    const lessons = lessonsByModule[i] ?? [];
    const moduleCtx = { moduleId: m.id, moduleTitle: m.title, moduleOrder: m.order };

    if (lessons.length === 0) {
      reasons.push({ kind: 'MODULE_HAS_NO_LESSONS', ...moduleCtx });
      continue;
    }

    for (const l of lessons) {
      const lessonCtx = {
        ...moduleCtx,
        lessonId: l.id,
        lessonTitle: l.title,
        lessonOrder: l.order,
      };
      if (!l.videoId) {
        reasons.push({ kind: 'LESSON_HAS_NO_VIDEO', ...lessonCtx });
        continue;
      }
      const state = videoStateById.get(l.videoId);
      if (state === undefined) {
        // Orphan: lesson.videoId set but Video doc missing → fold into LESSON_HAS_NO_VIDEO
        reasons.push({ kind: 'LESSON_HAS_NO_VIDEO', ...lessonCtx });
        continue;
      }
      if (state !== 'READY') {
        reasons.push({
          kind: 'LESSON_VIDEO_NOT_READY',
          ...lessonCtx,
          currentState: state as Exclude<VideoState, 'READY'>,
        });
      }
    }
  }

  if (reasons.length === 0) {
    return { eligible: true, reasons: [] };
  }
  return { eligible: false, reasons };
}
