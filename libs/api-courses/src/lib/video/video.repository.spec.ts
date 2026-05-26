import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type {
  CourseId,
  ISODateString,
  LessonId,
  UserId,
  Video,
  VideoId,
  VideoKey,
  VideoKeyId,
  VideoState,
} from '@learnwren/shared-data-models';

import { VideoRepository } from './video.repository';
import { createFakeFirestore, type FakeFirestore } from '../testing/fake-firestore';

const SEED_DATE = '2026-05-12T00:00:00.000Z' as ISODateString;
const NOW_ISO = '2026-05-21T12:00:00.000Z';
const JOB_NAME = 'projects/p/locations/l/jobs/job-1';
const LESSON_PATH = 'courses/c1/modules/m1/lessons/l1';

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'v1' as VideoId,
    ownerInstructorId: 'uid-1' as UserId,
    courseId: 'c1' as CourseId,
    lessonId: 'l1' as LessonId,
    state: 'PENDING_UPLOAD',
    source: { bucket: 'src-bucket', path: 'uploads/v1' },
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
    ...overrides,
  };
}

function lessonDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'l1',
    moduleId: 'm1',
    title: 'Lesson 1',
    order: 0,
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
    ...overrides,
  };
}

async function buildRepo(fake: FakeFirestore): Promise<VideoRepository> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      VideoRepository,
      { provide: FIRESTORE, useValue: fake as unknown as FirestoreHandle },
    ],
  }).compile();
  return moduleRef.get(VideoRepository);
}

describe('VideoRepository — simple reads and writes', () => {
  it('newId returns a non-empty, non-colliding string', async () => {
    const fake = createFakeFirestore();
    const repo = await buildRepo(fake);

    const a = repo.newId<VideoId>();
    const b = repo.newId<VideoId>();

    expect(a).toMatch(/.+/);
    expect(a).not.toBe(b);
  });

  it('getVideo returns the stored video, or null when absent', async () => {
    const fake = createFakeFirestore({ 'videos/v1': makeVideo() });
    const repo = await buildRepo(fake);

    expect(await repo.getVideo('v1' as VideoId)).toEqual(makeVideo());
    expect(await repo.getVideo('v-missing' as VideoId)).toBeNull();
  });

  it('getVideoByLesson finds the video whose lessonId matches', async () => {
    const fake = createFakeFirestore({
      'videos/v1': makeVideo({ id: 'v1' as VideoId, lessonId: 'l1' as LessonId }),
      'videos/v2': makeVideo({ id: 'v2' as VideoId, lessonId: 'l2' as LessonId }),
    });
    const repo = await buildRepo(fake);

    expect((await repo.getVideoByLesson('l2' as LessonId))?.id).toBe('v2');
    expect(await repo.getVideoByLesson('l-none' as LessonId)).toBeNull();
  });

  it('getVideoKey returns the stored key, or null when absent', async () => {
    const key: VideoKey = {
      id: 'k1' as VideoKeyId,
      videoId: 'v1' as VideoId,
      key: 'AAAAAAAAAAAAAAAAAAAAAA==',
      createdAt: SEED_DATE,
    };
    const fake = createFakeFirestore({ 'videoKeys/k1': { ...key } });
    const repo = await buildRepo(fake);

    expect(await repo.getVideoKey('k1' as VideoKeyId)).toEqual(key);
    expect(await repo.getVideoKey('k-missing' as VideoKeyId)).toBeNull();
  });

  it('createVideo writes the video at videos/{id}', async () => {
    const fake = createFakeFirestore();
    const repo = await buildRepo(fake);
    const video = makeVideo();

    await repo.createVideo(video);

    expect(fake.__store.get('videos/v1')).toEqual(video);
  });

  it('updateVideo merges the patch into the existing document', async () => {
    const fake = createFakeFirestore({ 'videos/v1': makeVideo() });
    const repo = await buildRepo(fake);

    await repo.updateVideo('v1' as VideoId, { state: 'UPLOADED' });

    const stored = fake.__store.get('videos/v1') as Video;
    expect(stored.state).toBe('UPLOADED');
    expect(stored.source).toEqual({ bucket: 'src-bucket', path: 'uploads/v1' }); // untouched
  });
});

