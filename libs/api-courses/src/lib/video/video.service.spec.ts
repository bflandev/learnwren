import { describe, expect, it, vi } from 'vitest';

import type {
  CourseId,
  LessonId,
  UserId,
  Video,
  VideoId,
} from '@learnwren/shared-data-models';

import type { VideoConfig } from './video.config';
import type { TranscoderEvent } from './transcoder/transcoder.port';
import {
  InvalidVideoStateException,
  LessonAlreadyHasVideoException,
  UploadCompletionInProgressException,
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
  claimUploadCompletion: ReturnType<typeof vi.fn>;
  releaseUploadCompletionClaim: ReturnType<typeof vi.fn>;
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
    claimUploadCompletion: vi.fn(),
    releaseUploadCompletionClaim: vi.fn().mockResolvedValue(undefined),
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

describe('VideoService.getVideo', () => {
  it('returns the video when the repo has it', async () => {
    const repo = makeRepo();
    const v = baseVideo();
    repo.getVideo.mockResolvedValue(v);
    const svc = new VideoService(
      repo as unknown as VideoRepository,
      makeStorage() as unknown as VideoStoragePort,
      cfg,
      makeTranscoder() as never,
    );
    await expect(svc.getVideo('v1' as VideoId)).resolves.toBe(v);
  });

  it('throws VIDEO_NOT_FOUND when the repo has no such video', async () => {
    const repo = makeRepo();
    repo.getVideo.mockResolvedValue(null);
    const svc = new VideoService(
      repo as unknown as VideoRepository,
      makeStorage() as unknown as VideoStoragePort,
      cfg,
      makeTranscoder() as never,
    );
    await expect(svc.getVideo('v1' as VideoId)).rejects.toBeInstanceOf(VideoNotFoundException);
  });
});

describe('VideoService.completeUpload — slice A (guard tests)', () => {
  it('throws VIDEO_NOT_FOUND when the video is missing', async () => {
    const repo = makeRepo();
    repo.claimUploadCompletion.mockRejectedValue(new VideoNotFoundException());
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
    repo.claimUploadCompletion.mockRejectedValue(new InvalidVideoStateException('UPLOADED'));
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

  it('throws UPLOAD_OBJECT_MISSING when HEAD returns null and releases the claim', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    repo.claimUploadCompletion.mockResolvedValue(baseVideo());
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
    expect(repo.releaseUploadCompletionClaim).toHaveBeenCalledWith('v1');
    // headObject must receive the exact {bucket, path} from the video source;
    // an emptied object literal would HEAD the wrong (undefined) location.
    expect(storage.headObject).toHaveBeenCalledWith({
      bucket: 'src-bucket',
      path: 'videos/v1/source.mp4',
    });
  });

  it('claims with a staleBefore exactly CLAIM_TTL_MS (10 min) before now', async () => {
    // Pins CLAIM_TTL_MS = 10 * 60_000: staleBefore must be now − 600000 ms.
    // The `*`→`/` mutant would make the window ~0.000167 ms, so a crashed
    // claim seconds old would no longer be re-claimable. Assert the gap.
    const repo = makeRepo();
    const storage = makeStorage();
    repo.claimUploadCompletion.mockResolvedValue(baseVideo());
    storage.headObject.mockResolvedValue(null); // bail right after the claim
    const svc = new VideoService(
      repo as unknown as VideoRepository,
      storage as unknown as VideoStoragePort,
      cfg,
      makeTranscoder() as never,
    );
    await expect(svc.completeUpload('v1' as VideoId)).rejects.toBeInstanceOf(
      UploadObjectMissingException,
    );
    const [, nowArg, staleArg] = repo.claimUploadCompletion.mock.calls[0]! as [
      string,
      string,
      string,
    ];
    expect(Date.parse(nowArg) - Date.parse(staleArg)).toBe(10 * 60_000);
  });

  it('throws UPLOAD_OBJECT_SIZE_MISMATCH and deletes object when over tolerance and releases the claim', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    repo.claimUploadCompletion.mockResolvedValue(
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
    expect(repo.releaseUploadCompletionClaim).toHaveBeenCalledWith('v1');
  });

  it('accepts size up to declared × 1.05', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    repo.claimUploadCompletion.mockResolvedValue(
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
    const result = await svc.markFailed('v1' as VideoId, 'network error');
    expect(repo.updateVideo).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ state: 'FAILED', failureReason: 'network error' }),
    );
    // The returned video must reflect the transition, not just the repo write.
    expect(result.state).toBe('FAILED');
    expect(result.failureReason).toBe('network error');
  });

  it('throws VIDEO_NOT_FOUND when markFailed targets a missing video', async () => {
    const repo = makeRepo();
    repo.getVideo.mockResolvedValue(null);
    const svc = new VideoService(
      repo as unknown as VideoRepository,
      makeStorage() as unknown as VideoStoragePort,
      cfg,
      makeTranscoder() as never,
    );
    await expect(svc.markFailed('v1' as VideoId, 'x')).rejects.toBeInstanceOf(
      VideoNotFoundException,
    );
    expect(repo.updateVideo).not.toHaveBeenCalled();
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

  it('throws VIDEO_NOT_FOUND when deleting a missing video', async () => {
    const repo = makeRepo();
    repo.getVideo.mockResolvedValue(null);
    const svc = new VideoService(
      repo as unknown as VideoRepository,
      makeStorage() as unknown as VideoStoragePort,
      cfg,
      makeTranscoder() as never,
    );
    await expect(svc.delete('v1' as VideoId)).rejects.toBeInstanceOf(VideoNotFoundException);
    expect(repo.deleteVideoAndDetach).not.toHaveBeenCalled();
  });

  it('allows deleting an UPLOADED video (DELETABLE_STATES membership)', async () => {
    // Pins the 'UPLOADED' literal in DELETABLE_STATES: blanking it would make
    // .has('UPLOADED') false and reject the delete with InvalidVideoState.
    const repo = makeRepo();
    const storage = makeStorage();
    const transcoder = makeTranscoder();
    repo.getVideo.mockResolvedValue(baseVideo({ state: 'UPLOADED' }));
    const svc = new VideoService(
      repo as unknown as VideoRepository,
      storage as unknown as VideoStoragePort,
      cfg,
      transcoder as never,
    );
    await expect(svc.delete('v1' as VideoId)).resolves.toBeUndefined();
    expect(repo.deleteVideoAndDetach).toHaveBeenCalled();
    // Not TRANSCODING → no job to cancel (also pins the L329 whole-condition
    // guard: forcing it true would call cancelJob on a non-TRANSCODING video).
    expect(transcoder.cancelJob).not.toHaveBeenCalled();
  });

  it('allows deleting a FAILED video (DELETABLE_STATES membership)', async () => {
    // Pins the 'FAILED' literal in DELETABLE_STATES.
    const repo = makeRepo();
    const storage = makeStorage();
    repo.getVideo.mockResolvedValue(baseVideo({ state: 'FAILED' }));
    const svc = new VideoService(
      repo as unknown as VideoRepository,
      storage as unknown as VideoStoragePort,
      cfg,
      makeTranscoder() as never,
    );
    await expect(svc.delete('v1' as VideoId)).resolves.toBeUndefined();
    expect(repo.deleteVideoAndDetach).toHaveBeenCalled();
  });
});

describe('VideoService.tearDownVideoSideEffects — cancelJob failure logging', () => {
  it('delete() logs a warning when cancelJob fails (logCancelFailures: true)', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    const transcoder = makeTranscoder();
    repo.getVideo.mockResolvedValue(
      baseVideo({ state: 'TRANSCODING', transcoderJobName: 'jobs/abc' }),
    );
    transcoder.cancelJob.mockRejectedValue(new Error('cancel boom'));
    const svc = new VideoService(
      repo as unknown as VideoRepository,
      storage as unknown as VideoStoragePort,
      cfg,
      transcoder as never,
    );
    const warn = vi.spyOn(
      (svc as unknown as { logger: { warn: (m: string) => void } }).logger,
      'warn',
    );

    await svc.delete('v1' as VideoId);

    // logCancelFailures:true means the failed cancel MUST be logged. Emptying
    // the opts object (→ undefined) or flipping the boolean to false would
    // suppress this warning.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/cancelJob failed for jobs\/abc/);
    expect(repo.deleteVideoAndDetach).toHaveBeenCalled();
  });

  it('deleteForLesson() does NOT log when cancelJob fails (logCancelFailures: false)', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    const transcoder = makeTranscoder();
    repo.getVideoByLesson.mockResolvedValue(
      baseVideo({ state: 'TRANSCODING', transcoderJobName: 'jobs/xyz' }),
    );
    transcoder.cancelJob.mockRejectedValue(new Error('cancel boom'));
    const svc = new VideoService(
      repo as unknown as VideoRepository,
      storage as unknown as VideoStoragePort,
      cfg,
      transcoder as never,
    );
    const warn = vi.spyOn(
      (svc as unknown as { logger: { warn: (m: string) => void } }).logger,
      'warn',
    );

    await svc.deleteForLesson('l1' as LessonId);

    // logCancelFailures:false → the cascade swallows the cancel failure
    // silently. Flipping the boolean to true would emit a warning here.
    expect(warn).not.toHaveBeenCalled();
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

  it('cancels the in-flight transcoder job when cascading a TRANSCODING video', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    const transcoder = makeTranscoder();
    repo.getVideoByLesson.mockResolvedValue(
      baseVideo({ state: 'TRANSCODING', transcoderJobName: 'jobs/xyz' }),
    );
    const svc = new VideoService(
      repo as unknown as VideoRepository,
      storage as unknown as VideoStoragePort,
      cfg,
      transcoder as never,
    );
    await svc.deleteForLesson('l1' as LessonId);
    expect(transcoder.cancelJob).toHaveBeenCalledWith('jobs/xyz');
    expect(repo.deleteVideoAndDetach).toHaveBeenCalled();
  });

  it('deletes the output prefix when cascading a READY video', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    repo.getVideoByLesson.mockResolvedValue(
      baseVideo({
        state: 'READY',
        output: { bucket: 'out', manifestPath: 'videos/v1/hls/manifest.m3u8', durationSec: 60 },
      }),
    );
    const svc = new VideoService(
      repo as unknown as VideoRepository,
      storage as unknown as VideoStoragePort,
      cfg,
      makeTranscoder() as never,
    );
    await svc.deleteForLesson('l1' as LessonId);
    expect(storage.deletePrefix).toHaveBeenCalledWith({ bucket: 'out', prefix: 'videos/v1/' });
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

    repo.claimUploadCompletion.mockResolvedValue(baseVideo({ state: 'PENDING_UPLOAD' }));
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

  it('threads the probed source duration into finalizeUploadWithJob', async () => {
    // Without the fix, tryProbeSource narrowed durationSec away, so the probe
    // value never reached the repo and Video.output.durationSec stayed 0.
    const { svc, repo } = makeServiceWithTranscoder({ probe: { height: 720, durationSec: 30 } });
    await svc.completeUpload('v1' as VideoId);
    expect(repo.finalizeUploadWithJob).toHaveBeenCalledWith(
      expect.objectContaining({ probedDurationSec: 30 }),
    );
  });

  it('accepts the upload when no source size was declared (sizeBytes absent)', async () => {
    // declared = sizeBytes ?? 0 = 0; without the fix `head.size > 0 * 1.05` is
    // true for any real upload and every such upload is wrongly rejected.
    const { svc, repo, storage } = makeServiceWithTranscoder();
    repo.claimUploadCompletion.mockResolvedValue(baseVideo({ source: { bucket: 'src-bucket', path: 'p' } }));
    storage.headObject.mockResolvedValue({ size: 5000 });

    const video = await svc.completeUpload('v1' as VideoId);

    expect(video.state).toBe('TRANSCODING');
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('ffprobe failure → markFailedFromSubmission with SOURCE_PROBE_FAILED', async () => {
    const { svc, repo, storage, transcoder } = makeServiceWithTranscoder({
      probeThrows: new Error('bad source'),
    });
    const video = await svc.completeUpload('v1' as VideoId);
    expect(video.state).toBe('FAILED');
    expect(transcoder.submitJob).not.toHaveBeenCalled();
    // The probe error message must be carried into the reason — this pins the
    // `{ ok: false, error: message }` object (an emptied literal would drop
    // `error`, yielding "SOURCE_PROBE_FAILED: undefined").
    expect(repo.markFailedFromSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        failureReason: 'SOURCE_PROBE_FAILED: bad source',
      }),
    );
    // probeSource must be called with the exact {bucket, path} from the source;
    // an emptied object literal would probe the wrong (undefined) location.
    expect(storage.probeSource).toHaveBeenCalledWith({
      bucket: 'src-bucket',
      path: 'videos/v1/source.mp4',
    });
  });

  it('caps the failure reason at 500 characters', async () => {
    // Pins `.slice(0, 500)`: a 1000-char probe error must be truncated to a
    // 500-char stored reason. Dropping the slice would persist the full string.
    const longDetail = 'x'.repeat(1000);
    const { svc, repo } = makeServiceWithTranscoder({
      probeThrows: new Error(longDetail),
    });
    await svc.completeUpload('v1' as VideoId);
    const reason = (repo.markFailedFromSubmission.mock.calls[0]![0] as { failureReason: string })
      .failureReason;
    expect(reason).toHaveLength(500);
    expect(reason.startsWith('SOURCE_PROBE_FAILED: ')).toBe(true);
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
    // The failure reason must carry the *last* attempt's error, not the
    // initial 'unknown' placeholder — pins the catch body and the result shape.
    expect(repo.markFailedFromSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        failureReason: expect.stringMatching(/TRANSCODER_SUBMIT_FAILED: t3/),
      }),
    );
  });

  it('builds the transcoder job input with source/output URIs, key, height and videoId', async () => {
    const { svc, transcoder } = makeServiceWithTranscoder({ probe: { height: 720, durationSec: 30 } });
    await svc.completeUpload('v1' as VideoId);
    expect(transcoder.submitJob).toHaveBeenCalledWith(
      expect.objectContaining({
        videoId: 'v1',
        sourceUri: 'gs://src-bucket/videos/v1/source.mp4',
        outputUriPrefix: 'gs://out-bucket/videos/v1/hls/',
        encryptionKey: expect.objectContaining({ bytes: expect.any(Uint8Array) }),
        sourceHeight: 720,
        // cfg has no transcoderTopic (fake mode), so `cfg.transcoderTopic ?? ''`
        // must resolve to the empty string. The `??`→`&&` mutant yields
        // undefined; the ''→'Stryker was here!' mutant yields the marker.
        topic: '',
      }),
    );
  });

  it('sleeps with exponential backoff between retries but not after the final attempt', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    const transcoder = {
      submitJob: vi.fn(async () => {
        throw new Error('always fails');
      }),
      parseEvent: vi.fn(),
      cancelJob: vi.fn(),
    };
    repo.claimUploadCompletion.mockResolvedValue(baseVideo({ state: 'PENDING_UPLOAD' }));
    storage.headObject.mockResolvedValue({ size: 1024 });
    repo.markFailedFromSubmission = vi.fn(async () => baseVideo({ state: 'FAILED' }));
    const sleep = vi.fn(async () => undefined);
    const svc = new VideoService(repo as never, storage as never, cfg as never, transcoder as never, {
      sleep,
    });

    await svc.completeUpload('v1' as VideoId);

    // 3 attempts → backoff after attempts 0 and 1 only, with the BACKOFF_MS
    // ladder; never after the last attempt.
    expect(sleep.mock.calls).toEqual([[1_000], [2_000]]);
  });

  it('rejects when state is not PENDING_UPLOAD', async () => {
    const { svc, repo } = makeServiceWithTranscoder();
    repo.claimUploadCompletion.mockRejectedValue(new InvalidVideoStateException('TRANSCODING'));
    await expect(svc.completeUpload('v1' as VideoId)).rejects.toBeInstanceOf(InvalidVideoStateException);
  });

  it('rejects when object missing', async () => {
    const { svc, storage } = makeServiceWithTranscoder();
    storage.headObject.mockResolvedValue(null);
    await expect(svc.completeUpload('v1' as VideoId)).rejects.toBeInstanceOf(UploadObjectMissingException);
  });
});

