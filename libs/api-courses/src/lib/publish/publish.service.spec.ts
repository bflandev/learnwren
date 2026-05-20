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
    // Simulate VideoService throwing — PublishService catches and folds:
    const err = new Error('Video not found.');
    err.name = 'VideoNotFoundException';
    videoSvc.getVideo.mockRejectedValue(err);
    const r = await service.computeEligibility(COURSE);
    expect(r.eligible).toBe(false);
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0]).toMatchObject({ kind: 'LESSON_HAS_NO_VIDEO', lessonId: 'l1' });
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
