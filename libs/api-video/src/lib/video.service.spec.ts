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
  deleteVideoAndDetach: ReturnType<typeof vi.fn>;
  finalizeUploadWithJob: ReturnType<typeof vi.fn>;
  markFailedFromSubmission: ReturnType<typeof vi.fn>;
  applyTranscoderResult: ReturnType<typeof vi.fn>;
}

interface StorageFake {
  createResumableSession: ReturnType<typeof vi.fn>;
  headObject: ReturnType<typeof vi.fn>;
  deleteObject: ReturnType<typeof vi.fn>;
  deletePrefix: ReturnType<typeof vi.fn>;
  probeSource: ReturnType<typeof vi.fn>;
}

function makeRepo(): RepoFake {
  return {
    newId: vi.fn(() => 'v-new' as VideoId),
    getVideo: vi.fn(),
    getVideoByLesson: vi.fn(),
    createVideo: vi.fn(),
    updateVideo: vi.fn(),
    deleteVideoAndDetach: vi.fn(),
    finalizeUploadWithJob: vi.fn(),
    markFailedFromSubmission: vi.fn(),
    applyTranscoderResult: vi.fn(),
  };
}

function makeStorage(): StorageFake {
  return {
    createResumableSession: vi.fn(),
    headObject: vi.fn(),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    deletePrefix: vi.fn().mockResolvedValue(undefined),
    probeSource: vi.fn().mockResolvedValue({ height: 1080, durationSec: 60 }),
  };
}

function makeTranscoder() {
  return {
    submitJob: vi.fn().mockResolvedValue({ jobName: 'jobs/default' }),
    parseEvent: vi.fn(),
    cancelJob: vi.fn().mockResolvedValue(undefined),
  };
}

