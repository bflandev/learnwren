import { describe, expect, it, vi } from 'vitest';

import type {
  CourseId,
  Lesson,
  LessonId,
  ModuleId,
  Video,
  VideoId,
} from '@learnwren/shared-data-models';

import {
  LessonNotFoundException,
  ModuleNotFoundException,
} from '@learnwren/api-courses';

import { VideoController } from './video.controller';
import type { VideoScopedRequest } from './types/loaded-video';

function makeCourseRepo(opts: { hasModule: boolean; lesson: Lesson | null }) {
  return {
    moduleExists: vi.fn().mockResolvedValue(opts.hasModule),
    getLesson: vi.fn().mockResolvedValue(opts.lesson),
  } as unknown as import('@learnwren/api-courses').CoursesRepository;
}

function makeService() {
  return {
    createUploadSession: vi.fn(),
    getVideo: vi.fn(),
    completeUpload: vi.fn(),
    markFailed: vi.fn(),
    delete: vi.fn(),
  };
}

const baseVideo: Video = {
  id: 'v1' as VideoId,
  ownerInstructorId: 'u1' as Video['ownerInstructorId'],
  courseId: 'c1' as Video['courseId'],
  lessonId: 'l1' as Video['lessonId'],
  state: 'PENDING_UPLOAD',
  source: { bucket: 'b', path: 'p' },
  createdAt: 'now' as Video['createdAt'],
  updatedAt: 'now' as Video['updatedAt'],
};

const lesson: Lesson = {
  id: 'l1' as LessonId,
  moduleId: 'm1' as ModuleId,
  title: 't',
  order: 0,
  createdAt: 'now' as Lesson['createdAt'],
  updatedAt: 'now' as Lesson['updatedAt'],
};

describe('VideoController', () => {
  it('rejects upload-session when module is not found', async () => {
    const ctrl = new VideoController(
      makeService() as never,
      makeCourseRepo({ hasModule: false, lesson: null }),
    );
    await expect(
      ctrl.createUploadSession(
        'c1' as CourseId,
        'mX' as ModuleId,
        'l1' as LessonId,
        { sizeBytes: 1, contentType: 'video/mp4' },
        { user: { uid: 'u1' } } as VideoScopedRequest,
      ),
    ).rejects.toBeInstanceOf(ModuleNotFoundException);
  });

  it('rejects upload-session when lesson is not found', async () => {
    const ctrl = new VideoController(
      makeService() as never,
      makeCourseRepo({ hasModule: true, lesson: null }),
    );
    await expect(
      ctrl.createUploadSession(
        'c1' as CourseId,
        'm1' as ModuleId,
        'l1' as LessonId,
        { sizeBytes: 1, contentType: 'video/mp4' },
        { user: { uid: 'u1' } } as VideoScopedRequest,
      ),
    ).rejects.toBeInstanceOf(LessonNotFoundException);
  });

  it('delegates to createUploadSession on the service for the happy path', async () => {
    const svc = makeService();
    svc.createUploadSession.mockResolvedValue({
      videoId: 'v-new',
      uploadSessionUri: 'u',
      expiresAt: 'e',
    });
    const ctrl = new VideoController(
      svc as never,
      makeCourseRepo({ hasModule: true, lesson }),
    );
    const out = await ctrl.createUploadSession(
      'c1' as CourseId,
      'm1' as ModuleId,
      'l1' as LessonId,
      { sizeBytes: 5, contentType: 'video/mp4' },
      { user: { uid: 'u1' } } as VideoScopedRequest,
    );
    expect(out.videoId).toBe('v-new');
    expect(svc.createUploadSession).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: 'u1',
        courseId: 'c1',
        lessonId: 'l1',
        lessonVideoId: undefined,
        input: { sizeBytes: 5, contentType: 'video/mp4' },
      }),
    );
  });

  it('returns the loaded video on getVideo (guard pre-loaded)', async () => {
    const ctrl = new VideoController(
      makeService() as never,
      makeCourseRepo({ hasModule: true, lesson }),
    );
    const req = { video: baseVideo } as VideoScopedRequest;
    const out = await ctrl.getVideo(req);
    expect(out).toBe(baseVideo);
  });

  it('passes through to service.completeUpload', async () => {
    const svc = makeService();
    svc.completeUpload.mockResolvedValue(baseVideo);
    const ctrl = new VideoController(
      svc as never,
      makeCourseRepo({ hasModule: true, lesson }),
    );
    await ctrl.completeUpload({ video: baseVideo } as VideoScopedRequest);
    expect(svc.completeUpload).toHaveBeenCalledWith('v1');
  });

  it('passes through to service.markFailed', async () => {
    const svc = makeService();
    svc.markFailed.mockResolvedValue(baseVideo);
    const ctrl = new VideoController(
      svc as never,
      makeCourseRepo({ hasModule: true, lesson }),
    );
    await ctrl.markFailed(
      { state: 'FAILED', failureReason: 'x' },
      { video: baseVideo } as VideoScopedRequest,
    );
    expect(svc.markFailed).toHaveBeenCalledWith('v1', 'x');
  });

  it('passes through to service.delete', async () => {
    const svc = makeService();
    const ctrl = new VideoController(
      svc as never,
      makeCourseRepo({ hasModule: true, lesson }),
    );
    await ctrl.delete({ video: baseVideo } as VideoScopedRequest);
    expect(svc.delete).toHaveBeenCalledWith('v1');
  });
});