describe('VideoService.completeUpload — atomic claim (concurrency guard)', () => {
  function makeServiceWithClaim() {
    const repo = makeRepo();
    const storage = makeStorage();
    const transcoder = makeTranscoder();
    storage.headObject.mockResolvedValue({ size: 1024 });
    repo.finalizeUploadWithJob = vi.fn(async () =>
      baseVideo({ state: 'TRANSCODING', keyId: 'k1' as never, transcoderJobName: 'jobs/abc' }),
    );
    repo.markFailedFromSubmission = vi.fn(async (args: { failureReason: string }) =>
      baseVideo({ state: 'FAILED', failureReason: args.failureReason }),
    );
    const svc = new VideoService(
      repo as never,
      storage as never,
      cfg as never,
      transcoder as never,
      { sleep: async () => undefined },
    );
    return { svc, repo, storage, transcoder };
  }

  it('propagates UploadCompletionInProgressException without calling submitJob', async () => {
    // This is the duplicate-submit kill-shot: a concurrent completeUpload that
    // loses the claim race must never reach submitJob.
    const { svc, repo, transcoder } = makeServiceWithClaim();
    repo.claimUploadCompletion.mockRejectedValue(new UploadCompletionInProgressException());

    await expect(svc.completeUpload('v1' as VideoId)).rejects.toBeInstanceOf(
      UploadCompletionInProgressException,
    );
    expect(transcoder.submitJob).not.toHaveBeenCalled();
  });

  it('calls claimUploadCompletion BEFORE submitJob on the happy path', async () => {
    // Assert call ordering: claim must precede submit.
    const { svc, repo, transcoder } = makeServiceWithClaim();
    repo.claimUploadCompletion.mockResolvedValue(baseVideo({ state: 'PENDING_UPLOAD' }));

    const callOrder: string[] = [];
    repo.claimUploadCompletion.mockImplementation(async () => {
      callOrder.push('claim');
      return baseVideo({ state: 'PENDING_UPLOAD' });
    });
    transcoder.submitJob.mockImplementation(async () => {
      callOrder.push('submit');
      return { jobName: 'jobs/abc' };
    });

    await svc.completeUpload('v1' as VideoId);

    expect(callOrder.indexOf('claim')).toBeLessThan(callOrder.indexOf('submit'));
  });

  it('verify-object failure (UPLOAD_OBJECT_MISSING) releases claim then rethrows', async () => {
    // Non-terminal: state stays PENDING_UPLOAD so instructor can retry.
    // The claim must be released so that retry does not hit a 10-min block.
    const { svc, repo, storage } = makeServiceWithClaim();
    repo.claimUploadCompletion.mockResolvedValue(baseVideo());
    storage.headObject.mockResolvedValue(null); // triggers UploadObjectMissingException

    await expect(svc.completeUpload('v1' as VideoId)).rejects.toBeInstanceOf(
      UploadObjectMissingException,
    );
    expect(repo.releaseUploadCompletionClaim).toHaveBeenCalledWith('v1');
  });

  it('probe failure goes through recordPipelineFailure (terminal FAILED); no claim release needed', async () => {
    // Terminal path: markFailedFromSubmission sets FAILED + strips claim in tx.
    // releaseUploadCompletionClaim must NOT be called — the repo handles it.
    const { svc, repo, storage } = makeServiceWithClaim();
    repo.claimUploadCompletion.mockResolvedValue(baseVideo());
    (storage as unknown as { probeSource: ReturnType<typeof vi.fn> }).probeSource = vi.fn(async () => {
      throw new Error('bad source');
    });

    const video = await svc.completeUpload('v1' as VideoId);

    expect(video.state).toBe('FAILED');
    expect(repo.releaseUploadCompletionClaim).not.toHaveBeenCalled();
  });

  it('finalizeUploadWithJob is still called on the happy path', async () => {
    const { svc, repo } = makeServiceWithClaim();
    repo.claimUploadCompletion.mockResolvedValue(baseVideo({ state: 'PENDING_UPLOAD' }));

    await svc.completeUpload('v1' as VideoId);

    expect(repo.finalizeUploadWithJob).toHaveBeenCalledWith(
      expect.objectContaining({ vid: 'v1', transcoderJobName: 'jobs/default' }),
    );
  });
});

