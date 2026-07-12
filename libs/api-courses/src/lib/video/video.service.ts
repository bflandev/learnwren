import { randomBytes } from 'node:crypto';

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { nowIso } from '@learnwren/shared-data-models';
import type {
  CourseId,
  ISODateString,
  LessonId,
  SupportedVideoContentType,
  UserId,
  Video,
  VideoId,
  VideoKeyId,
} from '@learnwren/shared-data-models';

import { VIDEO_CONFIG, type VideoConfig } from './video.config';
import {
  InvalidVideoStateException,
  LessonAlreadyHasVideoException,
  UploadObjectMissingException,
  UploadObjectSizeMismatchException,
  VideoNotFoundException,
} from './errors/video.exception';
import {
  VIDEO_TRANSCODER,
  type TranscoderEvent,
  type VideoTranscoder,
} from './transcoder/transcoder.port';
import { VideoRepository } from './video.repository';
import {
  VideoStorageAdapter,
  type VideoStoragePort,
} from './video-storage.adapter';
import { UPLOAD_SIZE_TOLERANCE } from '../upload-tolerance';

const MAX_SUBMIT_ATTEMPTS = 3;
const BACKOFF_MS = [1_000, 2_000, 4_000];

// Claim TTL for the upload-completion slot. Probe + submit finish well under
// a minute in production; 10 min is safely beyond any live attempt so a
// crashed attempt is re-claimable without blocking the instructor indefinitely.
const CLAIM_TTL_MS = 10 * 60_000;

const EXT_BY_CONTENT_TYPE: Record<SupportedVideoContentType, 'mp4' | 'mov' | 'mkv'> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
};

// States in which a transcode job may have written (possibly partial) HLS output.
const HLS_OUTPUT_STATES: Readonly<Set<Video['state']>> = new Set([
  'TRANSCODING',
  'READY',
  'FAILED',
]);

const DELETABLE_STATES: Readonly<Set<Video['state']>> = new Set([
  'PENDING_UPLOAD',
  'UPLOADED',
  'FAILED',
  'TRANSCODING',
  'READY',
]);

export interface CreateUploadSessionInput {
  uid: UserId;
  courseId: CourseId;
  lessonId: LessonId;
  lessonVideoId: VideoId | undefined;
  input: { sizeBytes: number; contentType: SupportedVideoContentType };
}

export interface CreateUploadSessionResult {
  videoId: VideoId;
  uploadSessionUri: string;
  expiresAt: ISODateString;
}

export interface VideoServiceDeps {
  sleep?: (ms: number) => Promise<void>;
}