const cfg: VideoConfig = {
  sourceBucket: 'src-bucket',
  outputBucket: 'out-bucket',
  stuckThresholdMinutes: 30,
  pollIntervalMs: 5000,
  transcoderImpl: 'fake',
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
    const transcoder = makeTranscoder();
    storage.createResumableSession.mockResolvedValue({
      uri: 'https://upload-uri',
      expiresAt: '2026-05-20T00:00:00.000Z',
    });

    const svc = new VideoService(
      repo as unknown as VideoRepository,
      storage as unknown as VideoStoragePort,
      cfg,
      transcoder as never,
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
      makeTranscoder() as never,
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
      makeTranscoder() as never,
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

describe('VideoService.completeUpload — slice A (guard tests)', () => {
  it('throws VIDEO_NOT_FOUND when the video is missing', async () => {
    const repo = makeRepo();
    repo.getVideo.mockResolvedValue(null);
    const svc = new VideoService(
      repo as unknown as VideoRepository,
      makeStorage() as unknown as VideoStoragePort,
      cfg,
      makeTranscoder() as never,
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
      makeTranscoder() as never,
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
      makeTranscoder() as never,
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
      makeTranscoder() as never,
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
    repo.finalizeUploadWithJob.mockResolvedValue(baseVideo({ state: 'TRANSCODING' }));

    const svc = new VideoService(
      repo as unknown as VideoRepository,
      storage as unknown as VideoStoragePort,
      cfg,
      makeTranscoder() as never,
      { sleep: async () => undefined },
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
      makeTranscoder() as never,
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
      makeTranscoder() as never,
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
      makeTranscoder() as never,
    );
    await svc.delete('v1' as VideoId);
    expect(storage.deleteObject).toHaveBeenCalledWith({
      bucket: 'src-bucket',
      path: 'videos/v1/source.mp4',
    });
    expect(repo.deleteVideoAndDetach).toHaveBeenCalledWith('v1', 'l1', expect.any(String));
  });

  it('cancels transcoder job and deletes when state is TRANSCODING', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    const transcoder = makeTranscoder();
    repo.getVideo.mockResolvedValue(
      baseVideo({ state: 'TRANSCODING', transcoderJobName: 'jobs/abc' }),
    );
    const svc = new VideoService(
      repo as unknown as VideoRepository,
      storage as unknown as VideoStoragePort,
      cfg,
      transcoder as never,
    );
    await svc.delete('v1' as VideoId);
    expect(transcoder.cancelJob).toHaveBeenCalledWith('jobs/abc');
    expect(repo.deleteVideoAndDetach).toHaveBeenCalled();
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
      makeTranscoder() as never,
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
      makeTranscoder() as never,
    );
    await svc.deleteForLesson('l1' as LessonId);
    expect(storage.deleteObject).toHaveBeenCalled();
    expect(repo.deleteVideoAndDetach).toHaveBeenCalled();
  });
});

describe('VideoService.completeUpload — slice B', () => {
  function makeServiceWithTranscoder(opts: {
    probe?: { height: number; durationSec: number };
    probeThrows?: Error;
    submitOutcomes?: ('OK' | Error)[];
  } = {}) {
    const repo = makeRepo();
    const storage = makeStorage();
    const transcoder = {
      submitJob: vi.fn(),
      parseEvent: vi.fn(),
      cancelJob: vi.fn(),
    };

    repo.getVideo.mockResolvedValue(baseVideo({ state: 'PENDING_UPLOAD' }));
    storage.headObject.mockResolvedValue({ size: 1024 });
    if (opts.probe) {
      (storage as unknown as { probeSource: ReturnType<typeof vi.fn> }).probeSource = vi.fn(
        async () => opts.probe,
      );
    } else if (opts.probeThrows) {
      (storage as unknown as { probeSource: ReturnType<typeof vi.fn> }).probeSource = vi.fn(async () => {
        throw opts.probeThrows;
      });
    } else {
      (storage as unknown as { probeSource: ReturnType<typeof vi.fn> }).probeSource = vi.fn(
        async () => ({ height: 1080, durationSec: 60 }),
      );
    }
    repo.finalizeUploadWithJob = vi.fn(async () =>
      baseVideo({ state: 'TRANSCODING', keyId: 'k1' as never, transcoderJobName: 'jobs/abc' }),
    );
    repo.markFailedFromSubmission = vi.fn(async (args: { failureReason: string }) =>
      baseVideo({ state: 'FAILED', failureReason: args.failureReason }),
    );

    const outcomes = opts.submitOutcomes ?? ['OK'];
    let call = 0;
    transcoder.submitJob.mockImplementation(async () => {
      const out = outcomes[call++];
      if (out instanceof Error) throw out;
      return { jobName: 'jobs/abc' };
    });

    const svc = new VideoService(
      repo as never,
      storage as never,
      cfg as never,
      transcoder as never,
      { sleep: async () => undefined }, // bypass backoff in tests
    );
    return { svc, repo, storage, transcoder };
  }

  it('happy path: probes, generates key, submits, finalizes to TRANSCODING', async () => {
    const { svc, repo, transcoder } = makeServiceWithTranscoder();
    const video = await svc.completeUpload('v1' as VideoId);
    expect(video.state).toBe('TRANSCODING');
    expect(transcoder.submitJob).toHaveBeenCalledTimes(1);
    expect(repo.finalizeUploadWithJob).toHaveBeenCalledWith(
      expect.objectContaining({
        vid: 'v1',
        transcoderJobName: 'jobs/abc',
        key: expect.objectContaining({ bytes: expect.any(Uint8Array) }),
      }),
    );
  });

  it('passes sourceHeight from the probe to submitJob', async () => {
    const { svc, transcoder } = makeServiceWithTranscoder({ probe: { height: 480, durationSec: 10 } });
    await svc.completeUpload('v1' as VideoId);
    expect(transcoder.submitJob).toHaveBeenCalledWith(
      expect.objectContaining({ sourceHeight: 480 }),
    );
  });

  it('ffprobe failure → markFailedFromSubmission with SOURCE_PROBE_FAILED', async () => {
    const { svc, repo, transcoder } = makeServiceWithTranscoder({
      probeThrows: new Error('bad source'),
    });
    const video = await svc.completeUpload('v1' as VideoId);
    expect(video.state).toBe('FAILED');
    expect(transcoder.submitJob).not.toHaveBeenCalled();
    expect(repo.markFailedFromSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ failureReason: expect.stringMatching(/SOURCE_PROBE_FAILED/) }),
    );
  });

  it('retries submitJob up to 3 times before failing', async () => {
    const { svc, transcoder, repo } = makeServiceWithTranscoder({
      submitOutcomes: [new Error('t1'), new Error('t2'), 'OK'],
    });
    const video = await svc.completeUpload('v1' as VideoId);
    expect(transcoder.submitJob).toHaveBeenCalledTimes(3);
    expect(video.state).toBe('TRANSCODING');
    expect(repo.markFailedFromSubmission).not.toHaveBeenCalled();
  });

  it('exhausts retries → markFailedFromSubmission with TRANSCODER_SUBMIT_FAILED', async () => {
    const { svc, repo, transcoder } = makeServiceWithTranscoder({
      submitOutcomes: [new Error('t1'), new Error('t2'), new Error('t3')],
    });
    const video = await svc.completeUpload('v1' as VideoId);
    expect(transcoder.submitJob).toHaveBeenCalledTimes(3);
    expect(video.state).toBe('FAILED');
    expect(repo.markFailedFromSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ failureReason: expect.stringMatching(/TRANSCODER_SUBMIT_FAILED/) }),
    );
  });

  it('rejects when state is not PENDING_UPLOAD', async () => {
    const { svc, repo } = makeServiceWithTranscoder();
    repo.getVideo.mockResolvedValue(baseVideo({ state: 'TRANSCODING' }));
    await expect(svc.completeUpload('v1' as VideoId)).rejects.toBeInstanceOf(InvalidVideoStateException);
  });

  it('rejects when object missing', async () => {
    const { svc, storage } = makeServiceWithTranscoder();
    storage.headObject.mockResolvedValue(null);
    await expect(svc.completeUpload('v1' as VideoId)).rejects.toBeInstanceOf(UploadObjectMissingException);
  });
});