describe('VideoService.handleTranscoderEvent', () => {
  function build() {
    const repo = makeRepo();
    const storage = makeStorage();
    const transcoder = { submitJob: vi.fn(), parseEvent: vi.fn(), cancelJob: vi.fn() };
    repo.applyTranscoderResult = vi.fn();
    const svc = new VideoService(repo as never, storage as never, cfg as never, transcoder as never);
    return { svc, repo };
  }

  const successEvent: TranscoderEvent = {
    type: 'JOB_SUCCEEDED',
    jobName: 'jobs/abc',
    videoId: 'v1' as VideoId,
    manifestPath: 'videos/v1/hls/manifest.m3u8',
    durationSec: 120,
  };
  const failEvent: TranscoderEvent = {
    type: 'JOB_FAILED',
    jobName: 'jobs/abc',
    videoId: 'v1' as VideoId,
    reason: 'codec failure',
  };

  it('forwards JOB_SUCCEEDED with READY outcome carrying manifest path + duration + output bucket', async () => {
    const { svc, repo } = build();
    repo.applyTranscoderResult.mockResolvedValue({ acted: true });
    const result = await svc.handleTranscoderEvent(successEvent);
    expect(result).toEqual({ acted: true });
    expect(repo.applyTranscoderResult).toHaveBeenCalledWith(
      expect.objectContaining({
        videoId: 'v1',
        jobName: 'jobs/abc',
        outcome: {
          kind: 'READY',
          manifestPath: 'videos/v1/hls/manifest.m3u8',
          durationSec: 120,
          outputBucket: cfg.outputBucket,
        },
      }),
    );
  });

  it('forwards JOB_FAILED with FAILED outcome carrying reason', async () => {
    const { svc, repo } = build();
    repo.applyTranscoderResult.mockResolvedValue({ acted: true });
    await svc.handleTranscoderEvent(failEvent);
    expect(repo.applyTranscoderResult).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: { kind: 'FAILED', reason: 'codec failure' },
      }),
    );
  });

  it('passes through repo no-op reasons unchanged', async () => {
    const { svc, repo } = build();
    repo.applyTranscoderResult.mockResolvedValue({ acted: false, reason: 'ALREADY_APPLIED' });
    const result = await svc.handleTranscoderEvent(successEvent);
    expect(result).toEqual({ acted: false, reason: 'ALREADY_APPLIED' });
  });
});