describe('VideoRepository.finalizeUploadWithJob', () => {
  const finalizeArgs = {
    vid: 'v1' as VideoId,
    lid: 'l1' as LessonId,
    actualSizeBytes: 5000,
    key: {
      id: 'k1' as VideoKeyId,
      bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
    },
    transcoderJobName: JOB_NAME,
    nowIso: NOW_ISO,
  };

  it('moves the video to TRANSCODING, writes the key, and links the lesson', async () => {
    const fake = createFakeFirestore({
      'videos/v1': makeVideo({ state: 'UPLOADED' }),
      [LESSON_PATH]: lessonDoc(),
    });
    const repo = await buildRepo(fake);

    const result = await repo.finalizeUploadWithJob(finalizeArgs);

    expect(result.state).toBe('TRANSCODING');
    expect(result.keyId).toBe('k1');
    expect(result.transcoderJobName).toBe(JOB_NAME);
    expect(result.source.sizeBytes).toBe(5000);
    expect(result.updatedAt).toBe(NOW_ISO);

    // Key document is written with the bytes base64-encoded.
    const storedKey = fake.__store.get('videoKeys/k1') as VideoKey;
    expect(storedKey.key).toBe(Buffer.from(finalizeArgs.key.bytes).toString('base64'));
    expect(storedKey.videoId).toBe('v1');

    // Lesson now points back at the video.
    expect((fake.__store.get(LESSON_PATH) as { videoId?: string }).videoId).toBe('v1');
  });

  it('throws when the video disappeared before the transaction ran', async () => {
    const fake = createFakeFirestore({ [LESSON_PATH]: lessonDoc() });
    const repo = await buildRepo(fake);

    await expect(repo.finalizeUploadWithJob(finalizeArgs)).rejects.toThrow(
      'Video disappeared in transaction.',
    );
  });

  it('throws when the lesson disappeared before the transaction ran', async () => {
    const fake = createFakeFirestore({ 'videos/v1': makeVideo({ state: 'UPLOADED' }) });
    const repo = await buildRepo(fake);

    await expect(repo.finalizeUploadWithJob(finalizeArgs)).rejects.toThrow(
      'Lesson disappeared in transaction.',
    );
  });
});

describe('VideoRepository.markFailedFromSubmission', () => {
  const failArgs = {
    vid: 'v1' as VideoId,
    failureReason: 'Upload size mismatch.',
    actualSizeBytes: 4096,
    nowIso: NOW_ISO,
  };

  it('moves the video to FAILED and records the reason and actual size', async () => {
    const fake = createFakeFirestore({ 'videos/v1': makeVideo({ state: 'UPLOADED' }) });
    const repo = await buildRepo(fake);

    const result = await repo.markFailedFromSubmission(failArgs);

    expect(result.state).toBe('FAILED');
    expect(result.failureReason).toBe('Upload size mismatch.');
    expect(result.source.sizeBytes).toBe(4096);
    expect((fake.__store.get('videos/v1') as Video).state).toBe('FAILED');
  });

  it('throws when the video does not exist', async () => {
    const fake = createFakeFirestore();
    const repo = await buildRepo(fake);

    await expect(repo.markFailedFromSubmission(failArgs)).rejects.toThrow(
      'Video disappeared in transaction.',
    );
  });
});

describe('VideoRepository.applyTranscoderResult', () => {
  const readyOutcome = {
    kind: 'READY' as const,
    manifestPath: 'out/v1/manifest.m3u8',
    durationSec: 123,
    outputBucket: 'out-bucket',
  };

  it('reports VIDEO_NOT_FOUND when the video is absent', async () => {
    const fake = createFakeFirestore();
    const repo = await buildRepo(fake);

    expect(
      await repo.applyTranscoderResult({
        videoId: 'v1' as VideoId,
        jobName: JOB_NAME,
        outcome: readyOutcome,
        nowIso: NOW_ISO,
      }),
    ).toEqual({ acted: false, reason: 'VIDEO_NOT_FOUND' });
  });

  it('reports JOB_NAME_MISMATCH when the stored job name differs', async () => {
    const fake = createFakeFirestore({
      'videos/v1': makeVideo({ state: 'TRANSCODING', transcoderJobName: 'a-different-job' }),
    });
    const repo = await buildRepo(fake);

    expect(
      await repo.applyTranscoderResult({
        videoId: 'v1' as VideoId,
        jobName: JOB_NAME,
        outcome: readyOutcome,
        nowIso: NOW_ISO,
      }),
    ).toEqual({ acted: false, reason: 'JOB_NAME_MISMATCH' });
  });

  it('reports ALREADY_APPLIED when the video is already in the target state', async () => {
    const fake = createFakeFirestore({
      'videos/v1': makeVideo({ state: 'READY', transcoderJobName: JOB_NAME }),
    });
    const repo = await buildRepo(fake);

    expect(
      await repo.applyTranscoderResult({
        videoId: 'v1' as VideoId,
        jobName: JOB_NAME,
        outcome: readyOutcome,
        nowIso: NOW_ISO,
      }),
    ).toEqual({ acted: false, reason: 'ALREADY_APPLIED' });
  });

  it('reports WRONG_STATE when the video is neither TRANSCODING nor the target state', async () => {
    const fake = createFakeFirestore({
      'videos/v1': makeVideo({ state: 'UPLOADED', transcoderJobName: JOB_NAME }),
    });
    const repo = await buildRepo(fake);

    expect(
      await repo.applyTranscoderResult({
        videoId: 'v1' as VideoId,
        jobName: JOB_NAME,
        outcome: readyOutcome,
        nowIso: NOW_ISO,
      }),
    ).toEqual({ acted: false, reason: 'WRONG_STATE' });
  });

  it('applies a READY outcome: state READY with the transcoder output', async () => {
    const fake = createFakeFirestore({
      'videos/v1': makeVideo({ state: 'TRANSCODING', transcoderJobName: JOB_NAME }),
    });
    const repo = await buildRepo(fake);

    const result = await repo.applyTranscoderResult({
      videoId: 'v1' as VideoId,
      jobName: JOB_NAME,
      outcome: readyOutcome,
      nowIso: NOW_ISO,
    });

    expect(result).toEqual({ acted: true });
    const stored = fake.__store.get('videos/v1') as Video;
    expect(stored.state).toBe('READY');
    expect(stored.output).toEqual({
      bucket: 'out-bucket',
      manifestPath: 'out/v1/manifest.m3u8',
      durationSec: 123,
    });
    expect(stored.updatedAt).toBe(NOW_ISO);
  });

  it('applies a FAILED outcome: state FAILED with a prefixed failure reason', async () => {
    const fake = createFakeFirestore({
      'videos/v1': makeVideo({ state: 'TRANSCODING', transcoderJobName: JOB_NAME }),
    });
    const repo = await buildRepo(fake);

    const result = await repo.applyTranscoderResult({
      videoId: 'v1' as VideoId,
      jobName: JOB_NAME,
      outcome: { kind: 'FAILED', reason: 'codec unsupported' },
      nowIso: NOW_ISO,
    });

    expect(result).toEqual({ acted: true });
    const stored = fake.__store.get('videos/v1') as Video;
    expect(stored.state).toBe('FAILED');
    expect(stored.failureReason).toBe('TRANSCODE_FAILED: codec unsupported');
  });
});

