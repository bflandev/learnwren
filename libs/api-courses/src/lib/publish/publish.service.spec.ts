import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Course,
  CourseId,
  ISODateString,
  Lesson,
  LessonId,
  Module,
  ModuleId,
  UserId,
  Video,
  VideoId,
} from '@learnwren/shared-data-models';

import { VideoNotFoundException } from '../video/errors/video.exception';
import { PublishService } from './publish.service';

const COURSE = 'c1' as CourseId;
const INSTR = 'u1' as UserId;
const NOW = '2026-05-20T10:00:00.000Z' as ISODateString;

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: COURSE,
    title: 'T',
    description: 'D',
    instructorId: INSTR,
    status: 'DRAFT',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeModule(id: string, order: number): Module {
  return {
    id: id as ModuleId,
    courseId: COURSE,
    title: id.toUpperCase(),
    order,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeLesson(id: string, mid: string, order: number, vid?: string): Lesson {
  return {
    id: id as LessonId,
    moduleId: mid as ModuleId,
    title: id.toUpperCase(),
    order,
    ...(vid ? { videoId: vid as VideoId } : {}),
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeVideo(id: string, state: Video['state']): Video {
  return {
    id: id as VideoId,
    ownerInstructorId: INSTR,
    courseId: COURSE,
    lessonId: 'l-irrelevant' as LessonId,
    state,
    source: { bucket: 'src', path: 'p' },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

interface RepoFake {
  getCourse: ReturnType<typeof vi.fn>;
  listModulesByCourse: ReturnType<typeof vi.fn>;
  listLessonsByModule: ReturnType<typeof vi.fn>;
  // (transaction helpers are not exercised by computeEligibility — see publish tests)
}

interface VideoSvcFake {
  getVideo: ReturnType<typeof vi.fn>;
  deleteForLesson: ReturnType<typeof vi.fn>;
}

let repo: RepoFake;
let videoSvc: VideoSvcFake;
let service: PublishService;

beforeEach(() => {
  repo = {
    getCourse: vi.fn(),
    listModulesByCourse: vi.fn(),
    listLessonsByModule: vi.fn(),
  };
  videoSvc = {
    getVideo: vi.fn(),
    deleteForLesson: vi.fn(),
  };
  // The Firestore handle is not used by computeEligibility; pass undefined-cast.
  service = new PublishService(repo as never, videoSvc as never, undefined as never);
});

describe('PublishService.computeEligibility', () => {
  it('returns COURSE_HAS_NO_MODULES for a course with no modules', async () => {
    repo.getCourse.mockResolvedValue(makeCourse());
    repo.listModulesByCourse.mockResolvedValue([]);
    const r = await service.computeEligibility(COURSE);
    expect(r).toEqual({ eligible: false, reasons: [{ kind: 'COURSE_HAS_NO_MODULES' }] });
    expect(videoSvc.getVideo).not.toHaveBeenCalled();
  });

  it('returns eligible:true when every lesson has a READY video', async () => {
    repo.getCourse.mockResolvedValue(makeCourse());
    repo.listModulesByCourse.mockResolvedValue([makeModule('m1', 0)]);
    repo.listLessonsByModule.mockResolvedValue([makeLesson('l1', 'm1', 0, 'v1')]);
    videoSvc.getVideo.mockResolvedValue(makeVideo('v1', 'READY'));
    const r = await service.computeEligibility(COURSE);
    expect(r).toEqual({ eligible: true, reasons: [] });
  });

  it('folds VideoNotFoundException into LESSON_HAS_NO_VIDEO (orphan)', async () => {
    repo.getCourse.mockResolvedValue(makeCourse());
    repo.listModulesByCourse.mockResolvedValue([makeModule('m1', 0)]);
    repo.listLessonsByModule.mockResolvedValue([makeLesson('l1', 'm1', 0, 'v-orphan')]);
    videoSvc.getVideo.mockRejectedValue(new VideoNotFoundException());
    const r = await service.computeEligibility(COURSE);
    expect(r.eligible).toBe(false);
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0]).toMatchObject({ kind: 'LESSON_HAS_NO_VIDEO', lessonId: 'l1' });
  });

  it('rethrows an unrelated getVideo error instead of folding it', async () => {
    repo.getCourse.mockResolvedValue(makeCourse());
    repo.listModulesByCourse.mockResolvedValue([makeModule('m1', 0)]);
    repo.listLessonsByModule.mockResolvedValue([makeLesson('l1', 'm1', 0, 'v1')]);
    const err = new Error('quota exceeded');
    err.name = 'QuotaError';
    videoSvc.getVideo.mockRejectedValue(err);
    await expect(service.computeEligibility(COURSE)).rejects.toThrow('quota exceeded');
  });

  it('rethrows a non-Error throw from getVideo (does not fold)', async () => {
    // A plain object mimicking a not-found error — `e instanceof Error`
    // must reject the fold so it propagates rather than silently folding.
    repo.getCourse.mockResolvedValue(makeCourse());
    repo.listModulesByCourse.mockResolvedValue([makeModule('m1', 0)]);
    repo.listLessonsByModule.mockResolvedValue([makeLesson('l1', 'm1', 0, 'v1')]);
    videoSvc.getVideo.mockRejectedValue({
      name: 'VideoNotFoundException',
      message: 'Video not found.',
    });
    await expect(service.computeEligibility(COURSE)).rejects.toEqual({
      name: 'VideoNotFoundException',
      message: 'Video not found.',
    });
  });

  it('does not read a video for a lesson with no videoId', async () => {
    // The `.filter(Boolean)` drops undefined videoIds before the getVideo
    // fan-out — without it, getVideo(undefined) would be called.
    repo.getCourse.mockResolvedValue(makeCourse());
    repo.listModulesByCourse.mockResolvedValue([makeModule('m1', 0)]);
    repo.listLessonsByModule.mockResolvedValue([
      makeLesson('l1', 'm1', 0, 'v1'),
      makeLesson('l2', 'm1', 1),
    ]);
    videoSvc.getVideo.mockResolvedValue(makeVideo('v1', 'READY'));
    await service.computeEligibility(COURSE);
    expect(videoSvc.getVideo).toHaveBeenCalledWith('v1');
    expect(videoSvc.getVideo).not.toHaveBeenCalledWith(undefined);
  });

  it('deduplicates videoId reads across lessons', async () => {
    repo.getCourse.mockResolvedValue(makeCourse());
    repo.listModulesByCourse.mockResolvedValue([makeModule('m1', 0)]);
    // Same videoId reused on two lessons (unusual but possible if a future feature allows it):
    repo.listLessonsByModule.mockResolvedValue([
      makeLesson('l1', 'm1', 0, 'v-shared'),
      makeLesson('l2', 'm1', 1, 'v-shared'),
    ]);
    videoSvc.getVideo.mockResolvedValue(makeVideo('v-shared', 'READY'));
    await service.computeEligibility(COURSE);
    expect(videoSvc.getVideo).toHaveBeenCalledTimes(1);
  });

  it('throws CourseArchivedException when status === ARCHIVED', async () => {
    repo.getCourse.mockResolvedValue(makeCourse({ status: 'ARCHIVED' }));
    await expect(service.computeEligibility(COURSE)).rejects.toMatchObject({
      code: 'COURSE_ARCHIVED',
      status: 409,
    });
  });

  it('throws CourseNotFoundException when the course is absent', async () => {
    repo.getCourse.mockResolvedValue(null);
    await expect(service.computeEligibility(COURSE)).rejects.toMatchObject({
      code: 'COURSE_NOT_FOUND',
      status: 404,
    });
  });
});

describe('PublishService.publish', () => {
  it('publishes a DRAFT course when eligible, setting publishedAt', async () => {
    repo.getCourse.mockResolvedValue(makeCourse({ status: 'DRAFT' }));
    // Repo's transactional helpers — wire them directly:
    (repo as never as Record<string, unknown>).getCourseInTxn = vi.fn().mockResolvedValue(makeCourse({ status: 'DRAFT' }));
    (repo as never as Record<string, unknown>).listModulesByCourseInTxn = vi.fn().mockResolvedValue([makeModule('m1', 0)]);
    (repo as never as Record<string, unknown>).listLessonsByModuleInTxn = vi.fn().mockResolvedValue([makeLesson('l1', 'm1', 0, 'v1')]);
    (repo as never as Record<string, unknown>).updateStatusInTxn = vi.fn().mockImplementation(
      async (_t, _cid, status, patch) => makeCourse({ status, ...patch }),
    );
    videoSvc.getVideo.mockResolvedValue(makeVideo('v1', 'READY'));
    // Firestore handle is the third constructor arg — supply a runTransaction stub:
    const fakeFs = { runTransaction: vi.fn(async (cb: (t: unknown) => unknown) => cb({})) };
    service = new PublishService(repo as never, videoSvc as never, fakeFs as never);

    const updated = await service.publish(COURSE);
    expect(updated.status).toBe('PUBLISHED');
    expect(updated.publishedAt).toBeDefined();
    expect((repo as never as Record<string, ReturnType<typeof vi.fn>>).updateStatusInTxn).toHaveBeenCalledWith(
      expect.anything(),
      COURSE,
      'PUBLISHED',
      expect.objectContaining({ publishedAt: expect.any(String) }),
    );
  });

  it('throws InvalidTransitionException when source state is not DRAFT', async () => {
    (repo as never as Record<string, unknown>).getCourseInTxn = vi.fn().mockResolvedValue(makeCourse({ status: 'PUBLISHED' }));
    const fakeFs = { runTransaction: vi.fn(async (cb: (t: unknown) => unknown) => cb({})) };
    service = new PublishService(repo as never, videoSvc as never, fakeFs as never);
    await expect(service.publish(COURSE)).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
      details: { currentState: 'PUBLISHED', requested: 'PUBLISHED' },
    });
  });

  it('throws PublishNotEligibleException with reasons when revalidation fails', async () => {
    (repo as never as Record<string, unknown>).getCourseInTxn = vi.fn().mockResolvedValue(makeCourse({ status: 'DRAFT' }));
    (repo as never as Record<string, unknown>).listModulesByCourseInTxn = vi.fn().mockResolvedValue([]);
    const fakeFs = { runTransaction: vi.fn(async (cb: (t: unknown) => unknown) => cb({})) };
    service = new PublishService(repo as never, videoSvc as never, fakeFs as never);
    await expect(service.publish(COURSE)).rejects.toMatchObject({
      code: 'PUBLISH_NOT_ELIGIBLE',
      details: { reasons: [{ kind: 'COURSE_HAS_NO_MODULES' }] },
    });
  });

  it('folds an orphan video transactionally and rejects publish as not eligible', async () => {
    // Exercises computeEligibilityInTxn's video fan-out: l2 has no videoId
    // (filtered out), l3 points at a deleted video (folded to null via the
    // not-found catch). Without the filters / catch this path crashes.
    (repo as never as Record<string, unknown>).getCourseInTxn = vi.fn().mockResolvedValue(makeCourse({ status: 'DRAFT' }));
    (repo as never as Record<string, unknown>).listModulesByCourseInTxn = vi.fn().mockResolvedValue([makeModule('m1', 0)]);
    (repo as never as Record<string, unknown>).listLessonsByModuleInTxn = vi.fn().mockResolvedValue([
      makeLesson('l1', 'm1', 0, 'v1'),
      makeLesson('l2', 'm1', 1),
      makeLesson('l3', 'm1', 2, 'v-orphan'),
    ]);
    videoSvc.getVideo.mockImplementation(async (vid: string) => {
      if (vid === 'v1') return makeVideo('v1', 'READY');
      throw new VideoNotFoundException();
    });
    const fakeFs = { runTransaction: vi.fn(async (cb: (t: unknown) => unknown) => cb({})) };
    service = new PublishService(repo as never, videoSvc as never, fakeFs as never);

    await expect(service.publish(COURSE)).rejects.toMatchObject({ code: 'PUBLISH_NOT_ELIGIBLE' });
    expect(videoSvc.getVideo).not.toHaveBeenCalledWith(undefined);
    expect(videoSvc.getVideo).toHaveBeenCalledWith('v1');
    expect(videoSvc.getVideo).toHaveBeenCalledWith('v-orphan');
  });

  it('rethrows an unrelated getVideo error raised during publish revalidation', async () => {
    (repo as never as Record<string, unknown>).getCourseInTxn = vi.fn().mockResolvedValue(makeCourse({ status: 'DRAFT' }));
    (repo as never as Record<string, unknown>).listModulesByCourseInTxn = vi.fn().mockResolvedValue([makeModule('m1', 0)]);
    (repo as never as Record<string, unknown>).listLessonsByModuleInTxn = vi.fn().mockResolvedValue([
      makeLesson('l1', 'm1', 0, 'v1'),
    ]);
    videoSvc.getVideo.mockRejectedValue(Object.assign(new Error('quota exceeded'), { name: 'QuotaError' }));
    const fakeFs = { runTransaction: vi.fn(async (cb: (t: unknown) => unknown) => cb({})) };
    service = new PublishService(repo as never, videoSvc as never, fakeFs as never);

    await expect(service.publish(COURSE)).rejects.toThrow('quota exceeded');
  });
});

describe('PublishService.unpublish', () => {
  it('transitions PUBLISHED → DRAFT, preserves publishedAt', async () => {
    const published = makeCourse({ status: 'PUBLISHED', publishedAt: '2026-05-19T00:00:00.000Z' as ISODateString });
    (repo as never as Record<string, unknown>).getCourseInTxn = vi.fn().mockResolvedValue(published);
    (repo as never as Record<string, unknown>).updateStatusInTxn = vi.fn().mockImplementation(
      async (_t, _cid, status) => ({ ...published, status }),
    );
    const fakeFs = { runTransaction: vi.fn(async (cb: (t: unknown) => unknown) => cb({})) };
    service = new PublishService(repo as never, videoSvc as never, fakeFs as never);

    const updated = await service.unpublish(COURSE);
    expect(updated.status).toBe('DRAFT');
    // updateStatusInTxn called WITHOUT publishedAt patch — it's preserved on the doc:
    expect((repo as never as Record<string, ReturnType<typeof vi.fn>>).updateStatusInTxn)
      .toHaveBeenCalledWith(expect.anything(), COURSE, 'DRAFT', {});
  });

  it('throws InvalidTransitionException when source is not PUBLISHED', async () => {
    (repo as never as Record<string, unknown>).getCourseInTxn = vi.fn().mockResolvedValue(makeCourse({ status: 'DRAFT' }));
    const fakeFs = { runTransaction: vi.fn(async (cb: (t: unknown) => unknown) => cb({})) };
    service = new PublishService(repo as never, videoSvc as never, fakeFs as never);
    await expect(service.unpublish(COURSE)).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
      details: { currentState: 'DRAFT', requested: 'DRAFT' },
    });
  });
});

