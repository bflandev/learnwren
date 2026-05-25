import { randomBytes } from 'node:crypto';

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

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

const SIZE_TOLERANCE = 1.05;
const MAX_SUBMIT_ATTEMPTS = 3;
const BACKOFF_MS = [1_000, 2_000, 4_000];

const EXT_BY_CONTENT_TYPE: Record<SupportedVideoContentType, 'mp4' | 'mov' | 'mkv'> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
};

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

function nowIso(): ISODateString {
  return new Date().toISOString() as ISODateString;
}

@Injectable()
export class VideoService {
  private readonly logger = new Logger('VideoService');
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly repo: VideoRepository,
    @Inject(VideoStorageAdapter) private readonly storage: VideoStoragePort,
    @Inject(VIDEO_CONFIG) private readonly cfg: VideoConfig,
    @Inject(VIDEO_TRANSCODER) private readonly transcoder: VideoTranscoder,
    @Optional() deps?: VideoServiceDeps,
  ) {
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
    const v = await this.getPendingUploadOrThrow(vid);
    const actualSize = await this.verifyUploadObjectOrThrow(v);

    const probe = await this.tryProbeSource(v);
    if (!probe.ok) {
      return this.recordPipelineFailure(vid, 'SOURCE_PROBE_FAILED', probe.error, actualSize);
    }

    const key = this.generateContentKey();
    const submit = await this.submitWithRetry(this.buildTranscoderInput(v, probe.value.height, key));
    if (!submit.ok) {
      return this.recordPipelineFailure(vid, 'TRANSCODER_SUBMIT_FAILED', submit.lastError, actualSize);
    }

    return this.repo.finalizeUploadWithJob({
      vid,
      lid: v.lessonId,
      actualSizeBytes: actualSize,
      key,
      transcoderJobName: submit.jobName,
      nowIso: nowIso(),
    });
  }

  /** Load the video and ensure it is still in PENDING_UPLOAD; throws otherwise. */
  private async getPendingUploadOrThrow(vid: VideoId): Promise<Video> {
    const v = await this.repo.getVideo(vid);
    if (!v) throw new VideoNotFoundException();
    if (v.state !== 'PENDING_UPLOAD') throw new InvalidVideoStateException(v.state);
    return v;
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
    if (head.size > declared * SIZE_TOLERANCE) {
      await this.storage
        .deleteObject({ bucket: v.source.bucket, path: v.source.path })
        .catch(() => undefined);
      throw new UploadObjectSizeMismatchException();
    }
    return head.size;
  }

  private async tryProbeSource(
    v: Video,
  ): Promise<{ ok: true; value: { height: number } } | { ok: false; error: string }> {
    try {
      const probe = await this.storage.probeSource({ bucket: v.source.bucket, path: v.source.path });
      return { ok: true, value: probe };
    } catch (err) {
      const message = (err as Error).message;
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
    let lastError = 'unknown';
    for (let attempt = 0; attempt < MAX_SUBMIT_ATTEMPTS; attempt++) {
      try {
        const handle = await this.transcoder.submitJob(input);
        return { ok: true, jobName: handle.jobName };
      } catch (err) {
        lastError = (err as Error).message;
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
    const v = await this.repo.getVideoByLesson(lid);
    if (!v) return;
    await this.tearDownVideoSideEffects(v, { logCancelFailures: false });
    await this.repo.deleteVideoAndDetach(v.id, v.lessonId, nowIso());
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
          this.logger.warn(`cancelJob failed for ${jobName}: ${(err as Error).message}`);
        }
      });
    }
    if (v.state === 'READY' && v.output?.bucket) {
      await this.storage.deletePrefix({
        bucket: v.output.bucket,
        prefix: `videos/${v.id}/`,
      });
    }
    await this.storage
      .deleteObject({ bucket: v.source.bucket, path: v.source.path })
      .catch(() => undefined);
  }
}
