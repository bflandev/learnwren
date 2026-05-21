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
  expiresAt: string;
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
    const v = await this.repo.getVideo(vid);
    if (!v) throw new VideoNotFoundException();
    if (v.state !== 'PENDING_UPLOAD') throw new InvalidVideoStateException(v.state);

    const head = await this.storage.headObject({ bucket: v.source.bucket, path: v.source.path });
    if (!head) throw new UploadObjectMissingException();
    const declared = v.source.sizeBytes ?? 0;
    if (head.size > declared * SIZE_TOLERANCE) {
      await this.storage
        .deleteObject({ bucket: v.source.bucket, path: v.source.path })
        .catch(() => undefined);
      throw new UploadObjectSizeMismatchException();
    }

    let probe;
    try {
      probe = await this.storage.probeSource({ bucket: v.source.bucket, path: v.source.path });
    } catch (err) {
      this.logger.warn(`ffprobe failed for ${vid}: ${(err as Error).message}`);
      return this.repo.markFailedFromSubmission({
        vid,
        failureReason: `SOURCE_PROBE_FAILED: ${(err as Error).message}`.slice(0, 500),
        actualSizeBytes: head.size,
        nowIso: nowIso(),
      });
    }

    const keyBytes = new Uint8Array(randomBytes(16));
    const keyId = this.repo.newId<VideoKeyId>();
    const sourceUri = `gs://${v.source.bucket}/${v.source.path}`;
    const outputUriPrefix = `gs://${this.cfg.outputBucket}/videos/${vid}/hls/`;
    const submit = await this.submitWithRetry({
      videoId: vid,
      sourceUri,
      outputUriPrefix,
      encryptionKey: { id: keyId, bytes: keyBytes },
      sourceHeight: probe.height,
      topic: this.cfg.transcoderTopic ?? '',
    });
    if (!submit.ok) {
      return this.repo.markFailedFromSubmission({
        vid,
        failureReason: `TRANSCODER_SUBMIT_FAILED: ${submit.lastError}`.slice(0, 500),
        actualSizeBytes: head.size,
        nowIso: nowIso(),
      });
    }

    return this.repo.finalizeUploadWithJob({
      vid,
      lid: v.lessonId,
      actualSizeBytes: head.size,
      key: { id: keyId, bytes: keyBytes },
      transcoderJobName: submit.jobName,
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

    if (v.state === 'TRANSCODING' && v.transcoderJobName) {
      await this.transcoder.cancelJob(v.transcoderJobName).catch((err) =>
        this.logger.warn(`cancelJob failed for ${v.transcoderJobName}: ${(err as Error).message}`),
      );
    }
    if (v.state === 'READY' && v.output?.bucket) {
      await this.storage.deletePrefix({
        bucket: v.output.bucket,
        prefix: `videos/${vid}/`,
      });
    }
    await this.storage
      .deleteObject({ bucket: v.source.bucket, path: v.source.path })
      .catch(() => undefined);
    await this.repo.deleteVideoAndDetach(v.id, v.lessonId, nowIso());
  }

  async deleteForLesson(lid: LessonId): Promise<void> {
    const v = await this.repo.getVideoByLesson(lid);
    if (!v) return;
    if (v.state === 'TRANSCODING' && v.transcoderJobName) {
      await this.transcoder.cancelJob(v.transcoderJobName).catch(() => undefined);
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
    await this.repo.deleteVideoAndDetach(v.id, v.lessonId, nowIso());
  }
}