describe('PublishService.archive', () => {
  it.each<['DRAFT' | 'PUBLISHED']>([['DRAFT'], ['PUBLISHED']])('archives a %s course, sets archivedAt', async (from) => {
    (repo as never as Record<string, unknown>).getCourseInTxn = vi.fn().mockResolvedValue(makeCourse({ status: from }));
    (repo as never as Record<string, unknown>).updateStatusInTxn = vi.fn().mockImplementation(
      async (_t, _cid, status, patch) => ({ ...makeCourse({ status }), ...patch }),
    );
    const fakeFs = { runTransaction: vi.fn(async (cb: (t: unknown) => unknown) => cb({})) };
    service = new PublishService(repo as never, videoSvc as never, fakeFs as never);

    const updated = await service.archive(COURSE);
    expect(updated.status).toBe('ARCHIVED');
    expect(updated.archivedAt).toBeDefined();
    expect((repo as never as Record<string, ReturnType<typeof vi.fn>>).updateStatusInTxn)
      .toHaveBeenCalledWith(expect.anything(), COURSE, 'ARCHIVED', expect.objectContaining({ archivedAt: expect.any(String) }));
  });

  it('throws InvalidTransitionException when already ARCHIVED', async () => {
    (repo as never as Record<string, unknown>).getCourseInTxn = vi.fn().mockResolvedValue(makeCourse({ status: 'ARCHIVED' }));
    const fakeFs = { runTransaction: vi.fn(async (cb: (t: unknown) => unknown) => cb({})) };
    service = new PublishService(repo as never, videoSvc as never, fakeFs as never);
    await expect(service.archive(COURSE)).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
      details: { currentState: 'ARCHIVED', requested: 'ARCHIVED' },
    });
  });
});

