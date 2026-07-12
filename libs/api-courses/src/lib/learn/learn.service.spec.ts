import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  Course,
  CourseId,
  CourseOutline,
  ISODateString,
  Lesson,
  LessonId,
  Material,
  MaterialId,
  ModuleId,
  UserId,
  Video,
  VideoId,
  VideoState,
} from '@learnwren/shared-data-models';

import type { CoursesRepository } from '../courses.repository';
import type { EnrollmentRepository } from '../enrollment/enrollment.repository';
import type { MaterialsService } from '../materials/materials.service';
import type { CaptionsService } from '../video/captions/captions.service';
import type { VideoRepository } from '../video/video.repository';
import { LearnService } from './learn.service';

const CID = 'course-1' as CourseId;
const LID = 'lesson-1' as LessonId;
const MID = 'module-1' as ModuleId;
const VID = 'video-1' as VideoId;
const STUDENT_ID = 'student-1' as UserId;

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: CID,
    instructorId: 'instructor-1' as UserId,
    title: 'Test Course',
    description: 'Test Course Description',
    status: 'PUBLISHED',
    createdAt: '2026-01-01T00:00:00Z' as Course['createdAt'],
    updatedAt: '2026-01-01T00:00:00Z' as Course['updatedAt'],
    ...overrides,
  };
}

function makeLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: LID,
    moduleId: MID,
    title: 'Test Lesson',
    description: 'A description',
    videoId: VID,
    order: 1,
    createdAt: '2026-01-01T00:00:00Z' as Lesson['createdAt'],
    updatedAt: '2026-01-01T00:00:00Z' as Lesson['updatedAt'],
    ...overrides,
  };
}

const baseCourse = makeCourse();
const baseLesson = makeLesson();

function makeVideoRepo(overrides: Partial<{ getVideo: Video | null }> = {}) {
  return {
    getVideo: vi.fn().mockResolvedValue(
      'getVideo' in overrides ? overrides.getVideo : null,
    ),
    listVideoStatesForLessons: vi.fn().mockResolvedValue(new Map<LessonId, VideoState>()),
  } as unknown as VideoRepository;
}

function makeCoursesRepo(args: {
  modules: Array<{ id: string; title: string; order: number }>;
  lessonsByModule: Record<string, Array<{ id: string; title: string; order: number; videoId?: string }>>;
}) {
  const modules = args.modules.map((m) => ({
    ...m,
    courseId: CID,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }));
  const lessonsFor = (mid: string) =>
    (args.lessonsByModule[mid] ?? []).map((l) => ({
      ...l,
      moduleId: mid,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }));
  return {
    listModulesByCourse: vi.fn().mockResolvedValue(modules),
    listLessonsByModule: vi.fn().mockImplementation(async (_cid: string, mid: string) => lessonsFor(mid)),
    listModulesByCourseInTxn: vi.fn().mockImplementation(async () => modules),
    listLessonsByModuleInTxn: vi
      .fn()
      .mockImplementation(async (_t: unknown, _cid: string, mid: string) => lessonsFor(mid)),
  } as unknown as CoursesRepository;
}

function makeEmptyCoursesRepo(): CoursesRepository {
  return makeCoursesRepo({ modules: [], lessonsByModule: {} });
}

function makeVideoRepoWithStates(args: {
  lessonView?: Video | null;
  outlineStates?: Record<string, 'READY' | 'TRANSCODING' | 'UPLOADING' | 'FAILED' | null>;
}) {
  const outline = new Map<LessonId, 'READY' | 'TRANSCODING' | 'UPLOADING' | 'FAILED'>();
  for (const [lid, st] of Object.entries(args.outlineStates ?? {})) {
    if (st !== null) outline.set(lid as LessonId, st);
  }
  return {
    getVideo: vi.fn().mockResolvedValue(args.lessonView ?? null),
    listVideoStatesForLessons: vi.fn().mockResolvedValue(outline),
  } as unknown as VideoRepository;
}

function makeEnrollmentRepo(overrides: Partial<{ getEnrollment: unknown }> = {}) {
  return {
    getEnrollment: vi.fn().mockResolvedValue(
      'getEnrollment' in overrides ? overrides.getEnrollment : null,
    ),
    touchLastAccessed: vi.fn(async () => undefined),
    markLessonComplete: vi.fn(async () => ({ completedAt: '2026-01-01T00:00:00.000Z' })),
    stampCompleted: vi.fn(async () => undefined),
  } as unknown as EnrollmentRepository;
}

function makeMaterialsService(materials: Material[] = []): MaterialsService {
  return {
    listForLesson: vi.fn().mockResolvedValue(materials),
  } as unknown as MaterialsService;
}

function makeCaptionsService(): CaptionsService {
  return {
    getMeta: vi.fn().mockResolvedValue(null),
  } as unknown as CaptionsService;
}

