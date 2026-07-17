import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type {
  CourseId,
  ISODateString,
  LessonId,
  UserId,
  Video,
  VideoCaptions,
  VideoId,
  VideoKey,
  VideoKeyId,
  VideoState,
} from '@learnwren/shared-data-models';

import {
  InvalidVideoStateException,
  LessonAlreadyHasVideoException,
  UploadCompletionInProgressException,
  VideoNotFoundException,
} from './errors/video.exception';
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

    const found = await repo.getVideoByLesson('l2' as LessonId);
    // Non-null + exact id pins the `.where('lessonId', '==', lid)` field: a
    // mutated field name ('') would match no document and return null here.
    expect(found).not.toBeNull();
    expect(found!.id).toBe('v2');
    expect(found!.lessonId).toBe('l2');
    expect(await repo.getVideoByLesson('l-none' as LessonId)).toBeNull();
  });

  it('getVideoByLesson prefers the live (non-FAILED) doc when a retry left a FAILED sibling', async () => {
    // Retry flow: a FAILED doc and a fresh session's doc share the lessonId.
    // limit(1) with no ordering was nondeterministic; reads must pick the live doc.
    const fake = createFakeFirestore({
      'videos/v-failed': makeVideo({
        id: 'v-failed' as VideoId,
        state: 'FAILED',
        createdAt: '2026-05-13T00:00:00.000Z' as ISODateString,
      }),
      'videos/v-live': makeVideo({
        id: 'v-live' as VideoId,
        state: 'TRANSCODING',
        createdAt: '2026-05-12T00:00:00.000Z' as ISODateString,
      }),
    });
    const repo = await buildRepo(fake);

    const found = await repo.getVideoByLesson('l1' as LessonId);
    expect(found!.id).toBe('v-live');
  });

  it('getVideoByLesson picks the newest doc when all candidates share a state', async () => {
    const fake = createFakeFirestore({
      'videos/v-old': makeVideo({
        id: 'v-old' as VideoId,
        state: 'FAILED',
        createdAt: '2026-05-11T00:00:00.000Z' as ISODateString,
      }),
      'videos/v-new': makeVideo({
        id: 'v-new' as VideoId,
        state: 'FAILED',
        createdAt: '2026-05-12T00:00:00.000Z' as ISODateString,
      }),
    });
    const repo = await buildRepo(fake);

    const found = await repo.getVideoByLesson('l1' as LessonId);
    expect(found!.id).toBe('v-new');
  });

  it('listVideosByLesson returns ALL docs for the lesson (cascade must tear down every one)', async () => {
    const fake = createFakeFirestore({
      'videos/v1': makeVideo({ id: 'v1' as VideoId, state: 'FAILED' }),
      'videos/v2': makeVideo({ id: 'v2' as VideoId, state: 'PENDING_UPLOAD' }),
      'videos/v-other': makeVideo({ id: 'v-other' as VideoId, lessonId: 'l9' as LessonId }),
    });
    const repo = await buildRepo(fake);

    const all = await repo.listVideosByLesson('l1' as LessonId);
    expect(all.map((v) => v.id).sort()).toEqual(['v1', 'v2']);
    expect(await repo.listVideosByLesson('l-none' as LessonId)).toEqual([]);
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
    probedDurationSec: 42,
    key: {
      id: 'k1' as VideoKeyId,
      bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
    },
    transcoderJobName: JOB_NAME,
    nowIso: NOW_ISO,
  };

  it('moves the video to TRANSCODING, writes the key, and links the lesson', async () => {
    const fake = createFakeFirestore({
      // PENDING_UPLOAD is the real pre-finalize state (completeUpload validates
      // it and never transitions away before finalizing).
      'videos/v1': makeVideo(),
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

  it('links exactly the lesson whose id matches, not a sibling lesson', async () => {
    // Pins the lessonByIdQuery `.where('id', '==', lid)` field literal: two
    // lessons live under the same collection group; finalize for l1 must link
    // l1's doc and leave l2 untouched. Mutating the field to '' would match
    // neither (both have a non-empty id) and throw "Lesson disappeared".
    const OTHER_LESSON = 'courses/c1/modules/m1/lessons/l2';
    const fake = createFakeFirestore({
      'videos/v1': makeVideo(),
      [LESSON_PATH]: lessonDoc({ id: 'l1' }),
      [OTHER_LESSON]: lessonDoc({ id: 'l2' }),
    });
    const repo = await buildRepo(fake);

    await repo.finalizeUploadWithJob(finalizeArgs);

    expect((fake.__store.get(LESSON_PATH) as { videoId?: string }).videoId).toBe('v1');
    expect('videoId' in (fake.__store.get(OTHER_LESSON) as object)).toBe(false);
  });

  it('persists the probed source duration on Video.source for later READY output', async () => {
    const fake = createFakeFirestore({
      'videos/v1': makeVideo(),
      [LESSON_PATH]: lessonDoc(),
    });
    const repo = await buildRepo(fake);

    await repo.finalizeUploadWithJob({ ...finalizeArgs, probedDurationSec: 99 });

    expect((fake.__store.get('videos/v1') as Video).source.probedDurationSec).toBe(99);
  });

  it('throws when the video disappeared before the transaction ran', async () => {
    const fake = createFakeFirestore({ [LESSON_PATH]: lessonDoc() });
    const repo = await buildRepo(fake);

    await expect(repo.finalizeUploadWithJob(finalizeArgs)).rejects.toThrow(
      'Video disappeared in transaction.',
    );
  });

  it('throws when the lesson disappeared before the transaction ran', async () => {
    const fake = createFakeFirestore({ 'videos/v1': makeVideo() });
    const repo = await buildRepo(fake);

    await expect(repo.finalizeUploadWithJob(finalizeArgs)).rejects.toThrow(
      'Lesson disappeared in transaction.',
    );
  });

  it('rejects a second finalize once the video has left PENDING_UPLOAD, preserving the first job name', async () => {
    // Concurrency guard for the double-submit race: two overlapping
    // completeUpload calls both pass the non-transactional PENDING_UPLOAD
    // pre-check and submit their own transcoder jobs. The first finalize wins
    // (TRANSCODING + job-A); the second must NOT overwrite transcoderJobName
    // with job-B (which would orphan job-A) — it must throw a 409 instead.
    const fake = createFakeFirestore({
      'videos/v1': makeVideo({ state: 'TRANSCODING', transcoderJobName: 'job-A' }),
      [LESSON_PATH]: lessonDoc(),
    });
    const repo = await buildRepo(fake);

    await expect(
      repo.finalizeUploadWithJob({ ...finalizeArgs, transcoderJobName: 'job-B' }),
    ).rejects.toBeInstanceOf(InvalidVideoStateException);

    // The first job's name survives — the loser did not corrupt the record.
    expect((fake.__store.get('videos/v1') as Video).transcoderJobName).toBe('job-A');
  });

  it('rejects with 409 when the lesson already points at a DIFFERENT video (double-finalize race)', async () => {
    // Two concurrent upload SESSIONS create two video docs for one lesson; each
    // is PENDING_UPLOAD so the state guard alone cannot stop the loser from
    // overwriting Lesson.videoId and orphaning the winner's video forever.
    const fake = createFakeFirestore({
      'videos/v1': makeVideo(),
      [LESSON_PATH]: lessonDoc({ videoId: 'v-winner' }),
    });
    const repo = await buildRepo(fake);

    await expect(repo.finalizeUploadWithJob(finalizeArgs)).rejects.toBeInstanceOf(
      LessonAlreadyHasVideoException,
    );

    // The winner's link survives; the loser's doc was not transitioned.
    expect((fake.__store.get(LESSON_PATH) as { videoId?: string }).videoId).toBe('v-winner');
    expect((fake.__store.get('videos/v1') as Video).state).toBe('PENDING_UPLOAD');
    expect(fake.__store.has('videoKeys/k1')).toBe(false);
  });

  it('still finalizes when the lesson already points at THIS video', async () => {
    const fake = createFakeFirestore({
      'videos/v1': makeVideo(),
      [LESSON_PATH]: lessonDoc({ videoId: 'v1' }),
    });
    const repo = await buildRepo(fake);

    const result = await repo.finalizeUploadWithJob(finalizeArgs);
    expect(result.state).toBe('TRANSCODING');
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

  it('uses the probed source duration for output when the transcoder duration is 0 (real-GCP case)', async () => {
    // The GCP Transcoder job returns no reliable output duration, so the event
    // carries 0; the authoritative duration is the ffprobe value persisted on
    // the source at upload-complete time.
    const fake = createFakeFirestore({
      'videos/v1': makeVideo({
        state: 'TRANSCODING',
        transcoderJobName: JOB_NAME,
        source: { bucket: 'src-bucket', path: 'uploads/v1', probedDurationSec: 77 },
      }),
    });
    const repo = await buildRepo(fake);

    await repo.applyTranscoderResult({
      videoId: 'v1' as VideoId,
      jobName: JOB_NAME,
      outcome: { ...readyOutcome, durationSec: 0 },
      nowIso: NOW_ISO,
    });

    expect((fake.__store.get('videos/v1') as Video).output?.durationSec).toBe(77);
  });

  it('prefers the probed source duration over a non-zero transcoder duration', async () => {
    const fake = createFakeFirestore({
      'videos/v1': makeVideo({
        state: 'TRANSCODING',
        transcoderJobName: JOB_NAME,
        source: { bucket: 'src-bucket', path: 'uploads/v1', probedDurationSec: 55 },
      }),
    });
    const repo = await buildRepo(fake);

    await repo.applyTranscoderResult({
      videoId: 'v1' as VideoId,
      jobName: JOB_NAME,
      outcome: { ...readyOutcome, durationSec: 60 },
      nowIso: NOW_ISO,
    });

    expect((fake.__store.get('videos/v1') as Video).output?.durationSec).toBe(55);
  });

  it('reports ALREADY_APPLIED for a FAILED outcome when the video is already FAILED', async () => {
    // Pins the targetState ternary for the non-READY branch: with the outcome
    // already applied (state FAILED), targetState must equal 'FAILED' so the
    // already-applied short-circuit fires. Forcing the ternary to 'READY' (or
    // '') would skip it and mis-report WRONG_STATE.
    const fake = createFakeFirestore({
      'videos/v1': makeVideo({ state: 'FAILED', transcoderJobName: JOB_NAME }),
    });
    const repo = await buildRepo(fake);

    expect(
      await repo.applyTranscoderResult({
        videoId: 'v1' as VideoId,
        jobName: JOB_NAME,
        outcome: { kind: 'FAILED', reason: 'codec unsupported' },
        nowIso: NOW_ISO,
      }),
    ).toEqual({ acted: false, reason: 'ALREADY_APPLIED' });
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

  it('deletes only the key whose videoId matches, leaving other keys intact', async () => {
    // Pins the videoKeys `.where('videoId', '==', vid)` field literal: only the
    // key tagged with v1 must be removed; a key for another video must survive.
    // A mutated field name would match neither and delete no key at all.
    const fake = createFakeFirestore({
      'videos/v1': makeVideo(),
      'videoKeys/k1': { id: 'k1', videoId: 'v1', key: 'x', createdAt: SEED_DATE },
      'videoKeys/k-other': { id: 'k-other', videoId: 'v-other', key: 'y', createdAt: SEED_DATE },
      [LESSON_PATH]: lessonDoc({ videoId: 'v1' }),
    });
    const repo = await buildRepo(fake);

    await repo.deleteVideoAndDetach('v1' as VideoId, 'l1' as LessonId, NOW_ISO);

    expect(fake.__store.has('videoKeys/k1')).toBe(false);
    expect(fake.__store.has('videoKeys/k-other')).toBe(true);
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
      'videos/v2': makeVideo({ id: 'v2' as VideoId, lessonId: 'l2' as LessonId, state: 'TRANSCODING' as VideoState }),
    });
    const repo = await buildRepo(fake);

    const states = await repo.listVideoStatesForLessons([
      'l1' as LessonId,
      'l2' as LessonId,
      'l3' as LessonId,
    ]);

    expect(states.get('l1' as LessonId)).toBe('READY');
    expect(states.get('l2' as LessonId)).toBe('TRANSCODING');
    expect(states.get('l3' as LessonId) ?? null).toBeNull();
  });

  it('listVideoStatesForLessons returns an empty Map for an empty input', async () => {
    const fake = createFakeFirestore();
    const repo = await buildRepo(fake);

    const states = await repo.listVideoStatesForLessons([]);

    expect(states.size).toBe(0);
  });
});

describe('VideoRepository.listVideosForLessons', () => {
  it('returns a Map with full Video docs keyed by lessonId, absent for lessons with no video', async () => {
    const fake = createFakeFirestore({
      'videos/v1': makeVideo({
        id: 'v1' as VideoId,
        lessonId: 'lesson-1' as LessonId,
        state: 'READY' as VideoState,
        output: { bucket: 'out-bucket', manifestPath: 'out/v1/manifest.m3u8', durationSec: 180 },
      }),
      'videos/v2': makeVideo({
        id: 'v2' as VideoId,
        lessonId: 'lesson-2' as LessonId,
        state: 'TRANSCODING' as VideoState,
      }),
    });
    const repo = await buildRepo(fake);

    const map = await repo.listVideosForLessons([
      'lesson-1' as LessonId,
      'lesson-2' as LessonId,
      'lesson-3' as LessonId,
    ]);

    expect(map.get('lesson-1' as LessonId)?.id).toBe('v1');
    expect(map.get('lesson-1' as LessonId)?.output?.durationSec).toBe(180);
    expect(map.get('lesson-2' as LessonId)?.state).toBe('TRANSCODING');
    expect(map.has('lesson-3' as LessonId)).toBe(false);
  });

  it('returns an empty Map for an empty input', async () => {
    const fake = createFakeFirestore();
    const repo = await buildRepo(fake);

    const map = await repo.listVideosForLessons([]);

    expect(map.size).toBe(0);
  });
});

function makeCaptions(overrides: Partial<VideoCaptions> = {}): VideoCaptions {
  return {
    videoId: 'v1' as VideoId,
    language: 'en',
    label: 'English',
    format: 'vtt',
    content: 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n',
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
    ...overrides,
  };
}

describe('VideoRepository — captions', () => {
  it('upsertCaptions then getCaptions round-trips', async () => {
    const fake = createFakeFirestore({ 'videos/v1': makeVideo() });
    const repo = await buildRepo(fake);
    await repo.upsertCaptions(makeCaptions());
    const got = await repo.getCaptions('v1' as VideoId);
    expect(got?.content).toContain('WEBVTT');
    expect(got?.language).toBe('en');
  });

  it('upsertCaptions throws VIDEO_NOT_FOUND and writes nothing when the video doc is gone', async () => {
    // Captions PUT racing a video delete: the old non-transactional
    // read-then-set recreated an orphan videoCaptions doc that no endpoint
    // could ever reach (every captions route resolves the video first).
    const fake = createFakeFirestore();
    const repo = await buildRepo(fake);
    await expect(repo.upsertCaptions(makeCaptions())).rejects.toBeInstanceOf(
      VideoNotFoundException,
    );
    expect(fake.__store.has('videoCaptions/v1')).toBe(false);
  });

  it('upsertCaptions preserves the original createdAt when replacing existing captions', async () => {
    const OLD = '2026-01-01T00:00:00.000Z' as ISODateString;
    const fake = createFakeFirestore({
      'videos/v1': makeVideo(),
      'videoCaptions/v1': makeCaptions({ createdAt: OLD }),
    });
    const repo = await buildRepo(fake);
    await repo.upsertCaptions(
      makeCaptions({ createdAt: NOW_ISO as ISODateString, updatedAt: NOW_ISO as ISODateString }),
    );
    const stored = fake.__store.get('videoCaptions/v1') as VideoCaptions;
    expect(stored.createdAt).toBe(OLD);
    expect(stored.updatedAt).toBe(NOW_ISO);
  });

  it('getCaptions returns null when absent', async () => {
    const repo = await buildRepo(createFakeFirestore());
    expect(await repo.getCaptions('nope' as VideoId)).toBeNull();
  });

  it('getCaptionsMeta returns null when no captions exist', async () => {
    // Pins the `if (!captions) return null` guard: forcing it false would
    // dereference null and throw instead of returning null.
    const repo = await buildRepo(createFakeFirestore());
    expect(await repo.getCaptionsMeta('nope' as VideoId)).toBeNull();
  });

  it('getCaptionsMeta omits the content body', async () => {
    const fake = createFakeFirestore({ 'videoCaptions/v1': makeCaptions() });
    const repo = await buildRepo(fake);
    const meta = await repo.getCaptionsMeta('v1' as VideoId);
    expect(meta).toEqual({ language: 'en', label: 'English', updatedAt: SEED_DATE });
  });

  it('deleteCaptions removes the doc and is idempotent', async () => {
    const fake = createFakeFirestore({ 'videoCaptions/v1': makeCaptions() });
    const repo = await buildRepo(fake);
    await repo.deleteCaptions('v1' as VideoId);
    expect(await repo.getCaptions('v1' as VideoId)).toBeNull();
    await expect(repo.deleteCaptions('v1' as VideoId)).resolves.toBeUndefined();
  });

  it('deleteVideoAndDetach also removes the captions doc', async () => {
    const fake = createFakeFirestore({
      'videos/v1': makeVideo(),
      [LESSON_PATH]: lessonDoc({ videoId: 'v1' }),
      'videoCaptions/v1': makeCaptions(),
    });
    const repo = await buildRepo(fake);
    await repo.deleteVideoAndDetach('v1' as VideoId, 'l1' as LessonId, NOW_ISO);
    expect(await repo.getCaptions('v1' as VideoId)).toBeNull();
  });
});

const STALE_BEFORE = '2026-05-21T11:00:00.000Z'; // 1 hour before NOW_ISO
const FRESH_CLAIM_AT = '2026-05-21T11:30:00.000Z'; // within TTL window (after staleBefore)
const STALE_CLAIM_AT = '2026-05-21T10:00:00.000Z'; // before staleBefore → stale

describe('VideoRepository.claimUploadCompletion', () => {
  it('writes completeClaimedAt + updatedAt and returns the video on success', async () => {
    const fake = createFakeFirestore({ 'videos/v1': makeVideo() });
    const repo = await buildRepo(fake);

    const result = await repo.claimUploadCompletion('v1' as VideoId, NOW_ISO as ISODateString, STALE_BEFORE as ISODateString);

    expect(result.id).toBe('v1');
    expect(result.state).toBe('PENDING_UPLOAD');
    const stored = fake.__store.get('videos/v1') as Video;
    expect(stored.completeClaimedAt).toBe(NOW_ISO);
    expect(stored.updatedAt).toBe(NOW_ISO);
  });

  it('throws VideoNotFoundException when the video does not exist', async () => {
    const fake = createFakeFirestore();
    const repo = await buildRepo(fake);

    await expect(
      repo.claimUploadCompletion('v-missing' as VideoId, NOW_ISO as ISODateString, STALE_BEFORE as ISODateString),
    ).rejects.toBeInstanceOf(VideoNotFoundException);
  });

  it('throws InvalidVideoStateException when the video is not PENDING_UPLOAD', async () => {
    const fake = createFakeFirestore({ 'videos/v1': makeVideo({ state: 'TRANSCODING' }) });
    const repo = await buildRepo(fake);

    await expect(
      repo.claimUploadCompletion('v1' as VideoId, NOW_ISO as ISODateString, STALE_BEFORE as ISODateString),
    ).rejects.toBeInstanceOf(InvalidVideoStateException);
  });

  it('throws UploadCompletionInProgressException when a FRESH claim already exists', async () => {
    // A claim stamped after staleBefore belongs to a live concurrent attempt.
    const fake = createFakeFirestore({
      'videos/v1': makeVideo({ completeClaimedAt: FRESH_CLAIM_AT as ISODateString }),
    });
    const repo = await buildRepo(fake);

    await expect(
      repo.claimUploadCompletion('v1' as VideoId, NOW_ISO as ISODateString, STALE_BEFORE as ISODateString),
    ).rejects.toBeInstanceOf(UploadCompletionInProgressException);
  });

  it('treats a claim stamped exactly at staleBefore as still fresh (boundary, >=)', async () => {
    // Boundary for `completeClaimedAt >= staleBefore`: a claim at exactly the
    // cutoff is INCLUSIVE-fresh and must block. The `>` mutant would treat the
    // boundary as stale and wrongly re-claim.
    const fake = createFakeFirestore({
      'videos/v1': makeVideo({ completeClaimedAt: STALE_BEFORE as ISODateString }),
    });
    const repo = await buildRepo(fake);

    await expect(
      repo.claimUploadCompletion('v1' as VideoId, NOW_ISO as ISODateString, STALE_BEFORE as ISODateString),
    ).rejects.toBeInstanceOf(UploadCompletionInProgressException);
  });

  it('re-claims successfully when an existing claim is STALE (crashed attempt)', async () => {
    // A claim stamped before staleBefore belongs to a crashed attempt; re-claim.
    const fake = createFakeFirestore({
      'videos/v1': makeVideo({ completeClaimedAt: STALE_CLAIM_AT as ISODateString }),
    });
    const repo = await buildRepo(fake);

    const result = await repo.claimUploadCompletion('v1' as VideoId, NOW_ISO as ISODateString, STALE_BEFORE as ISODateString);

    expect(result.completeClaimedAt).toBe(NOW_ISO);
    expect((fake.__store.get('videos/v1') as Video).completeClaimedAt).toBe(NOW_ISO);
  });
});

describe('VideoRepository.releaseUploadCompletionClaim', () => {
  it('clears completeClaimedAt via FieldValue.delete()', async () => {
    const fake = createFakeFirestore({
      'videos/v1': makeVideo({ completeClaimedAt: NOW_ISO as ISODateString }),
    });
    const repo = await buildRepo(fake);

    await repo.releaseUploadCompletionClaim('v1' as VideoId);

    expect('completeClaimedAt' in (fake.__store.get('videos/v1') as object)).toBe(false);
  });
});

describe('VideoRepository.finalizeUploadWithJob — clears completeClaimedAt', () => {
  it('clears completeClaimedAt in the transaction alongside the TRANSCODING write', async () => {
    const fake = createFakeFirestore({
      'videos/v1': makeVideo({ completeClaimedAt: NOW_ISO as ISODateString }),
      [LESSON_PATH]: lessonDoc(),
    });
    const repo = await buildRepo(fake);

    const result = await repo.finalizeUploadWithJob({
      vid: 'v1' as VideoId,
      lid: 'l1' as LessonId,
      actualSizeBytes: 5000,
      probedDurationSec: 42,
      key: {
        id: 'k1' as VideoKeyId,
        bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
      },
      transcoderJobName: JOB_NAME,
      nowIso: NOW_ISO,
    });

    expect(result.state).toBe('TRANSCODING');
    // The claim stamp must be absent on the returned value and in the store.
    expect('completeClaimedAt' in result).toBe(false);
    expect('completeClaimedAt' in (fake.__store.get('videos/v1') as object)).toBe(false);
  });
});

describe('VideoRepository.countPendingTranscodes', () => {
  // The fake Firestore in-memory store has no aggregate .count() support, so
  // this pins the query shape (collection/where/count/get) with a direct mock
  // rather than createFakeFirestore — matching the constructor's single
  // @Inject(FIRESTORE) param, no NestJS Test module needed.
  it('counts videos in UPLOADED or TRANSCODING via an aggregate query', async () => {
    const get = vi.fn().mockResolvedValue({ data: () => ({ count: 3 }) });
    const count = vi.fn().mockReturnValue({ get });
    const where = vi.fn().mockReturnValue({ count });
    const collection = vi.fn().mockReturnValue({ where });
    const repo = new VideoRepository({ collection } as never);

    await expect(repo.countPendingTranscodes()).resolves.toBe(3);
    expect(collection).toHaveBeenCalledWith('videos');
    expect(where).toHaveBeenCalledWith('state', 'in', ['UPLOADED', 'TRANSCODING']);
  });
});
