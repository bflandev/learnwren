import { Controller, Inject, Param, Put, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { FirebaseSessionGuard } from '@learnwren/api-auth';
import { OBJECT_STORAGE, type ObjectStorage } from '@learnwren/api-object-storage';
import type { VideoId } from '@learnwren/shared-data-models';

import { UploadChunkInvalidException, UploadSessionMissingException } from '../errors/video.exception';
import { VideoExceptionFilter } from '../video.exception-filter';
import { VideoOwnerGuard } from '../video-owner.guard';
import { VideoUploadSessions, type VideoUploadSession } from './video-upload-sessions';

/** S3 rejects multipart parts under 5 MiB except the last one. */
export const MIN_PART_BYTES = 5 * 1024 * 1024;

/** Largest chunk the proxy will buffer; matches nginx's client_max_body_size. The browser sends 8 MiB. */
export const MAX_CHUNK_BYTES = 64 * 1024 * 1024;

const CONTENT_RANGE = /^bytes (\d+)-(\d+)\/(\d+)$/;

export interface ContentRange {
  start: number;
  last: number;
  total: number;
}

export function parseContentRange(header: string | undefined): ContentRange {
  const m = header ? CONTENT_RANGE.exec(header) : null;
  if (!m) throw new UploadChunkInvalidException('malformed Content-Range');
  const start = Number(m[1]);
  const last = Number(m[2]);
  const total = Number(m[3]);
  if (last < start || last >= total) throw new UploadChunkInvalidException('Content-Range out of bounds');
  return { start, last, total };
}

/**
 * Read exactly `expected` bytes. A body that a parser already read (any JSON
 * content type) would never emit 'end', so it is refused up front; a body
 * that runs long is cut off, and a client that hangs up is refused, so no
 * request can hold the promise (and its socket) open.
 */
function collect(req: Request, expected: number): Promise<Buffer> {
  if (req.readableEnded) {
    return Promise.reject(
      new UploadChunkInvalidException('request body was already read; send the chunk as application/octet-stream'),
    );
  }
  // The client can hang up while the guards run: 'close' has then already fired.
  if (req.destroyed) return Promise.reject(new UploadChunkInvalidException('request aborted'));
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      chunks.push(c);
      size += c.length;
      if (size > expected) {
        req.destroy();
        reject(new UploadChunkInvalidException('body is longer than Content-Range'));
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    // After 'end' the promise is settled and this reject is a no-op.
    req.on('close', () => reject(new UploadChunkInvalidException('request aborted')));
    req.on('error', reject);
  });
}

/**
 * The GCS resumable-upload protocol the browser already speaks, served by the
 * api and backed by S3 multipart (self-host, where the store is not exposed):
 * sequential `PUT`s with `Content-Range: bytes a-b/total`; `308` until the
 * last byte lands, then `200`. A chunk already received (a lost `308`) is
 * acknowledged again; a gap or overlap is a client bug and gets `400`.
 */
@Controller('internal/uploads/videos')
@UseFilters(VideoExceptionFilter)
@UseGuards(FirebaseSessionGuard, VideoOwnerGuard)
export class VideoUploadProxyController {
  constructor(
    private readonly sessions: VideoUploadSessions,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  // Exempt from the per-IP throttler (tier names from apps/api throttle.config):
  // an upload at LAN speed sends ~12 chunks/s, and once over the limit the
  // throttler blocks for the whole window, so the upload failed. The session
  // and owner guards already gate this route.
  @SkipThrottle({ burst: true, sustained: true })
  @Put(':vid')
  async chunk(@Param('vid') vid: VideoId, @Req() req: Request, @Res() res: Response): Promise<void> {
    const range = parseContentRange(req.headers['content-range']);
    const session = this.sessions.get(vid);
    if (!session) throw new UploadSessionMissingException();
    const expected = range.last - range.start + 1;
    if (expected > MAX_CHUNK_BYTES) {
      throw new UploadChunkInvalidException(`chunk must be at most ${MAX_CHUNK_BYTES} bytes`);
    }
    const body = await collect(req, expected);
    if (body.length !== expected) {
      throw new UploadChunkInvalidException('body length does not match Content-Range');
    }
    // One chunk at a time per session: a client retry that arrives while the
    // first attempt is still storing would otherwise create a second
    // multipart upload or a duplicate part.
    const run = session.tail.then(() => this.store(vid, session, range, body, res));
    session.tail = run.catch(() => undefined);
    await run;
  }

  private async store(
    vid: VideoId,
    session: VideoUploadSession,
    range: ContentRange,
    body: Buffer,
    res: Response,
  ): Promise<void> {
    if (range.last < session.received) {
      // Already have these bytes: the client missed our 308 (or the final
      // 200) and retried.
      if (session.completed) res.status(200).json({ ok: true });
      else this.acknowledge(res, session);
      return;
    }
    if (range.start !== session.received) {
      throw new UploadChunkInvalidException(`expected chunk to start at byte ${session.received}`);
    }
    const isLast = range.last + 1 === range.total;
    if (!isLast && body.length < MIN_PART_BYTES) {
      throw new UploadChunkInvalidException(`non-final chunk must be at least ${MIN_PART_BYTES} bytes`);
    }
    // Session state advances only after the store accepts the part (and, for
    // the last chunk, the completion). On failure it is left as it was, so the
    // client's retry of the same chunk succeeds; an upload the client gives
    // up on is aborted when it marks the video failed (discardUploadSession).
    if (!session.uploadId) {
      const uploadId = await this.storage.createMultipartUpload({
        bucket: session.bucket,
        path: session.path,
        contentType: session.contentType,
      });
      // Discarded (video deleted or marked failed) while the create was in
      // flight: nothing would ever abort this upload, so do it now.
      if (this.sessions.get(vid) !== session) {
        await this.storage
          .abortMultipartUpload({ bucket: session.bucket, path: session.path, uploadId })
          .catch(() => undefined);
        throw new UploadSessionMissingException();
      }
      session.uploadId = uploadId;
    }
    const partNumber = session.parts.length + 1;
    const etag = await this.storage.uploadPart({
      bucket: session.bucket,
      path: session.path,
      uploadId: session.uploadId,
      partNumber,
      body,
    });
    const parts = [...session.parts, { partNumber, etag }];
    if (isLast) {
      await this.storage.completeMultipartUpload({
        bucket: session.bucket,
        path: session.path,
        uploadId: session.uploadId,
        parts,
      });
    }
    session.parts = parts;
    session.received = range.last + 1;
    if (!isLast) {
      this.acknowledge(res, session);
      return;
    }
    session.completed = true;
    res.status(200).json({ ok: true });
  }

  private acknowledge(res: Response, session: VideoUploadSession): void {
    res.status(308).set('Range', `bytes=0-${session.received - 1}`).send();
  }
}