describe('LearnService', () => {
  it('maps a lesson with a READY video to the full LessonView shape', async () => {
    const video = { id: VID, state: 'READY' } as unknown as Video;
    const videos = makeVideoRepo({ getVideo: video });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment, makeEmptyCoursesRepo(), makeMaterialsService(), makeCaptionsService());

    const view = await svc.getLessonView(STUDENT_ID, baseCourse, baseLesson);

    expect(view).toEqual({
      course: { id: CID, title: 'Test Course', status: 'PUBLISHED' },
      lesson: {
        id: LID,
        moduleId: MID,
        title: 'Test Lesson',
        description: 'A description',
        videoId: VID,
        videoState: 'READY',
        captions: null,
      },
      progress: null,
      outline: { modules: [] },
      materials: [],
    });
  });

  it('returns videoId null and videoState null when the lesson has no video', async () => {
    const videos = makeVideoRepo({ getVideo: null });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment, makeEmptyCoursesRepo(), makeMaterialsService(), makeCaptionsService());
    const lessonWithoutVideo: Lesson = { ...baseLesson, videoId: undefined };

    const view = await svc.getLessonView(STUDENT_ID, baseCourse, lessonWithoutVideo);

    expect(view.lesson.videoId).toBeNull();
    expect(view.lesson.videoState).toBeNull();
    expect(videos.getVideo).not.toHaveBeenCalled();
  });

  it('returns videoState null when the video document is missing', async () => {
    const videos = makeVideoRepo({ getVideo: null });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment, makeEmptyCoursesRepo(), makeMaterialsService(), makeCaptionsService());

    const view = await svc.getLessonView(STUDENT_ID, baseCourse, baseLesson);

    expect(view.lesson.videoId).toBe(VID);
    expect(view.lesson.videoState).toBeNull();
    expect(videos.getVideo).toHaveBeenCalledWith(VID);
  });

  it('returns videoState TRANSCODING for an in-flight video', async () => {
    const video = { id: VID, state: 'TRANSCODING' } as unknown as Video;
    const videos = makeVideoRepo({ getVideo: video });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment, makeEmptyCoursesRepo(), makeMaterialsService(), makeCaptionsService());

    const view = await svc.getLessonView(STUDENT_ID, baseCourse, baseLesson);

    expect(view.lesson.videoState).toBe('TRANSCODING');
  });

  it('passes through a non-empty description as-is', async () => {
    const videos = makeVideoRepo({ getVideo: null });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment, makeEmptyCoursesRepo(), makeMaterialsService(), makeCaptionsService());
    const lessonWithDesc: Lesson = { ...baseLesson, description: 'Hello world' };

    const view = await svc.getLessonView(STUDENT_ID, baseCourse, lessonWithDesc);

    expect(view.lesson.description).toBe('Hello world');
  });

  it('leaves description undefined when the lesson has no description authored', async () => {
    const videos = makeVideoRepo({ getVideo: null });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment, makeEmptyCoursesRepo(), makeMaterialsService(), makeCaptionsService());
    const lessonNoDesc: Lesson = { ...baseLesson, description: undefined };

    const view = await svc.getLessonView(STUDENT_ID, baseCourse, lessonNoDesc);

    expect(view.lesson.description).toBeUndefined();
  });

  it('preserves an explicit empty-string description distinct from undefined', async () => {
    const videos = makeVideoRepo({ getVideo: null });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment, makeEmptyCoursesRepo(), makeMaterialsService(), makeCaptionsService());
    const lessonEmptyDesc: Lesson = { ...baseLesson, description: '' };

    const view = await svc.getLessonView(STUDENT_ID, baseCourse, lessonEmptyDesc);

    expect(view.lesson.description).toBe('');
  });
});

