import { describe, expect, it, vi } from 'vitest';

import type {
  Course,
  CourseId,
  Lesson,
  LessonId,
  ModuleId,
  UserId,
  Video,
  VideoId,
} from '@learnwren/shared-data-models';

import type { EnrollmentRepository } from '../enrollment/enrollment.repository';
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
  } as unknown as VideoRepository;
}

function makeEnrollmentRepo(overrides: Partial<{ getEnrollment: unknown }> = {}) {
  return {
    getEnrollment: vi.fn().mockResolvedValue(
      'getEnrollment' in overrides ? overrides.getEnrollment : null,
    ),
  } as unknown as EnrollmentRepository;
}

describe('LearnService', () => {
  it('maps a lesson with a READY video to the full LessonView shape', async () => {
    const video = { id: VID, state: 'READY' } as unknown as Video;
    const videos = makeVideoRepo({ getVideo: video });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment);

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
      },
      progress: null,
    });
  });

  it('returns videoId null and videoState null when the lesson has no video', async () => {
    const videos = makeVideoRepo({ getVideo: null });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment);
    const lessonWithoutVideo: Lesson = { ...baseLesson, videoId: undefined };

    const view = await svc.getLessonView(STUDENT_ID, baseCourse, lessonWithoutVideo);

    expect(view.lesson.videoId).toBeNull();
    expect(view.lesson.videoState).toBeNull();
    expect(videos.getVideo).not.toHaveBeenCalled();
  });

  it('returns videoState null when the video document is missing', async () => {
    const videos = makeVideoRepo({ getVideo: null });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment);

    const view = await svc.getLessonView(STUDENT_ID, baseCourse, baseLesson);

    expect(view.lesson.videoId).toBe(VID);
    expect(view.lesson.videoState).toBeNull();
    expect(videos.getVideo).toHaveBeenCalledWith(VID);
  });

  it('returns videoState TRANSCODING for an in-flight video', async () => {
    const video = { id: VID, state: 'TRANSCODING' } as unknown as Video;
    const videos = makeVideoRepo({ getVideo: video });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment);

    const view = await svc.getLessonView(STUDENT_ID, baseCourse, baseLesson);

    expect(view.lesson.videoState).toBe('TRANSCODING');
  });

  it('passes through a non-empty description as-is', async () => {
    const videos = makeVideoRepo({ getVideo: null });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment);
    const lessonWithDesc: Lesson = { ...baseLesson, description: 'Hello world' };

    const view = await svc.getLessonView(STUDENT_ID, baseCourse, lessonWithDesc);

    expect(view.lesson.description).toBe('Hello world');
  });

  it('leaves description undefined when the lesson has no description authored', async () => {
    const videos = makeVideoRepo({ getVideo: null });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment);
    const lessonNoDesc: Lesson = { ...baseLesson, description: undefined };

    const view = await svc.getLessonView(STUDENT_ID, baseCourse, lessonNoDesc);

    expect(view.lesson.description).toBeUndefined();
  });

  it('preserves an explicit empty-string description distinct from undefined', async () => {
    const videos = makeVideoRepo({ getVideo: null });
    const enrollment = makeEnrollmentRepo({ getEnrollment: null });
    const svc = new LearnService(videos, enrollment);
    const lessonEmptyDesc: Lesson = { ...baseLesson, description: '' };

    const view = await svc.getLessonView(STUDENT_ID, baseCourse, lessonEmptyDesc);

    expect(view.lesson.description).toBe('');
  });
});

describe('getLessonView progress', () => {
  it('returns progress: null when the caller is the course owner', async () => {
    const videos = { getVideo: vi.fn().mockResolvedValue(null) } as unknown as VideoRepository;
    const enrollment = {
      getEnrollment: vi.fn().mockResolvedValue(null),
    } as unknown as EnrollmentRepository;
    const service = new LearnService(videos, enrollment);
    const course = makeCourse({ instructorId: 'owner-1' as UserId });
    const view = await service.getLessonView('owner-1' as UserId, course, makeLesson());
    expect(view.progress).toBeNull();
    expect(enrollment.getEnrollment).not.toHaveBeenCalled();
  });

  it('returns { completedAt: null, lastWatchedSeconds: 0 } when the enrolled student has no LessonProgress row yet', async () => {
    const videos = { getVideo: vi.fn().mockResolvedValue(null) } as unknown as VideoRepository;
    const enrollment = {
      getEnrollment: vi.fn().mockResolvedValue({
        id: 's__c', userId: 's', courseId: 'c', status: 'ACTIVE',
        progress: [], withdrawnAt: null, createdAt: 't', updatedAt: 't',
      }),
      touchLastAccessed: vi.fn(async () => undefined),
    } as unknown as EnrollmentRepository;
    const service = new LearnService(videos, enrollment);
    const view = await service.getLessonView(
      's' as UserId,
      makeCourse({ instructorId: 'owner-1' as UserId }),
      makeLesson({ id: 'l1' as LessonId }),
    );
    expect(view.progress).toEqual({ completedAt: null, lastWatchedSeconds: 0 });
  });

  it('returns { completedAt: <iso>, lastWatchedSeconds: 0 } when the LessonProgress row has a prior completion', async () => {
    const videos = { getVideo: vi.fn().mockResolvedValue(null) } as unknown as VideoRepository;
    const enrollment = {
      getEnrollment: vi.fn().mockResolvedValue({
        id: 's__c', userId: 's', courseId: 'c', status: 'ACTIVE',
        progress: [{ lessonId: 'l1', completedAt: '2026-05-20T00:00:00.000Z', lastWatchedSeconds: 0 }],
        withdrawnAt: null, createdAt: 't', updatedAt: 't',
      }),
      touchLastAccessed: vi.fn(async () => undefined),
    } as unknown as EnrollmentRepository;
    const service = new LearnService(videos, enrollment);
    const view = await service.getLessonView(
      's' as UserId,
      makeCourse({ instructorId: 'owner-1' as UserId }),
      makeLesson({ id: 'l1' as LessonId }),
    );
    expect(view.progress).toEqual({ completedAt: '2026-05-20T00:00:00.000Z', lastWatchedSeconds: 0 });
  });

  it('returns progress: null when no enrolment exists (defensive — guard should have blocked)', async () => {
    const videos = { getVideo: vi.fn().mockResolvedValue(null) } as unknown as VideoRepository;
    const enrollment = {
      getEnrollment: vi.fn().mockResolvedValue(null),
    } as unknown as EnrollmentRepository;
    const service = new LearnService(videos, enrollment);
    const view = await service.getLessonView(
      's' as UserId,
      makeCourse({ instructorId: 'owner-1' as UserId }),
      makeLesson({ id: 'l1' as LessonId }),
    );
    expect(view.progress).toBeNull();
    expect(enrollment.getEnrollment).toHaveBeenCalledOnce();
  });
});