describe('PublishService.restore', () => {
  it('transitions ARCHIVED → DRAFT, clears archivedAt', async () => {
    (repo as never as Record<string, unknown>).getCourseInTxn = vi.fn().mockResolvedValue(
      makeCourse({ status: 'ARCHIVED', archivedAt: '2026-05-18T00:00:00.000Z' as ISODateString }),
    );
    (repo as never as Record<string, unknown>).updateStatusInTxn = vi.fn().mockImplementation(
      async (_t, _cid, status) => makeCourse({ status }),
    );
    const fakeFs = { runTransaction: vi.fn(async (cb: (t: unknown) => unknown) => cb({})) };
    service = new PublishService(repo as never, videoSvc as never, fakeFs as never);

    const updated = await service.restore(COURSE);
    expect(updated.status).toBe('DRAFT');
    expect((repo as never as Record<string, ReturnType<typeof vi.fn>>).updateStatusInTxn)
      .toHaveBeenCalledWith(expect.anything(), COURSE, 'DRAFT', { archivedAt: null });
  });

  it('throws InvalidTransitionException when source is not ARCHIVED', async () => {
    (repo as never as Record<string, unknown>).getCourseInTxn = vi.fn().mockResolvedValue(makeCourse({ status: 'DRAFT' }));
    const fakeFs = { runTransaction: vi.fn(async (cb: (t: unknown) => unknown) => cb({})) };
    service = new PublishService(repo as never, videoSvc as never, fakeFs as never);
    await expect(service.restore(COURSE)).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
      details: { currentState: 'DRAFT', requested: 'DRAFT' },
    });
  });
});