describe('getLessonView progress', () => {
  it('returns progress: null when the caller is the course owner', async () => {
    const videos = { getVideo: vi.fn().mockResolvedValue(null), listVideoStatesForLessons: vi.fn().mockResolvedValue(new Map()) } as unknown as VideoRepository;
    const enrollment = {
      getEnrollment: vi.fn().mockResolvedValue(null),
    } as unknown as EnrollmentRepository;
    const service = new LearnService(videos, enrollment, makeEmptyCoursesRepo(), makeMaterialsService(), makeCaptionsService());
    const course = makeCourse({ instructorId: 'owner-1' as UserId });
    const view = await service.getLessonView('owner-1' as UserId, course, makeLesson());
    expect(view.progress).toBeNull();
    expect(enrollment.getEnrollment).not.toHaveBeenCalled();
  });

  it('returns { completedAt: null, lastWatchedSeconds: 0 } when the enrolled student has no LessonProgress row yet', async () => {
    const videos = { getVideo: vi.fn().mockResolvedValue(null), listVideoStatesForLessons: vi.fn().mockResolvedValue(new Map()) } as unknown as VideoRepository;
    const enrollment = {
      getEnrollment: vi.fn().mockResolvedValue({
        id: 's__c', userId: 's', courseId: 'c', status: 'ACTIVE',
        progress: [], withdrawnAt: null, createdAt: 't', updatedAt: 't',
      }),
      touchLastAccessed: vi.fn(async () => undefined),
    } as unknown as EnrollmentRepository;
    const service = new LearnService(videos, enrollment, makeEmptyCoursesRepo(), makeMaterialsService(), makeCaptionsService());
    const view = await service.getLessonView(
      's' as UserId,
      makeCourse({ instructorId: 'owner-1' as UserId }),
      makeLesson({ id: 'l1' as LessonId }),
    );
    expect(view.progress).toEqual({ completedAt: null, lastWatchedSeconds: 0 });
  });

  it('returns { completedAt: <iso>, lastWatchedSeconds: 0 } when the LessonProgress row has a prior completion', async () => {
    const videos = { getVideo: vi.fn().mockResolvedValue(null), listVideoStatesForLessons: vi.fn().mockResolvedValue(new Map()) } as unknown as VideoRepository;
    const enrollment = {
      getEnrollment: vi.fn().mockResolvedValue({
        id: 's__c', userId: 's', courseId: 'c', status: 'ACTIVE',
        progress: [{ lessonId: 'l1', completedAt: '2026-05-20T00:00:00.000Z', lastWatchedSeconds: 0 }],
        withdrawnAt: null, createdAt: 't', updatedAt: 't',
      }),
      touchLastAccessed: vi.fn(async () => undefined),
    } as unknown as EnrollmentRepository;
    const service = new LearnService(videos, enrollment, makeEmptyCoursesRepo(), makeMaterialsService(), makeCaptionsService());
    const view = await service.getLessonView(
      's' as UserId,
      makeCourse({ instructorId: 'owner-1' as UserId }),
      makeLesson({ id: 'l1' as LessonId }),
    );
    expect(view.progress).toEqual({ completedAt: '2026-05-20T00:00:00.000Z', lastWatchedSeconds: 0 });
  });

  it('returns progress: null when no enrolment exists (defensive — guard should have blocked)', async () => {
    const videos = { getVideo: vi.fn().mockResolvedValue(null), listVideoStatesForLessons: vi.fn().mockResolvedValue(new Map()) } as unknown as VideoRepository;
    const enrollment = {
      getEnrollment: vi.fn().mockResolvedValue(null),
    } as unknown as EnrollmentRepository;
    const service = new LearnService(videos, enrollment, makeEmptyCoursesRepo(), makeMaterialsService(), makeCaptionsService());
    const view = await service.getLessonView(
      's' as UserId,
      makeCourse({ instructorId: 'owner-1' as UserId }),
      makeLesson({ id: 'l1' as LessonId }),
    );
    expect(view.progress).toBeNull();
    // Called twice: once in resolveProgress, once in projectOutline (non-owner path).
    expect(enrollment.getEnrollment).toHaveBeenCalledTimes(2);
  });
});