describe('VideoService.delete — slice B state widening', () => {
  function build(initialState: Video['state'], extras: Partial<Video> = {}) {
    const repo = makeRepo();
    const storage = makeStorage();
    const transcoder = { submitJob: vi.fn(), parseEvent: vi.fn(), cancelJob: vi.fn(async () => undefined) };
    repo.getVideo.mockResolvedValue(baseVideo({ state: initialState, ...extras }));
    (storage as unknown as { deletePrefix: ReturnType<typeof vi.fn> }).deletePrefix = vi.fn(
      async () => undefined,
    );
    const svc = new VideoService(repo as never, storage as never, cfg as never, transcoder as never);
    return { svc, repo, storage, transcoder };
  }

  it('TRANSCODING: best-effort cancelJob before bucket + repo cleanup', async () => {
    const { svc, transcoder, storage, repo } = build('TRANSCODING', {
      transcoderJobName: 'jobs/abc',
    });
    await svc.delete('v1' as VideoId);
    expect(transcoder.cancelJob).toHaveBeenCalledWith('jobs/abc');
    expect(storage.deleteObject).toHaveBeenCalled();
    expect(repo.deleteVideoAndDetach).toHaveBeenCalled();
  });

  it('TRANSCODING with no transcoderJobName: skips cancelJob', async () => {
    const { svc, transcoder } = build('TRANSCODING', { transcoderJobName: undefined });
    await svc.delete('v1' as VideoId);
    expect(transcoder.cancelJob).not.toHaveBeenCalled();
  });

  it('non-TRANSCODING video with a stale transcoderJobName does NOT cancel (kills the `state === TRANSCODING` -> true operand mutant)', async () => {
    // UPLOADED is deletable; it carries a leftover transcoderJobName. The
    // `v.state === 'TRANSCODING'` operand must gate the cancel: forcing it true
    // would make `true && jobName` enter the block and call cancelJob.
    const { svc, transcoder } = build('UPLOADED', { transcoderJobName: 'jobs/stale' });
    await svc.delete('v1' as VideoId);
    expect(transcoder.cancelJob).not.toHaveBeenCalled();
  });

  it('non-READY video with an output.bucket does NOT delete the prefix (kills the `state === READY` -> true operand mutant)', async () => {
    // UPLOADED with a populated output block. The `v.state === 'READY'` operand
    // must gate the prefix delete: forcing it true would call deletePrefix.
    const { svc, storage } = build('UPLOADED', {
      output: { bucket: 'out', manifestPath: 'videos/v1/hls/manifest.m3u8', durationSec: 60 },
    });
    await svc.delete('v1' as VideoId);
    expect(
      (storage as unknown as { deletePrefix: ReturnType<typeof vi.fn> }).deletePrefix,
    ).not.toHaveBeenCalled();
  });

  it('TRANSCODING: cancelJob failure is swallowed and cleanup proceeds', async () => {
    const { svc, transcoder, repo } = build('TRANSCODING', { transcoderJobName: 'jobs/abc' });
    transcoder.cancelJob.mockRejectedValue(new Error('boom'));
    await expect(svc.delete('v1' as VideoId)).resolves.toBeUndefined();
    expect(repo.deleteVideoAndDetach).toHaveBeenCalled();
  });

  it('READY: deletes output prefix from output bucket best-effort', async () => {
    const { svc, storage, repo } = build('READY', {
      output: { bucket: 'out', manifestPath: 'videos/v1/hls/manifest.m3u8', durationSec: 60 },
    });
    await svc.delete('v1' as VideoId);
    expect((storage as unknown as { deletePrefix: ReturnType<typeof vi.fn> }).deletePrefix).toHaveBeenCalledWith({
      bucket: 'out',
      prefix: 'videos/v1/',
    });
    expect(repo.deleteVideoAndDetach).toHaveBeenCalled();
  });

  it('rejects unknown post-slice-B states', async () => {
    const { svc } = build('UPLOADING' as Video['state']);
    await expect(svc.delete('v1' as VideoId)).rejects.toBeInstanceOf(InvalidVideoStateException);
  });

  it('READY video with no output: skips deletePrefix without throwing', async () => {
    // Pins `v.output?.bucket` optional chaining (and the `&&` short-circuit):
    // a READY video missing its output block must NOT touch deletePrefix and
    // must not throw. Removing the `?.` would dereference undefined and crash.
    const { svc, storage, repo } = build('READY', { output: undefined });
    await expect(svc.delete('v1' as VideoId)).resolves.toBeUndefined();
    expect((storage as unknown as { deletePrefix: ReturnType<typeof vi.fn> }).deletePrefix).not.toHaveBeenCalled();
    expect(repo.deleteVideoAndDetach).toHaveBeenCalled();
  });
});
