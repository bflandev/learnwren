import { describe, expect, it, vi } from 'vitest';

import type {
  CourseId,
  LessonId,
  UserId,
  Video,
  VideoId,
} from '@learnwren/shared-data-models';

import type { VideoConfig } from './video.config';
import {
  InvalidVideoStateException,
  LessonAlreadyHasVideoException,
  UploadObjectMissingException,
  UploadObjectSizeMismatchException,
  VideoNotFoundException,
} from './errors/video.exception';
import type { VideoRepository } from './video.repository';
import type { VideoStoragePort } from './video-storage.adapter';
import { VideoService } from './video.service';

interface RepoFake {
  newId: ReturnType<typeof vi.fn>;
  getVideo: ReturnType<typeof vi.fn>;
  getVideoByLesson: ReturnType<typeof vi.fn>;
  createVideo: ReturnType<typeof vi.fn>;
  updateVideo: ReturnType<typeof vi.fn>;
  finalizeUpload: ReturnType<typeof vi.fn>;
  deleteVideoAndDetach: ReturnType<typeof vi.fn>;
  writeVideoKey: ReturnType<typeof vi.fn>;
  deleteVideoKey: ReturnType<typeof vi.fn>;
}

interface StorageFake {
  createResumableSession: ReturnType<typeof vi.fn>;
  headObject: ReturnType<typeof vi.fn>;
  deleteObject: ReturnType<typeof vi.fn>;
}

function makeRepo(): RepoFake {
  return {
    newId: vi.fn(() => 'v-new' as VideoId),
    getVideo: vi.fn(),
    getVideoByLesson: vi.fn(),
    createVideo: vi.fn(),
    updateVideo: vi.fn(),
    finalizeUpload: vi.fn(),
    deleteVideoAndDetach: vi.fn(),
    writeVideoKey: vi.fn(),
    deleteVideoKey: vi.fn(),
  };
}

function makeStorage(): StorageFake {
  return {
    createResumableSession: vi.fn(),
    headObject: vi.fn(),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  };
}

const cfg: VideoConfig = {
  sourceBucket: 'src-bucket',
  stuckThresholdMinutes: 30,
};

const baseVideo = (overrides: Partial<Video> = {}): Video => ({
  id: 'v1' as VideoId,
  ownerInstructorId: 'u1' as UserId,
  courseId: 'c1' as CourseId,
  lessonId: 'l1' as LessonId,
  state: 'PENDING_UPLOAD',
  source: { bucket: 'src-bucket', path: 'videos/v1/source.mp4', sizeBytes: 1024 },
  createdAt: '2026-05-13T00:00:00.000Z' as Video['createdAt'],
  updatedAt: '2026-05-13T00:00:00.000Z' as Video['updatedAt'],
  ...overrides,
});