describe('LearnService.getLessonView (Slice C — lastAccessed touch + lastWatchedSeconds)', () => {
  const OWNER_UID = 'owner-1' as UserId;
  const STUDENT_UID = 's' as UserId;
  const COURSE = makeCourse({ instructorId: OWNER_UID });
  const LESSON = makeLesson({ id: 'l1' as LessonId });

  it('calls touchLastAccessed exactly once for an enrolled student', async () => {
    const touchSpy = vi.fn(async () => undefined);
    const videos = { getVideo: vi.fn().mockResolvedValue(null), listVideoStatesForLessons: vi.fn().mockResolvedValue(new Map()) } as unknown as VideoRepository;
    const enrollment = {
      getEnrollment: vi.fn().mockResolvedValue({
        id: 's__c', userId: 's', courseId: 'c', status: 'ACTIVE',
        progress: [{ lessonId: LESSON.id, completedAt: null, lastWatchedSeconds: 0 }],
        withdrawnAt: null, createdAt: 't', updatedAt: 't',
      }),
      touchLastAccessed: touchSpy,
    } as unknown as EnrollmentRepository;
    const service = new LearnService(videos, enrollment, makeEmptyCoursesRepo(), makeMaterialsService(), makeCaptionsService());
    await service.getLessonView(STUDENT_UID, COURSE, LESSON);
    expect(touchSpy).toHaveBeenCalledTimes(1);
    expect(touchSpy).toHaveBeenCalledWith(STUDENT_UID, COURSE.id, LESSON.id, expect.any(String));
  });

  it('does NOT call touchLastAccessed for the course owner', async () => {
    const touchSpy = vi.fn(async () => undefined);
    const videos = { getVideo: vi.fn().mockResolvedValue(null), listVideoStatesForLessons: vi.fn().mockResolvedValue(new Map()) } as unknown as VideoRepository;
    const enrollment = {
      getEnrollment: vi.fn().mockResolvedValue(null),
      touchLastAccessed: touchSpy,
    } as unknown as EnrollmentRepository;
    const service = new LearnService(videos, enrollment, makeEmptyCoursesRepo(), makeMaterialsService(), makeCaptionsService());
    await service.getLessonView(OWNER_UID, COURSE, LESSON);
    expect(touchSpy).not.toHaveBeenCalled();
  });

  it('returns the view even when touchLastAccessed throws, and logs a warning naming the user/course/lesson (kills catch block + log message)', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      const touchSpy = vi.fn(async () => { throw new Error('boom'); });
      const videos = { getVideo: vi.fn().mockResolvedValue(null), listVideoStatesForLessons: vi.fn().mockResolvedValue(new Map()) } as unknown as VideoRepository;
      const enrollment = {
        getEnrollment: vi.fn().mockResolvedValue({
          id: 's__c', userId: 's', courseId: 'c', status: 'ACTIVE',
          progress: [],
          withdrawnAt: null, createdAt: 't', updatedAt: 't',
        }),
        touchLastAccessed: touchSpy,
      } as unknown as EnrollmentRepository;
      const service = new LearnService(videos, enrollment, makeEmptyCoursesRepo(), makeMaterialsService(), makeCaptionsService());
      const view = await service.getLessonView(STUDENT_UID, COURSE, LESSON);
      // Did NOT propagate — the view resolved.
      expect(view.course.id).toBe(COURSE.id);
      expect(touchSpy).toHaveBeenCalledTimes(1);
      // The catch block ran and logged a message naming the failure context.
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const msg = String(warnSpy.mock.calls[0]![0]);
      expect(msg).toContain('touchLastAccessed failed');
      expect(msg).toContain(STUDENT_UID);
      expect(msg).toContain(COURSE.id);
      expect(msg).toContain(LESSON.id);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('propagates lastWatchedSeconds from the matching LessonProgress row', async () => {
    const videos = { getVideo: vi.fn().mockResolvedValue(null), listVideoStatesForLessons: vi.fn().mockResolvedValue(new Map()) } as unknown as VideoRepository;
    const enrollment = {
      getEnrollment: vi.fn().mockResolvedValue({
        id: 's__c', userId: 's', courseId: 'c', status: 'ACTIVE',
        progress: [{ lessonId: LESSON.id, completedAt: null, lastWatchedSeconds: 87 }],
        withdrawnAt: null, createdAt: 't', updatedAt: 't',
      }),
      touchLastAccessed: vi.fn(async () => undefined),
    } as unknown as EnrollmentRepository;
    const service = new LearnService(videos, enrollment, makeEmptyCoursesRepo(), makeMaterialsService(), makeCaptionsService());
    const view = await service.getLessonView(STUDENT_UID, COURSE, LESSON);
    expect(view.progress).toEqual({ completedAt: null, lastWatchedSeconds: 87 });
  });

  it('defaults lastWatchedSeconds to 0 when no LessonProgress row exists yet', async () => {
    const videos = { getVideo: vi.fn().mockResolvedValue(null), listVideoStatesForLessons: vi.fn().mockResolvedValue(new Map()) } as unknown as VideoRepository;
    const enrollment = {
      getEnrollment: vi.fn().mockResolvedValue({
        id: 's__c', userId: 's', courseId: 'c', status: 'ACTIVE',
        progress: [],
        withdrawnAt: null, createdAt: 't', updatedAt: 't',
      }),
      touchLastAccessed: vi.fn(async () => undefined),
    } as unknown as EnrollmentRepository;
    const service = new LearnService(videos, enrollment, makeEmptyCoursesRepo(), makeMaterialsService(), makeCaptionsService());
    const view = await service.getLessonView(STUDENT_UID, COURSE, LESSON);
    expect(view.progress).toEqual({ completedAt: null, lastWatchedSeconds: 0 });
  });
});

describe('LearnService.getLessonView outline (Slice D)', () => {
  const course = makeCourse({ status: 'PUBLISHED' });
  const lesson = makeLesson({ id: 'l1' as LessonId, moduleId: 'm1' as ModuleId });

  it('projects modules and lessons in persisted order', async () => {
    const courses = makeCoursesRepo({
      modules: [
        { id: 'm2', title: 'M2', order: 1 },
        { id: 'm1', title: 'M1', order: 0 },
      ],
      lessonsByModule: {
        m1: [
          { id: 'l1', title: 'L1', order: 0, videoId: 'v1' },
          { id: 'l2', title: 'L2', order: 1, videoId: 'v2' },
        ],
        m2: [{ id: 'l3', title: 'L3', order: 0 }],
      },
    });
    const videos = makeVideoRepoWithStates({
      lessonView: { id: 'v1' as VideoId, state: 'READY' } as Video,
      outlineStates: { l1: 'READY', l2: 'TRANSCODING', l3: null },
    });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment, courses, makeMaterialsService(), makeCaptionsService());

    const view = await svc.getLessonView(STUDENT_ID, course, lesson);

    expect(view.outline.modules.map((m) => m.id)).toEqual(['m2', 'm1']);
    expect(view.outline.modules[1]!.lessons.map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(view.outline.modules[1]!.lessons[0]!.videoState).toBe('READY');
    expect(view.outline.modules[1]!.lessons[1]!.videoState).toBe('TRANSCODING');
    expect(view.outline.modules[0]!.lessons[0]!.videoState).toBeNull();
    // listVideoStatesForLessons is fed the FLATTENED lesson ids (kills the
    // `.map((l) => l.id)` arrow being replaced with a constant). Order across
    // modules: m2's lessons then m1's (persisted module order).
    expect(videos.listVideoStatesForLessons).toHaveBeenCalledWith(['l3', 'l1', 'l2']);
  });

  it('joins completedAt from the caller enrolment by lessonId', async () => {
    const courses = makeCoursesRepo({
      modules: [{ id: 'm1', title: 'M1', order: 0 }],
      lessonsByModule: {
        m1: [
          { id: 'l1', title: 'L1', order: 0, videoId: 'v1' },
          { id: 'l2', title: 'L2', order: 1, videoId: 'v2' },
          { id: 'l3', title: 'L3', order: 2, videoId: 'v3' },
        ],
      },
    });
    const videos = makeVideoRepoWithStates({
      lessonView: { id: 'v1' as VideoId, state: 'READY' } as Video,
      outlineStates: { l1: 'READY', l2: 'READY', l3: 'READY' },
    });
    const enrollment = makeEnrollmentRepo({
      getEnrollment: {
        id: `${STUDENT_ID}__${CID}`,
        userId: STUDENT_ID,
        courseId: CID,
        status: 'ACTIVE',
        progress: [
          { lessonId: 'l1' as LessonId, completedAt: '2026-05-01T00:00:00Z', lastWatchedSeconds: 0 },
          { lessonId: 'l2' as LessonId, completedAt: null, lastWatchedSeconds: 12 },
        ],
        withdrawnAt: null,
      },
    });
    const svc = new LearnService(videos, enrollment, courses, makeMaterialsService(), makeCaptionsService());

    const view = await svc.getLessonView(STUDENT_ID, course, lesson);
    const lessons = view.outline.modules[0]!.lessons;
    expect(lessons[0]!.completedAt).toBe('2026-05-01T00:00:00Z');
    expect(lessons[1]!.completedAt).toBeNull();
    expect(lessons[2]!.completedAt).toBeNull();
  });

  it('returns every completedAt as null for the course owner', async () => {
    const owner = course.instructorId;
    const courses = makeCoursesRepo({
      modules: [{ id: 'm1', title: 'M1', order: 0 }],
      lessonsByModule: {
        m1: [{ id: 'l1', title: 'L1', order: 0, videoId: 'v1' }],
      },
    });
    const videos = makeVideoRepoWithStates({
      lessonView: { id: 'v1' as VideoId, state: 'READY' } as Video,
      outlineStates: { l1: 'READY' },
    });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment, courses, makeMaterialsService(), makeCaptionsService());

    const view = await svc.getLessonView(owner, course, lesson);
    expect(view.progress).toBeNull();
    expect(view.outline.modules[0]!.lessons[0]!.completedAt).toBeNull();
  });

  it('ignores orphan LessonProgress rows whose lesson no longer exists', async () => {
    const courses = makeCoursesRepo({
      modules: [{ id: 'm1', title: 'M1', order: 0 }],
      lessonsByModule: {
        m1: [{ id: 'l1', title: 'L1', order: 0, videoId: 'v1' }],
      },
    });
    const videos = makeVideoRepoWithStates({
      lessonView: { id: 'v1' as VideoId, state: 'READY' } as Video,
      outlineStates: { l1: 'READY' },
    });
    const enrollment = makeEnrollmentRepo({
      getEnrollment: {
        id: `${STUDENT_ID}__${CID}`,
        userId: STUDENT_ID,
        courseId: CID,
        status: 'ACTIVE',
        progress: [
          { lessonId: 'l1' as LessonId, completedAt: '2026-05-01T00:00:00Z', lastWatchedSeconds: 0 },
          { lessonId: 'l-deleted' as LessonId, completedAt: '2026-05-02T00:00:00Z', lastWatchedSeconds: 99 },
        ],
        withdrawnAt: null,
      },
    });
    const svc = new LearnService(videos, enrollment, courses, makeMaterialsService(), makeCaptionsService());

    const view = await svc.getLessonView(STUDENT_ID, course, lesson);
    expect(view.outline.modules[0]!.lessons).toHaveLength(1);
    expect(view.outline.modules[0]!.lessons[0]!.completedAt).toBe('2026-05-01T00:00:00Z');
  });

  it('renders videoState: null when a lesson has no videoId', async () => {
    const courses = makeCoursesRepo({
      modules: [{ id: 'm1', title: 'M1', order: 0 }],
      lessonsByModule: {
        m1: [{ id: 'l1', title: 'L1', order: 0 }],
      },
    });
    const videos = makeVideoRepoWithStates({
      lessonView: null,
      outlineStates: { l1: null },
    });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment, courses, makeMaterialsService(), makeCaptionsService());

    const view = await svc.getLessonView(STUDENT_ID, course, lesson);
    expect(view.outline.modules[0]!.lessons[0]!.videoState).toBeNull();
  });
});

