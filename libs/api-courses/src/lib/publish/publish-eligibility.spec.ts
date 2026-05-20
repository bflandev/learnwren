import { describe, expect, it } from 'vitest';

import type {
  CourseId,
  ISODateString,
  Lesson,
  LessonId,
  Module,
  ModuleId,
  UserId,
  VideoId,
  VideoState,
} from '@learnwren/shared-data-models';

import { composeReasons } from './publish-eligibility';

const COURSE = 'c1' as CourseId;
const NOW = '2026-05-20T10:00:00.000Z' as ISODateString;

function makeModule(id: string, title: string, order: number): Module {
  return {
    id: id as ModuleId,
    courseId: COURSE,
    title,
    order,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeLesson(
  id: string,
  title: string,
  order: number,
  moduleId: string,
  videoId?: string,
): Lesson {
  return {
    id: id as LessonId,
    moduleId: moduleId as ModuleId,
    title,
    order,
    ...(videoId ? { videoId: videoId as VideoId } : {}),
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('composeReasons', () => {
  it('returns COURSE_HAS_NO_MODULES (alone) for an empty course', () => {
    const r = composeReasons([], [], new Map());
    expect(r).toEqual({
      eligible: false,
      reasons: [{ kind: 'COURSE_HAS_NO_MODULES' }],
    });
  });

  it('returns MODULE_HAS_NO_LESSONS for a module with zero lessons', () => {
    const m = makeModule('m1', 'M1', 0);
    const r = composeReasons([m], [[]], new Map());
    expect(r).toEqual({
      eligible: false,
      reasons: [{ kind: 'MODULE_HAS_NO_LESSONS', moduleId: 'm1', moduleTitle: 'M1', moduleOrder: 0 }],
    });
  });

  it('returns LESSON_HAS_NO_VIDEO when lesson.videoId is undefined', () => {
    const m = makeModule('m1', 'M1', 0);
    const l = makeLesson('l1', 'L1', 0, 'm1');
    const r = composeReasons([m], [[l]], new Map());
    expect(r.eligible).toBe(false);
    expect(r.reasons).toEqual([
      {
        kind: 'LESSON_HAS_NO_VIDEO',
        moduleId: 'm1', moduleTitle: 'M1', moduleOrder: 0,
        lessonId: 'l1', lessonTitle: 'L1', lessonOrder: 0,
      },
    ]);
  });

  it('returns LESSON_HAS_NO_VIDEO when videoId is set but video doc is missing (orphan fold)', () => {
    const m = makeModule('m1', 'M1', 0);
    const l = makeLesson('l1', 'L1', 0, 'm1', 'v-orphan');
    const r = composeReasons([m], [[l]], new Map()); // empty map → orphan
    expect(r.eligible).toBe(false);
    expect(r.reasons[0].kind).toBe('LESSON_HAS_NO_VIDEO');
  });

  it.each<[VideoState]>([
    ['PENDING_UPLOAD'],
    ['UPLOADING'],
    ['UPLOADED'],
    ['TRANSCODING'],
    ['FAILED'],
  ])('returns LESSON_VIDEO_NOT_READY for state %s', (state) => {
    const m = makeModule('m1', 'M1', 0);
    const l = makeLesson('l1', 'L1', 0, 'm1', 'v1');
    const r = composeReasons([m], [[l]], new Map([['v1' as VideoId, state]]));
    expect(r.eligible).toBe(false);
    expect(r.reasons).toEqual([
      {
        kind: 'LESSON_VIDEO_NOT_READY',
        moduleId: 'm1', moduleTitle: 'M1', moduleOrder: 0,
        lessonId: 'l1', lessonTitle: 'L1', lessonOrder: 0,
        currentState: state,
      },
    ]);
  });

  it('returns eligible:true with no reasons when every lesson has a READY video', () => {
    const m = makeModule('m1', 'M1', 0);
    const l = makeLesson('l1', 'L1', 0, 'm1', 'v1');
    const r = composeReasons([m], [[l]], new Map([['v1' as VideoId, 'READY']]));
    expect(r).toEqual({ eligible: true, reasons: [] });
  });

  it('orders reasons by moduleOrder ASC, then lessonOrder ASC', () => {
    const mA = makeModule('mA', 'Alpha', 0);
    const mB = makeModule('mB', 'Beta',  1);
    const mC = makeModule('mC', 'Gamma', 2);
    const lA1 = makeLesson('lA1', 'A1', 0, 'mA');                // no video
    const lA2 = makeLesson('lA2', 'A2', 1, 'mA', 'vA2');         // TRANSCODING
    const lC1 = makeLesson('lC1', 'C1', 0, 'mC', 'vC1');         // READY (no reason)
    const videoStates = new Map<VideoId, VideoState>([
      ['vA2' as VideoId, 'TRANSCODING'],
      ['vC1' as VideoId, 'READY'],
    ]);
    const r = composeReasons([mA, mB, mC], [[lA1, lA2], [], [lC1]], videoStates);
    expect(r.eligible).toBe(false);
    expect(r.reasons.map((x) => x.kind)).toEqual([
      'LESSON_HAS_NO_VIDEO',         // mA / lA1 — first by module + first by lesson order
      'LESSON_VIDEO_NOT_READY',      // mA / lA2 — second by lesson order
      'MODULE_HAS_NO_LESSONS',       // mB
                                      // mC has only READY lessons → no reason
    ]);
  });

  it('emits at most one reason per lesson — orphan takes precedence over not-ready', () => {
    const m = makeModule('m1', 'M1', 0);
    const l = makeLesson('l1', 'L1', 0, 'm1', 'v-orphan');
    // Even if some other map entry could conflict, only one reason fires per lesson:
    const r = composeReasons([m], [[l]], new Map());
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0].kind).toBe('LESSON_HAS_NO_VIDEO');
  });
});