describe('VideoService.createUploadSession', () => {
  it('creates a Video doc and returns the session URI', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    storage.createResumableSession.mockResolvedValue({
      uri: 'https://upload-uri',
      expiresAt: '2026-05-20T00:00:00.000Z',
    });

    const svc = new VideoService(
      repo as unknown as VideoRepository,
      storage as unknown as VideoStoragePort,
      cfg,
    );
    const result = await svc.createUploadSession({
      uid: 'u1' as UserId,
      courseId: 'c1' as CourseId,
      lessonId: 'l1' as LessonId,
      lessonVideoId: undefined,
      input: { sizeBytes: 5000, contentType: 'video/mp4' },
    });

    expect(result.videoId).toBe('v-new');
    expect(result.uploadSessionUri).toBe('https://upload-uri');
    expect(repo.createVideo).toHaveBeenCalledTimes(1);
    const written = repo.createVideo.mock.calls[0]![0] as Video;
    expect(written.state).toBe('PENDING_UPLOAD');
    expect(written.source.path).toBe('videos/v-new/source.mp4');
    expect(storage.createResumableSession).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'src-bucket',
        videoId: 'v-new',
        contentType: 'video/mp4',
      }),
    );
  });

  it('rejects when the lesson already has a video', async () => {
    const svc = new VideoService(
      makeRepo() as unknown as VideoRepository,
      makeStorage() as unknown as VideoStoragePort,
      cfg,
    );
    await expect(
      svc.createUploadSession({
        uid: 'u1' as UserId,
        courseId: 'c1' as CourseId,
        lessonId: 'l1' as LessonId,
        lessonVideoId: 'v-existing' as VideoId,
        input: { sizeBytes: 1, contentType: 'video/mp4' },
      }),
    ).rejects.toBeInstanceOf(LessonAlreadyHasVideoException);
  });

  it('selects the correct extension for each MIME type', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    storage.createResumableSession.mockResolvedValue({
      uri: 'u',
      expiresAt: 'e',
    });
    const svc = new VideoService(
      repo as unknown as VideoRepository,
      storage as unknown as VideoStoragePort,
      cfg,
    );

    for (const [contentType, ext] of [
      ['video/mp4', 'mp4'],
      ['video/quicktime', 'mov'],
      ['video/x-matroska', 'mkv'],
    ] as const) {
      repo.newId.mockReturnValueOnce(`v-${ext}` as VideoId);
      await svc.createUploadSession({
        uid: 'u1' as UserId,
        courseId: 'c1' as CourseId,
        lessonId: 'l1' as LessonId,
        lessonVideoId: undefined,
        input: { sizeBytes: 1, contentType },
      });
      const written = repo.createVideo.mock.calls.at(-1)![0] as Video;
      expect(written.source.path).toBe(`videos/v-${ext}/source.${ext}`);
    }
  });
});

describe('VideoService.completeUpload', () => {
  it('finalises when object exists and size is within tolerance', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    repo.getVideo.mockResolvedValue(baseVideo());
    storage.headObject.mockResolvedValue({ size: 1024 });
    repo.finalizeUpload.mockResolvedValue(baseVideo({ state: 'UPLOADED' }));

    const svc = new VideoService(
      repo as unknown as VideoRepository,
      storage as unknown as VideoStoragePort,
      cfg,
    );
    const out = await svc.completeUpload('v1' as VideoId);

    expect(out.state).toBe('UPLOADED');
    expect(repo.finalizeUpload).toHaveBeenCalledWith(
      'v1',
      'l1',
      1024,
      expect.any(String),
    );
  });

  it('throws VIDEO_NOT_FOUND when the video is missing', async () => {
    const repo = makeRepo();
    repo.getVideo.mockResolvedValue(null);
    const svc = new VideoService(
      repo as unknown as VideoRepository,
      makeStorage() as unknown as VideoStoragePort,
      cfg,
    );
    await expect(svc.completeUpload('v1' as VideoId)).rejects.toBeInstanceOf(
      VideoNotFoundException,
    );
  });

  it('throws INVALID_VIDEO_STATE when video is not PENDING_UPLOAD', async () => {
    const repo = makeRepo();
    repo.getVideo.mockResolvedValue(baseVideo({ state: 'UPLOADED' }));
    const svc = new VideoService(
      repo as unknown as VideoRepository,
      makeStorage() as unknown as VideoStoragePort,
      cfg,
    );
    await expect(svc.completeUpload('v1' as VideoId)).rejects.toBeInstanceOf(
      InvalidVideoStateException,
    );
  });

  it('throws UPLOAD_OBJECT_MISSING when HEAD returns null', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    repo.getVideo.mockResolvedValue(baseVideo());
    storage.headObject.mockResolvedValue(null);
    const svc = new VideoService(
      repo as unknown as VideoRepository,
      storage as unknown as VideoStoragePort,
      cfg,
    );
    await expect(svc.completeUpload('v1' as VideoId)).rejects.toBeInstanceOf(
      UploadObjectMissingException,
    );
  });

  it('throws UPLOAD_OBJECT_SIZE_MISMATCH and deletes object when over tolerance', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    repo.getVideo.mockResolvedValue(
      baseVideo({ source: { bucket: 'src-bucket', path: 'p', sizeBytes: 100 } }),
    );
    storage.headObject.mockResolvedValue({ size: 200 }); // 100% over

    const svc = new VideoService(
      repo as unknown as VideoRepository,
      storage as unknown as VideoStoragePort,
      cfg,
    );
    await expect(svc.completeUpload('v1' as VideoId)).rejects.toBeInstanceOf(
      UploadObjectSizeMismatchException,
    );
    expect(storage.deleteObject).toHaveBeenCalledWith({ bucket: 'src-bucket', path: 'p' });
  });

  it('accepts size up to declared × 1.05', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    repo.getVideo.mockResolvedValue(
      baseVideo({ source: { bucket: 'src-bucket', path: 'p', sizeBytes: 100 } }),
    );
    storage.headObject.mockResolvedValue({ size: 105 });
    repo.finalizeUpload.mockResolvedValue(baseVideo({ state: 'UPLOADED' }));

    const svc = new VideoService(
      repo as unknown as VideoRepository,
      storage as unknown as VideoStoragePort,
      cfg,
    );
    await expect(svc.completeUpload('v1' as VideoId)).resolves.toBeDefined();
  });
});