describe('LearnService.getLessonView caption projection', () => {
  it('projects { language, label } when getMeta returns caption metadata', async () => {
    const video = { id: VID, state: 'READY' } as unknown as Video;
    const videos = makeVideoRepo({ getVideo: video });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const captionsWithMeta = {
      getMeta: vi.fn().mockResolvedValue({
        language: 'en',
        label: 'English',
        updatedAt: '2026-01-01T00:00:00Z' as ISODateString,
      }),
    } as unknown as CaptionsService;
    const svc = new LearnService(videos, enrollment, makeEmptyCoursesRepo(), makeMaterialsService(), captionsWithMeta);

    const view = await svc.getLessonView(STUDENT_ID, baseCourse, baseLesson);

    expect(view.lesson.captions).toEqual({ language: 'en', label: 'English' });
  });

  it('projects captions: null when getMeta returns null', async () => {
    const video = { id: VID, state: 'READY' } as unknown as Video;
    const videos = makeVideoRepo({ getVideo: video });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment, makeEmptyCoursesRepo(), makeMaterialsService(), makeCaptionsService());

    const view = await svc.getLessonView(STUDENT_ID, baseCourse, baseLesson);

    expect(view.lesson.captions).toBeNull();
  });
});

describe('UC-04-02 materials projection', () => {
  const ownerId = 'instructor-1' as UserId;
  const course = makeCourse({ instructorId: ownerId });
  const lesson = makeLesson();

  const baseMat = (over: Partial<Material> = {}): Material => ({
    id: 'mat1' as MaterialId,
    ownerInstructorId: ownerId,
    courseId: CID,
    lessonId: LID,
    displayName: 'Slides.pdf',
    originalFilename: 'slides.pdf',
    extension: 'pdf',
    contentType: 'application/pdf',
    sizeBytes: 1234,
    state: 'READY',
    storage: { bucket: 'b', path: 'p' },
    createdAt: '2026-05-01T00:00:00.000Z' as ISODateString,
    updatedAt: '2026-05-01T00:00:00.000Z' as ISODateString,
    ...over,
  });

  it('projects materials returned by MaterialsService into LessonView', async () => {
    const materials = makeMaterialsService([
      baseMat({ id: 'mat1' as MaterialId, displayName: 'A', sizeBytes: 1 }),
      baseMat({ id: 'mat2' as MaterialId, displayName: 'B', extension: 'docx', sizeBytes: 2 }),
    ]);
    const videos = makeVideoRepo({ getVideo: null });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment, makeEmptyCoursesRepo(), materials, makeCaptionsService());

    const view = await svc.getLessonView(ownerId, course, lesson);

    expect(view.materials).toEqual([
      { id: 'mat1', displayName: 'A', extension: 'pdf', sizeBytes: 1 },
      { id: 'mat2', displayName: 'B', extension: 'docx', sizeBytes: 2 },
    ]);
    expect(materials.listForLesson).toHaveBeenCalledWith(lesson.id);
  });

  it('returns materials: [] when the lesson has none', async () => {
    const materials = makeMaterialsService([]);
    const videos = makeVideoRepo({ getVideo: null });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment, makeEmptyCoursesRepo(), materials, makeCaptionsService());

    const view = await svc.getLessonView(ownerId, course, lesson);
    expect(view.materials).toEqual([]);
  });

  it('drops owner-only fields from each material', async () => {
    const materials = makeMaterialsService([baseMat()]);
    const videos = makeVideoRepo({ getVideo: null });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment, makeEmptyCoursesRepo(), materials, makeCaptionsService());

    const view = await svc.getLessonView(ownerId, course, lesson);
    const m = view.materials[0]!;
    expect(Object.keys(m).sort()).toEqual(['displayName', 'extension', 'id', 'sizeBytes']);
  });
});