@Injectable()
export class VideoService {
  // Stryker disable next-line StringLiteral: Logger constructor-name string, log-only, no behavior
  private readonly logger = new Logger('VideoService');
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly repo: VideoRepository,
    @Inject(VideoStorageAdapter) private readonly storage: VideoStoragePort,
    @Inject(VIDEO_CONFIG) private readonly cfg: VideoConfig,
    @Inject(VIDEO_TRANSCODER) private readonly transcoder: VideoTranscoder,
    @Optional() deps?: VideoServiceDeps,
  ) {
    // Stryker disable next-line ArrowFunction: DI default sleep, overridden in tests
    this.sleep = deps?.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async createUploadSession(args: CreateUploadSessionInput): Promise<CreateUploadSessionResult> {
    if (args.lessonVideoId) throw new LessonAlreadyHasVideoException();
    const videoId = this.repo.newId<VideoId>();
    const ext = EXT_BY_CONTENT_TYPE[args.input.contentType];
    const path = `videos/${videoId}/source.${ext}`;
    const now = nowIso();
    const video: Video = {
      id: videoId,
      ownerInstructorId: args.uid,
      courseId: args.courseId,
      lessonId: args.lessonId,
      state: 'PENDING_UPLOAD',
      source: { bucket: this.cfg.sourceBucket, path, sizeBytes: args.input.sizeBytes },
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.createVideo(video);
    const session = await this.storage.createResumableSession({
      bucket: this.cfg.sourceBucket,
      path,
      contentType: args.input.contentType,
      videoId,
    });
    return { videoId, uploadSessionUri: session.uri, expiresAt: session.expiresAt };
  }

  async getVideo(vid: VideoId): Promise<Video> {
    const v = await this.repo.getVideo(vid);
    if (!v) throw new VideoNotFoundException();
    return v;
  }

  async markFailed(vid: VideoId, reason: string): Promise<Video> {
    const v = await this.repo.getVideo(vid);
    if (!v) throw new VideoNotFoundException();
    if (v.state !== 'PENDING_UPLOAD') throw new InvalidVideoStateException(v.state);
    const updatedAt = nowIso();
    await this.repo.updateVideo(vid, { state: 'FAILED', failureReason: reason, updatedAt });
    return { ...v, state: 'FAILED', failureReason: reason, updatedAt };
  }

  async completeUpload(vid: VideoId): Promise<Video> {
    const now = nowIso();
    const staleBefore = new Date(Date.parse(now) - CLAIM_TTL_MS).toISOString() as ISODateString;
    // Atomically claim the upload-completion slot. Throws
    // UploadCompletionInProgressException if a concurrent attempt holds a fresh
    // claim — eliminating the duplicate-transcoder-submit race.
    const v = await this.repo.claimUploadCompletion(vid, now, staleBefore);

    // Verify the uploaded object. These failures are non-terminal (state stays
    // PENDING_UPLOAD) so the instructor can retry after fixing the upload.
    // Release the claim immediately so the retry does not hit a 10-min block.
    let actualSize: number;
    try {
      actualSize = await this.verifyUploadObjectOrThrow(v);
    } catch (err) {
      // Stryker disable next-line BlockStatement: log-only catch body; the .catch already swallows the rejection regardless
      await this.repo.releaseUploadCompletionClaim(vid).catch((e: unknown) => {
        // Stryker disable next-line StringLiteral: log-only message, no behavior
        this.logger.warn(`releaseUploadCompletionClaim failed for ${vid}: ${(e as Error).message}`);
      });
      throw err;
    }

    const probe = await this.tryProbeSource(v);
    if (!probe.ok) {
      // Terminal failure — markFailedFromSubmission strips the claim in its txn.
      return this.recordPipelineFailure(vid, 'SOURCE_PROBE_FAILED', probe.error, actualSize);
    }

    const key = this.generateContentKey();
    const submit = await this.submitWithRetry(this.buildTranscoderInput(v, probe.value.height, key));
    if (!submit.ok) {
      // Terminal failure — markFailedFromSubmission strips the claim in its txn.
      return this.recordPipelineFailure(vid, 'TRANSCODER_SUBMIT_FAILED', submit.lastError, actualSize);
    }

    try {
      return await this.repo.finalizeUploadWithJob({
        vid,
        lid: v.lessonId,
        actualSizeBytes: actualSize,
        // Persist the ffprobe source duration now; applyTranscoderResult uses it
        // for Video.output.durationSec because the GCP Transcoder job returns no
        // reliable output duration.
        probedDurationSec: probe.value.durationSec,
        key,
        transcoderJobName: submit.jobName,
        nowIso: nowIso(),
      });
    } catch (err) {
      // The txn failed (e.g. concurrent lesson/video delete) AFTER submitJob:
      // the GCP job is now unreferenced and the claim would block retries for
      // CLAIM_TTL_MS. Best-effort cancel + release, then rethrow — the plain
      // Error's 500-for-visibility is deliberate (see requireVideoInTxn).
      await this.transcoder.cancelJob(submit.jobName).catch((e: unknown) => {
        // Stryker disable next-line StringLiteral: log-only message, no behavior
        this.logger.warn(`orphaned-job cancel failed for ${submit.jobName}: ${(e as Error).message}`);
      });
      if (err instanceof LessonAlreadyHasVideoException) {
        // Double-finalize race: a concurrent session's video won the lesson.
        // Park the loser in FAILED (markFailedFromSubmission strips the claim
        // in its txn) so the retry-flow/cascade semantics treat it like any
        // other dead session doc instead of a forever-claimable orphan.
        await this.repo
          .markFailedFromSubmission({
            vid,
            failureReason: 'LESSON_ALREADY_HAS_VIDEO: lesson already has a video',
            actualSizeBytes: actualSize,
            nowIso: nowIso(),
          })
          // Stryker disable next-line BlockStatement: log-only catch body; the .catch already swallows the rejection regardless
          .catch((e: unknown) => {
            // Stryker disable next-line StringLiteral: log-only message, no behavior
            this.logger.warn(`loser markFailed failed for ${vid}: ${(e as Error).message}`);
          });
        throw err;
      }
      await this.repo.releaseUploadCompletionClaim(vid).catch((e: unknown) => {
        // Stryker disable next-line StringLiteral: log-only message, no behavior
        this.logger.warn(`releaseUploadCompletionClaim failed for ${vid}: ${(e as Error).message}`);
      });
      throw err;
    }
  }

  /**
   * HEAD the uploaded object and confirm its size is within tolerance of the
   * declared size. If the object is grossly larger, best-effort delete it
   * before throwing — otherwise an attacker could pin a giant blob in storage
   * by skipping completeUpload entirely.
   */
  private async verifyUploadObjectOrThrow(v: Video): Promise<number> {
    const head = await this.storage.headObject({ bucket: v.source.bucket, path: v.source.path });
    if (!head) throw new UploadObjectMissingException();
    const declared = v.source.sizeBytes ?? 0;
    // When no size was declared (declared falsy), the tolerance check is
    // meaningless — a zero baseline would reject every non-empty upload. Skip it
    // rather than guarantee a spurious rejection. The DTO requires sizeBytes
    // today, so this is a latent-safety path only.
    if (declared && head.size > declared * UPLOAD_SIZE_TOLERANCE) {
      await this.storage
        .deleteObject({ bucket: v.source.bucket, path: v.source.path })
        .catch(() => undefined);
      throw new UploadObjectSizeMismatchException();
    }
    return head.size;
  }

  private async tryProbeSource(
    v: Video,
  ): Promise<
    { ok: true; value: { height: number; durationSec: number } } | { ok: false; error: string }
  > {
    try {
      const probe = await this.storage.probeSource({ bucket: v.source.bucket, path: v.source.path });
      return { ok: true, value: probe };
    } catch (err) {
      const message = (err as Error).message;
      // Stryker disable next-line StringLiteral: log-only message, no behavior
      this.logger.warn(`ffprobe failed for ${v.id}: ${message}`);
      return { ok: false, error: message };
    }
  }

  private generateContentKey(): { id: VideoKeyId; bytes: Uint8Array } {
    return {
      id: this.repo.newId<VideoKeyId>(),
      bytes: new Uint8Array(randomBytes(16)),
    };
  }

  private buildTranscoderInput(
    v: Video,
    sourceHeight: number,
    key: { id: VideoKeyId; bytes: Uint8Array },
  ): Parameters<VideoTranscoder['submitJob']>[0] {
    return {
      videoId: v.id,
      sourceUri: `gs://${v.source.bucket}/${v.source.path}`,
      outputUriPrefix: `gs://${this.cfg.outputBucket}/videos/${v.id}/hls/`,
      encryptionKey: key,
      sourceHeight,
      topic: this.cfg.transcoderTopic ?? '',
    };
  }

  /**
   * Persist a transcode-pipeline failure (probe or submit) via the repo
   * helper, formatting the failureReason as `${code}: ${detail}` capped at
   * 500 chars to match the existing on-disk shape.
   */
  private recordPipelineFailure(
    vid: VideoId,
    code: 'SOURCE_PROBE_FAILED' | 'TRANSCODER_SUBMIT_FAILED',
    detail: string,
    actualSizeBytes: number,
  ): Promise<Video> {
    return this.repo.markFailedFromSubmission({
      vid,
      failureReason: `${code}: ${detail}`.slice(0, 500),
      actualSizeBytes,
      nowIso: nowIso(),
    });
  }

  private async submitWithRetry(
    input: Parameters<VideoTranscoder['submitJob']>[0],
  ): Promise<{ ok: true; jobName: string } | { ok: false; lastError: string }> {
    // Stryker disable next-line StringLiteral: equivalent — MAX_SUBMIT_ATTEMPTS>0 so the loop always runs; lastError is overwritten by the catch before it can be returned
    let lastError = 'unknown';
    for (let attempt = 0; attempt < MAX_SUBMIT_ATTEMPTS; attempt++) {
      try {
        const handle = await this.transcoder.submitJob(input);
        return { ok: true, jobName: handle.jobName };
      } catch (err) {
        lastError = (err as Error).message;
        // Stryker disable next-line StringLiteral,ArithmeticOperator: log-only message (attempt+1 is display-only), no behavior
        this.logger.warn(`submitJob attempt ${attempt + 1} failed: ${lastError}`);
        if (attempt < MAX_SUBMIT_ATTEMPTS - 1) {
          await this.sleep(BACKOFF_MS[attempt]!);
        }
      }
    }
    return { ok: false, lastError };
  }

  async handleTranscoderEvent(
    event: TranscoderEvent,
  ): Promise<{ acted: boolean; reason?: string }> {
    const common = { videoId: event.videoId, jobName: event.jobName, nowIso: nowIso() };
    if (event.type === 'JOB_SUCCEEDED') {
      return this.repo.applyTranscoderResult({
        ...common,
        outcome: {
          kind: 'READY',
          manifestPath: event.manifestPath,
          durationSec: event.durationSec,
          outputBucket: this.cfg.outputBucket,
        },
      });
    }
    return this.repo.applyTranscoderResult({
      ...common,
      outcome: { kind: 'FAILED', reason: event.reason },
    });
  }

  async delete(vid: VideoId): Promise<void> {
    const v = await this.repo.getVideo(vid);
    if (!v) throw new VideoNotFoundException();
    if (!DELETABLE_STATES.has(v.state)) throw new InvalidVideoStateException(v.state);
    await this.tearDownVideoSideEffects(v, { logCancelFailures: true });
    await this.repo.deleteVideoAndDetach(v.id, v.lessonId, nowIso());
  }

  async deleteForLesson(lid: LessonId): Promise<void> {
    // The retry flow can leave multiple video docs per lesson (FAILED doc +
    // new session); tear down every one or the extras orphan their videoKeys,
    // source objects, and HLS output.
    const videos = await this.repo.listVideosByLesson(lid);
    for (const v of videos) {
      // Stryker disable next-line ObjectLiteral: equivalent — emptying to {} yields opts.logCancelFailures===undefined, falsy like false, so the log branch is unchanged (BooleanLiteral mutant IS killed by the deleteForLesson no-warn test)
      await this.tearDownVideoSideEffects(v, { logCancelFailures: false });
      await this.repo.deleteVideoAndDetach(v.id, v.lessonId, nowIso());
    }
  }

  /**
   * Tear down out-of-Firestore artefacts: cancel an in-flight transcode job,
   * delete any HLS output prefix, then best-effort delete the source object.
   * Caller is responsible for the Firestore detach.
   *
   * `logCancelFailures` controls whether a cancelJob failure is logged. The
   * lesson-cascade path swallows it silently (the lesson is being deleted
   * outright, so transcoder noise isn't actionable); the direct-delete path
   * logs because the operator initiated it.
   */
  private async tearDownVideoSideEffects(
    v: Video,
    opts: { logCancelFailures: boolean },
  ): Promise<void> {
    if (v.state === 'TRANSCODING' && v.transcoderJobName) {
      const jobName = v.transcoderJobName;
      await this.transcoder.cancelJob(jobName).catch((err) => {
        if (opts.logCancelFailures) {
          // Stryker disable next-line StringLiteral: log-only message, no behavior
          this.logger.warn(`cancelJob failed for ${jobName}: ${(err as Error).message}`);
        }
      });
    }
    // Any state where a transcode job may have run can leave HLS output —
    // READY (full), TRANSCODING (partial, job cancelled above), FAILED
    // (partial). deletePrefix is best-effort inside the adapter, so running
    // it against an empty prefix is a harmless no-op.
    if (HLS_OUTPUT_STATES.has(v.state)) {
      await this.storage.deletePrefix({
        bucket: v.output?.bucket ?? this.cfg.outputBucket,
        prefix: `videos/${v.id}/`,
      });
    }
    await this.storage
      .deleteObject({ bucket: v.source.bucket, path: v.source.path })
      .catch(() => undefined);
  }
}