describe('LearnService.getLessonView (Slice C — lastAccessed touch + lastWatchedSeconds)', () => {
  const OWNER_UID = 'owner-1' as UserId;
  const STUDENT_UID = 's' as UserId;
  const COURSE = makeCourse({ instructorId: OWNER_UID });
  const LESSON = makeLesson({ id: 'l1' as LessonId });

  it('calls touchLastAccessed exactly once for an enrolled student', async () => {
    const touchSpy = vi.fn(async () => undefined);
    const videos = { getVideo: vi.fn().mockResolvedValue(null) } as unknown as VideoRepository;
    const enrollment = {
      getEnrollment: vi.fn().mockResolvedValue({
        id: 's__c', userId: 's', courseId: 'c', status: 'ACTIVE',
        progress: [{ lessonId: LESSON.id, completedAt: null, lastWatchedSeconds: 0 }],
        withdrawnAt: null, createdAt: 't', updatedAt: 't',
      }),
      touchLastAccessed: touchSpy,
    } as unknown as EnrollmentRepository;
    const service = new LearnService(videos, enrollment);
    await service.getLessonView(STUDENT_UID, COURSE, LESSON);
    expect(touchSpy).toHaveBeenCalledTimes(1);
    expect(touchSpy).toHaveBeenCalledWith(STUDENT_UID, COURSE.id, LESSON.id, expect.any(String));
  });

  it('does NOT call touchLastAccessed for the course owner', async () => {
    const touchSpy = vi.fn(async () => undefined);
    const videos = { getVideo: vi.fn().mockResolvedValue(null) } as unknown as VideoRepository;
    const enrollment = {
      getEnrollment: vi.fn().mockResolvedValue(null),
      touchLastAccessed: touchSpy,
    } as unknown as EnrollmentRepository;
    const service = new LearnService(videos, enrollment);
    await service.getLessonView(OWNER_UID, COURSE, LESSON);
    expect(touchSpy).not.toHaveBeenCalled();
  });

  it('returns the view even when touchLastAccessed throws (best-effort)', async () => {
    const touchSpy = vi.fn(async () => { throw new Error('boom'); });
    const videos = { getVideo: vi.fn().mockResolvedValue(null) } as unknown as VideoRepository;
    const enrollment = {
      getEnrollment: vi.fn().mockResolvedValue({
        id: 's__c', userId: 's', courseId: 'c', status: 'ACTIVE',
        progress: [],
        withdrawnAt: null, createdAt: 't', updatedAt: 't',
      }),
      touchLastAccessed: touchSpy,
    } as unknown as EnrollmentRepository;
    const service = new LearnService(videos, enrollment);
    const view = await service.getLessonView(STUDENT_UID, COURSE, LESSON);
    expect(view.course.id).toBe(COURSE.id);
    expect(touchSpy).toHaveBeenCalledTimes(1);
  });

  it('propagates lastWatchedSeconds from the matching LessonProgress row', async () => {
    const videos = { getVideo: vi.fn().mockResolvedValue(null) } as unknown as VideoRepository;
    const enrollment = {
      getEnrollment: vi.fn().mockResolvedValue({
        id: 's__c', userId: 's', courseId: 'c', status: 'ACTIVE',
        progress: [{ lessonId: LESSON.id, completedAt: null, lastWatchedSeconds: 87 }],
        withdrawnAt: null, createdAt: 't', updatedAt: 't',
      }),
      touchLastAccessed: vi.fn(async () => undefined),
    } as unknown as EnrollmentRepository;
    const service = new LearnService(videos, enrollment);
    const view = await service.getLessonView(STUDENT_UID, COURSE, LESSON);
    expect(view.progress).toEqual({ completedAt: null, lastWatchedSeconds: 87 });
  });

  it('defaults lastWatchedSeconds to 0 when no LessonProgress row exists yet', async () => {
    const videos = { getVideo: vi.fn().mockResolvedValue(null) } as unknown as VideoRepository;
    const enrollment = {
      getEnrollment: vi.fn().mockResolvedValue({
        id: 's__c', userId: 's', courseId: 'c', status: 'ACTIVE',
        progress: [],
        withdrawnAt: null, createdAt: 't', updatedAt: 't',
      }),
      touchLastAccessed: vi.fn(async () => undefined),
    } as unknown as EnrollmentRepository;
    const service = new LearnService(videos, enrollment);
    const view = await service.getLessonView(STUDENT_UID, COURSE, LESSON);
    expect(view.progress).toEqual({ completedAt: null, lastWatchedSeconds: 0 });
  });
});