describe('LearnService.markLessonComplete', () => {
  it('delegates to enrollment.markLessonComplete with userId/courseId/lessonId/timestamp and returns its result', async () => {
    const completedAt = '2026-05-25T12:00:00.000Z' as ISODateString;
    const markSpy = vi.fn(async () => ({ completedAt }));
    const enrollment = {
      markLessonComplete: markSpy,
    } as unknown as EnrollmentRepository;
    const svc = new LearnService(
      makeVideoRepo(),
      enrollment,
      makeEmptyCoursesRepo(),
      makeMaterialsService(),
      makeCaptionsService(),
    );

    const result = await svc.markLessonComplete(STUDENT_ID, baseCourse, baseLesson);

    expect(result).toEqual({ completedAt });
    expect(markSpy).toHaveBeenCalledTimes(1);
    expect(markSpy).toHaveBeenCalledWith(
      STUDENT_ID,
      baseCourse.id,
      baseLesson.id,
      expect.any(String),
      expect.any(Function),
    );
  });
});

describe('LearnService.savePosition', () => {
  it('delegates to enrollment.setLastWatchedSeconds with userId/courseId/lessonId/seconds and returns its result', async () => {
    const setSpy = vi.fn(async () => ({ lastWatchedSeconds: 42 }));
    const enrollment = {
      setLastWatchedSeconds: setSpy,
    } as unknown as EnrollmentRepository;
    const svc = new LearnService(
      makeVideoRepo(),
      enrollment,
      makeEmptyCoursesRepo(),
      makeMaterialsService(),
      makeCaptionsService(),
    );

    const result = await svc.savePosition(STUDENT_ID, baseCourse, baseLesson, 42);

    expect(result).toEqual({ lastWatchedSeconds: 42 });
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith(STUDENT_ID, baseCourse.id, baseLesson.id, 42);
  });
});