describe('VideoService.markFailed', () => {
  it('advances PENDING_UPLOAD to FAILED with a reason', async () => {
    const repo = makeRepo();
    repo.getVideo.mockResolvedValue(baseVideo());
    const svc = new VideoService(
      repo as unknown as VideoRepository,
      makeStorage() as unknown as VideoStoragePort,
      cfg,
    );
    await svc.markFailed('v1' as VideoId, 'network error');
    expect(repo.updateVideo).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ state: 'FAILED', failureReason: 'network error' }),
    );
  });

  it('rejects FAILED transition from UPLOADED', async () => {
    const repo = makeRepo();
    repo.getVideo.mockResolvedValue(baseVideo({ state: 'UPLOADED' }));
    const svc = new VideoService(
      repo as unknown as VideoRepository,
      makeStorage() as unknown as VideoStoragePort,
      cfg,
    );
    await expect(svc.markFailed('v1' as VideoId, 'x')).rejects.toBeInstanceOf(
      InvalidVideoStateException,
    );
  });
});

describe('VideoService.delete', () => {
  it('deletes the object and Firestore docs when state allows', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    repo.getVideo.mockResolvedValue(baseVideo());
    const svc = new VideoService(
      repo as unknown as VideoRepository,
      storage as unknown as VideoStoragePort,
      cfg,
    );
    await svc.delete('v1' as VideoId);
    expect(storage.deleteObject).toHaveBeenCalledWith({
      bucket: 'src-bucket',
      path: 'videos/v1/source.mp4',
    });
    expect(repo.deleteVideoAndDetach).toHaveBeenCalledWith('v1', 'l1', expect.any(String));
  });

  it('rejects delete on a TRANSCODING (future) state', async () => {
    const repo = makeRepo();
    repo.getVideo.mockResolvedValue(baseVideo({ state: 'TRANSCODING' }));
    const svc = new VideoService(
      repo as unknown as VideoRepository,
      makeStorage() as unknown as VideoStoragePort,
      cfg,
    );
    await expect(svc.delete('v1' as VideoId)).rejects.toBeInstanceOf(
      InvalidVideoStateException,
    );
  });
});

describe('VideoService.deleteForLesson (cascade)', () => {
  it('no-ops when no video attached', async () => {
    const repo = makeRepo();
    repo.getVideoByLesson.mockResolvedValue(null);
    const svc = new VideoService(
      repo as unknown as VideoRepository,
      makeStorage() as unknown as VideoStoragePort,
      cfg,
    );
    await svc.deleteForLesson('l1' as LessonId);
    expect(repo.deleteVideoAndDetach).not.toHaveBeenCalled();
  });

  it('cascades regardless of video state', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    repo.getVideoByLesson.mockResolvedValue(baseVideo({ state: 'TRANSCODING' }));
    const svc = new VideoService(
      repo as unknown as VideoRepository,
      storage as unknown as VideoStoragePort,
      cfg,
    );
    await svc.deleteForLesson('l1' as LessonId);
    expect(storage.deleteObject).toHaveBeenCalled();
    expect(repo.deleteVideoAndDetach).toHaveBeenCalled();
  });
});