describe('VideoRepository.deleteVideoAndDetach', () => {
  it('deletes the video, deletes the key, and clears the lesson link', async () => {
    const fake = createFakeFirestore({
      'videos/v1': makeVideo(),
      'videoKeys/k1': { id: 'k1', videoId: 'v1', key: 'x', createdAt: SEED_DATE },
      [LESSON_PATH]: lessonDoc({ videoId: 'v1' }),
    });
    const repo = await buildRepo(fake);

    await repo.deleteVideoAndDetach('v1' as VideoId, 'l1' as LessonId, NOW_ISO);

    expect(fake.__store.has('videos/v1')).toBe(false);
    expect(fake.__store.has('videoKeys/k1')).toBe(false);
    expect('videoId' in (fake.__store.get(LESSON_PATH) as object)).toBe(false);
    expect((fake.__store.get(LESSON_PATH) as { updatedAt: string }).updatedAt).toBe(NOW_ISO);
  });

  it('leaves the lesson link intact when it points at a different video', async () => {
    const fake = createFakeFirestore({
      'videos/v1': makeVideo(),
      [LESSON_PATH]: lessonDoc({ videoId: 'v-other' }),
    });
    const repo = await buildRepo(fake);

    await repo.deleteVideoAndDetach('v1' as VideoId, 'l1' as LessonId, NOW_ISO);

    expect(fake.__store.has('videos/v1')).toBe(false);
    // The lesson is owned by another video — its link must not be touched.
    expect((fake.__store.get(LESSON_PATH) as { videoId?: string }).videoId).toBe('v-other');
  });

  it('succeeds when no key and no lesson exist', async () => {
    const fake = createFakeFirestore({ 'videos/v1': makeVideo() });
    const repo = await buildRepo(fake);

    await expect(
      repo.deleteVideoAndDetach('v1' as VideoId, 'l1' as LessonId, NOW_ISO),
    ).resolves.toBeUndefined();
    expect(fake.__store.has('videos/v1')).toBe(false);
  });
});

describe('VideoRepository.listVideoStatesForLessons', () => {
  it('listVideoStatesForLessons returns a Map keyed by lessonId with the latest VideoState for each', async () => {
    const fake = createFakeFirestore({
      'videos/v1': makeVideo({ id: 'v1' as VideoId, lessonId: 'l1' as LessonId, state: 'READY' as VideoState }),
      'videos/v2': makeVideo({ id: 'v2' as VideoId, lessonId: 'l2' as LessonId, state: 'PROCESSING' as VideoState }),
    });
    const repo = await buildRepo(fake);

    const states = await repo.listVideoStatesForLessons([
      'l1' as LessonId,
      'l2' as LessonId,
      'l3' as LessonId,
    ]);

    expect(states.get('l1' as LessonId)).toBe('READY');
    expect(states.get('l2' as LessonId)).toBe('PROCESSING');
    expect(states.get('l3' as LessonId) ?? null).toBeNull();
  });

  it('listVideoStatesForLessons returns an empty Map for an empty input', async () => {
    const fake = createFakeFirestore();
    const repo = await buildRepo(fake);

    const states = await repo.listVideoStatesForLessons([]);

    expect(states.size).toBe(0);
  });
});
