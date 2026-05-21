import { Test } from '@nestjs/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { FirebaseSessionGuard, InstructorRoleGuard } from '@learnwren/api-auth';
import { CourseOwnerGuard } from '../course-owner.guard';
import { CoursesRepository } from '../courses.repository';
import {
  LessonNotFoundException,
  ModuleNotFoundException,
} from '../errors/courses.exception';
import { FIREBASE_AUTH, FIRESTORE } from '@learnwren/api-firebase';
import type {
  CourseId,
  Lesson,
  LessonId,
  ModuleId,
  Video,
  VideoId,
} from '@learnwren/shared-data-models';
import { VideoController } from './video.controller';
import { VideoOwnerGuard } from './video-owner.guard';
import { VideoService } from './video.service';
import type { VideoScopedRequest } from './types/loaded-video';

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

function buildCoursesRepo(opts: { hasModule: boolean; lesson: Lesson | null }) {
  return {
    moduleExists: vi.fn().mockResolvedValue(opts.hasModule),
    getLesson: vi.fn().mockResolvedValue(opts.lesson),
  };
}

function buildVideoSvc() {
  return {
    createUploadSession: vi.fn(),
    getVideo: vi.fn(),
    completeUpload: vi.fn(),
    markFailed: vi.fn(),
    delete: vi.fn(),
  };
}

async function buildController(
  coursesRepo: ReturnType<typeof buildCoursesRepo>,
  videoSvc: ReturnType<typeof buildVideoSvc>,
): Promise<VideoController> {
  const mod = await Test.createTestingModule({
    controllers: [VideoController],
    providers: [
      { provide: VideoService, useValue: videoSvc },
      { provide: CoursesRepository, useValue: coursesRepo },
      { provide: FIRESTORE, useValue: {} },
      { provide: FIREBASE_AUTH, useValue: {} },
    ],
  })
    .overrideGuard(FirebaseSessionGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(InstructorRoleGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(CourseOwnerGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(VideoOwnerGuard)
    .useValue({ canActivate: () => true })
    .compile();
  return mod.get(VideoController);
}

describe('VideoController', () => {
  let coursesRepo: ReturnType<typeof buildCoursesRepo>;
  let videoSvc: ReturnType<typeof buildVideoSvc>;
  let ctrl: VideoController;

  beforeEach(async () => {
    coursesRepo = buildCoursesRepo({ hasModule: true, lesson });
    videoSvc = buildVideoSvc();
    ctrl = await buildController(coursesRepo, videoSvc);
  });

  it('rejects upload-session when module is not found', async () => {
    coursesRepo.moduleExists.mockResolvedValue(false);
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
    coursesRepo.getLesson.mockResolvedValue(null);
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
    videoSvc.createUploadSession.mockResolvedValue({
      videoId: 'v-new',
      uploadSessionUri: 'u',
      expiresAt: 'e',
    });
    const out = await ctrl.createUploadSession(
      'c1' as CourseId,
      'm1' as ModuleId,
      'l1' as LessonId,
      { sizeBytes: 5, contentType: 'video/mp4' },
      { user: { uid: 'u1' } } as VideoScopedRequest,
    );
    expect(out.videoId).toBe('v-new');
    expect(videoSvc.createUploadSession).toHaveBeenCalledWith(
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
    const req = { video: baseVideo } as VideoScopedRequest;
    const out = await ctrl.getVideo(req);
    expect(out).toBe(baseVideo);
  });

  it('passes through to service.completeUpload', async () => {
    videoSvc.completeUpload.mockResolvedValue(baseVideo);
    await ctrl.completeUpload({ video: baseVideo } as VideoScopedRequest);
    expect(videoSvc.completeUpload).toHaveBeenCalledWith('v1');
  });

  it('passes through to service.markFailed', async () => {
    videoSvc.markFailed.mockResolvedValue(baseVideo);
    await ctrl.markFailed(
      { state: 'FAILED', failureReason: 'x' },
      { video: baseVideo } as VideoScopedRequest,
    );
    expect(videoSvc.markFailed).toHaveBeenCalledWith('v1', 'x');
  });

  it('passes through to service.delete', async () => {
    await ctrl.delete({ video: baseVideo } as VideoScopedRequest);
    expect(videoSvc.delete).toHaveBeenCalledWith('v1');
  });
});