describe('LearnService.resolveProgress lessonId matching', () => {
  it('matches the progress row by lessonId only, ignoring rows for other lessons (kills find→true)', async () => {
    // Enrolment has a row for a DIFFERENT lesson first (with distinctive values),
    // then the row for THIS lesson. A find() forced to `true` would return the
    // first (wrong) row and surface its completedAt/lastWatchedSeconds.
    const videos = { getVideo: vi.fn().mockResolvedValue(null), listVideoStatesForLessons: vi.fn().mockResolvedValue(new Map()) } as unknown as VideoRepository;
    const enrollment = {
      getEnrollment: vi.fn().mockResolvedValue({
        id: 's__c', userId: 's', courseId: 'c', status: 'ACTIVE',
        progress: [
          { lessonId: 'other-lesson', completedAt: '2026-01-01T00:00:00.000Z', lastWatchedSeconds: 999 },
          { lessonId: 'l1', completedAt: null, lastWatchedSeconds: 7 },
        ],
        withdrawnAt: null, createdAt: 't', updatedAt: 't',
      }),
      touchLastAccessed: vi.fn(async () => undefined),
    } as unknown as EnrollmentRepository;
    const service = new LearnService(videos, enrollment, makeEmptyCoursesRepo(), makeMaterialsService(), makeCaptionsService());
    const view = await service.getLessonView(
      's' as UserId,
      makeCourse({ instructorId: 'owner-1' as UserId }),
      makeLesson({ id: 'l1' as LessonId }),
    );
    // Must reflect the l1 row (completedAt null, seconds 7) — NOT other-lesson's.
    expect(view.progress).toEqual({ completedAt: null, lastWatchedSeconds: 7 });
  });
});

describe('LearnService.markLessonComplete — course rollup', () => {
  it('passes an in-txn lesson lister that resolves the full lesson-id list of the course', async () => {
    const courses = makeCoursesRepo({
      modules: [
        { id: 'm1', title: 'M1', order: 0 },
        { id: 'm2', title: 'M2', order: 1 },
      ],
      lessonsByModule: {
        m1: [
          { id: 'l1', title: 'L1', order: 0 },
          { id: 'l2', title: 'L2', order: 1 },
        ],
        m2: [{ id: 'l3', title: 'L3', order: 0 }],
      },
    });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(makeVideoRepo(), enrollment, courses, makeMaterialsService(), makeCaptionsService());

    await svc.markLessonComplete(STUDENT_ID, baseCourse, baseLesson);

    const markSpy = enrollment.markLessonComplete as ReturnType<typeof vi.fn>;
    expect(markSpy).toHaveBeenCalledWith(
      STUDENT_ID,
      baseCourse.id,
      baseLesson.id,
      expect.any(String),
      expect.any(Function),
    );
    // The lister must read via the transactional repo methods with the txn it
    // is handed — that is the whole point of the closure.
    const lister = markSpy.mock.calls[0][4];
    const txn = { __txn: true };
    await expect(lister(txn)).resolves.toEqual(['l1', 'l2', 'l3']);
    expect(courses.listModulesByCourseInTxn).toHaveBeenCalledWith(txn, baseCourse.id);
    expect(courses.listLessonsByModuleInTxn).toHaveBeenCalledWith(txn, baseCourse.id, 'm1');
    expect(courses.listLessonsByModuleInTxn).toHaveBeenCalledWith(txn, baseCourse.id, 'm2');
  });
});

