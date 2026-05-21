import { describe, expect, it } from 'vitest';

import type { CourseId, LessonId, ModuleId, VideoId } from './common';
import type { PublishBlockReason, PublishEligibility } from './publish';

describe('PublishBlockReason', () => {
  it('discriminates COURSE_HAS_NO_MODULES', () => {
    const r: PublishBlockReason = { kind: 'COURSE_HAS_NO_MODULES' };
    expect(r.kind).toBe('COURSE_HAS_NO_MODULES');
  });

  it('discriminates MODULE_HAS_NO_LESSONS', () => {
    const r: PublishBlockReason = {
      kind: 'MODULE_HAS_NO_LESSONS',
      moduleId: 'm1' as ModuleId,
      moduleTitle: 'Module One',
      moduleOrder: 0,
    };
    expect(r.kind).toBe('MODULE_HAS_NO_LESSONS');
  });

  it('discriminates LESSON_HAS_NO_VIDEO', () => {
    const r: PublishBlockReason = {
      kind: 'LESSON_HAS_NO_VIDEO',
      moduleId: 'm1' as ModuleId,
      moduleTitle: 'M',
      moduleOrder: 0,
      lessonId: 'l1' as LessonId,
      lessonTitle: 'L',
      lessonOrder: 0,
    };
    expect(r.kind).toBe('LESSON_HAS_NO_VIDEO');
  });

  it('discriminates LESSON_VIDEO_NOT_READY with currentState', () => {
    const r: PublishBlockReason = {
      kind: 'LESSON_VIDEO_NOT_READY',
      moduleId: 'm1' as ModuleId,
      moduleTitle: 'M',
      moduleOrder: 0,
      lessonId: 'l1' as LessonId,
      lessonTitle: 'L',
      lessonOrder: 0,
      currentState: 'TRANSCODING',
    };
    expect(r.currentState).toBe('TRANSCODING');
  });
});

describe('PublishEligibility', () => {
  it('accepts the eligible: true variant with empty reasons', () => {
    const e: PublishEligibility = { eligible: true, reasons: [] };
    expect(e.eligible).toBe(true);
    expect(e.reasons).toEqual([]);
  });

  it('accepts the eligible: false variant with reasons', () => {
    const e: PublishEligibility = {
      eligible: false,
      reasons: [{ kind: 'COURSE_HAS_NO_MODULES' }],
    };
    expect(e.eligible).toBe(false);
    expect(e.reasons).toHaveLength(1);
  });
});