describe('LearnService.getLessonView — lazy completion stamp', () => {
  const OWNER_UID = 'owner-1' as UserId;
  const course = makeCourse({ instructorId: OWNER_UID });
  const lesson = makeLesson({ id: 'l1' as LessonId, moduleId: 'm1' as ModuleId });
  const courses = makeCoursesRepo({
    modules: [{ id: 'm1', title: 'M1', order: 0 }],
    lessonsByModule: {
      m1: [
        { id: 'l1', title: 'L1', order: 0 },
        { id: 'l2', title: 'L2', order: 1 },
      ],
    },
  });

  function makeVideos() {
    return {
      getVideo: vi.fn().mockResolvedValue(null),
      listVideoStatesForLessons: vi.fn().mockResolvedValue(new Map()),
    } as unknown as VideoRepository;
  }

  it('stamps an unstamped enrollment whose lessons are all complete', async () => {
    const enrollment = makeEnrollmentRepo({
      getEnrollment: {
        id: `${STUDENT_ID}__${CID}`,
        userId: STUDENT_ID,
        courseId: CID,
        status: 'ACTIVE',
        progress: [
          { lessonId: 'l1' as LessonId, completedAt: '2026-05-01T00:00:00Z', lastWatchedSeconds: 0 },
          { lessonId: 'l2' as LessonId, completedAt: '2026-05-02T00:00:00Z', lastWatchedSeconds: 0 },
        ],
        withdrawnAt: null,
        completedAt: null,
      },
    });
    const svc = new LearnService(makeVideos(), enrollment, courses, makeMaterialsService(), makeCaptionsService());

    await svc.getLessonView(STUDENT_ID, course, lesson);

    const stampSpy = enrollment.stampCompleted as ReturnType<typeof vi.fn>;
    expect(stampSpy).toHaveBeenCalledWith(
      STUDENT_ID,
      course.id,
      expect.any(String),
      expect.any(Function),
    );
    // The backfill's in-txn lister resolves the course's lesson ids via the
    // transactional repo methods.
    const lister = stampSpy.mock.calls[0][3];
    const txn = { __txn: true };
    await expect(lister(txn)).resolves.toEqual(['l1', 'l2']);
    expect(courses.listModulesByCourseInTxn).toHaveBeenCalledWith(txn, course.id);
  });

  it('does not stamp when a lesson is incomplete', async () => {
    const enrollment = makeEnrollmentRepo({
      getEnrollment: {
        id: `${STUDENT_ID}__${CID}`,
        userId: STUDENT_ID,
        courseId: CID,
        status: 'ACTIVE',
        progress: [
          { lessonId: 'l1' as LessonId, completedAt: '2026-05-01T00:00:00Z', lastWatchedSeconds: 0 },
          { lessonId: 'l2' as LessonId, completedAt: null, lastWatchedSeconds: 0 },
        ],
        withdrawnAt: null,
        completedAt: null,
      },
    });
    const svc = new LearnService(makeVideos(), enrollment, courses, makeMaterialsService(), makeCaptionsService());

    await svc.getLessonView(STUDENT_ID, course, lesson);

    expect(enrollment.stampCompleted).not.toHaveBeenCalled();
  });

  it('does not stamp an already-stamped enrollment', async () => {
    const enrollment = makeEnrollmentRepo({
      getEnrollment: {
        id: `${STUDENT_ID}__${CID}`,
        userId: STUDENT_ID,
        courseId: CID,
        status: 'ACTIVE',
        progress: [
          { lessonId: 'l1' as LessonId, completedAt: '2026-05-01T00:00:00Z', lastWatchedSeconds: 0 },
          { lessonId: 'l2' as LessonId, completedAt: '2026-05-02T00:00:00Z', lastWatchedSeconds: 0 },
        ],
        withdrawnAt: null,
        completedAt: '2026-05-02T00:00:00Z',
      },
    });
    const svc = new LearnService(makeVideos(), enrollment, courses, makeMaterialsService(), makeCaptionsService());

    await svc.getLessonView(STUDENT_ID, course, lesson);

    expect(enrollment.stampCompleted).not.toHaveBeenCalled();
  });

  it('does not stamp for the course owner (no enrollment)', async () => {
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(makeVideos(), enrollment, courses, makeMaterialsService(), makeCaptionsService());

    await svc.getLessonView(OWNER_UID, course, lesson);

    expect(enrollment.stampCompleted).not.toHaveBeenCalled();
  });

  it('a failing stamp write does not fail the read', async () => {
    const enrollment = makeEnrollmentRepo({
      getEnrollment: {
        id: `${STUDENT_ID}__${CID}`,
        userId: STUDENT_ID,
        courseId: CID,
        status: 'ACTIVE',
        progress: [
          { lessonId: 'l1' as LessonId, completedAt: '2026-05-01T00:00:00Z', lastWatchedSeconds: 0 },
          { lessonId: 'l2' as LessonId, completedAt: '2026-05-02T00:00:00Z', lastWatchedSeconds: 0 },
        ],
        withdrawnAt: null,
        completedAt: null,
      },
    });
    enrollment.stampCompleted = vi.fn().mockRejectedValue(new Error('boom'));
    const svc = new LearnService(makeVideos(), enrollment, courses, makeMaterialsService(), makeCaptionsService());
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const view = await svc.getLessonView(STUDENT_ID, course, lesson);

    expect(view.outline.modules.length).toBeGreaterThan(0);
    expect(warnSpy).toHaveBeenCalledWith(
      `stampCompleted failed for user=${STUDENT_ID} course=${CID}: boom`,
    );
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
