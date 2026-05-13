import { Injectable, InjectionToken, inject, signal, type Signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CourseId,
  LessonId,
  ModuleId,
  VideoId,
} from '@learnwren/shared-data-models';

import { VideoService } from '../video.service';

export const XHR_FACTORY = new InjectionToken<() => XMLHttpRequest>('XHR_FACTORY', {
  providedIn: 'root',
  factory: () => () => new XMLHttpRequest(),
});

const SUPPORTED_MIME = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
]);
const MAX_BYTES = 10_000_000_000;
const CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_RETRIES_PER_CHUNK = 3;
const BACKOFF_MS = [1000, 2000, 4000];

export type UploadState =
  | { kind: 'idle' }
  | { kind: 'creating-session' }
  | { kind: 'uploading'; percent: number; videoId: VideoId }
  | { kind: 'finalizing'; videoId: VideoId }
  | { kind: 'complete'; videoId: VideoId }
  | { kind: 'canceling'; videoId: VideoId }
  | { kind: 'failed'; reason: string; videoId?: VideoId };

export interface UploadContext {
  courseId: CourseId;
  moduleId: ModuleId;
  lessonId: LessonId;
}

@Injectable()
export class VideoUploadService {
  private readonly api = inject(VideoService);
  private readonly xhrFactory = inject(XHR_FACTORY);
  private readonly _state = signal<UploadState>({ kind: 'idle' });
  private currentXhr: XMLHttpRequest | undefined;
  private aborted = false;

  readonly state: Signal<UploadState> = this._state.asReadonly();

  selectFile(file: File): { ok: true; contentType: string } | { ok: false } {
    if (file.size > MAX_BYTES) {
      this._state.set({ kind: 'failed', reason: 'File size exceeds the 10 GB limit.' });
      return { ok: false };
    }
    if (!SUPPORTED_MIME.has(file.type)) {
      this._state.set({
        kind: 'failed',
        reason: 'Unsupported format. Please upload MP4, MOV, or MKV.',
      });
      return { ok: false };
    }
    return { ok: true, contentType: file.type };
  }

  async start(ctx: UploadContext, file: File): Promise<void> {
    this.aborted = false;
    const check = this.selectFile(file);
    if (!check.ok) return;
    this._state.set({ kind: 'creating-session' });

    let videoId: VideoId;
    let sessionUri: string;
    try {
      const r = await firstValueFrom(
        this.api.createUploadSession(ctx.courseId, ctx.moduleId, ctx.lessonId, {
          sizeBytes: file.size,
          contentType: check.contentType as 'video/mp4',
        }),
      );
      videoId = r.videoId;
      sessionUri = r.uploadSessionUri;
    } catch (err) {
      this._state.set({ kind: 'failed', reason: this.errorMessage(err) });
      return;
    }

    this._state.set({ kind: 'uploading', percent: 0, videoId });
    const uploadOk = await this.uploadAllChunks(sessionUri, file, videoId);
    if (!uploadOk || this.aborted) return;

    this._state.set({ kind: 'finalizing', videoId });
    try {
      await firstValueFrom(this.api.completeUpload(videoId));
      this._state.set({ kind: 'complete', videoId });
    } catch (err) {
      this._state.set({
        kind: 'failed',
        reason: this.errorMessage(err),
        videoId,
      });
    }
  }

  async cancel(): Promise<void> {
    const s = this._state();
    this.aborted = true;
    this.currentXhr?.abort();
    if (s.kind === 'uploading' || s.kind === 'finalizing' || s.kind === 'failed') {
      const vid = s.videoId;
      this._state.set({ kind: 'canceling', videoId: vid! });
      if (vid) {
        await firstValueFrom(this.api.delete(vid)).catch(() => undefined);
      }
    }
    this._state.set({ kind: 'idle' });
  }

  async retry(): Promise<void> {
    const s = this._state();
    if (s.kind !== 'failed' || !s.videoId) return;
    await firstValueFrom(this.api.delete(s.videoId)).catch(() => undefined);
    this._state.set({ kind: 'idle' });
  }

  private async uploadAllChunks(
    sessionUri: string,
    file: File,
    videoId: VideoId,
  ): Promise<boolean> {
    const total = file.size;
    let offset = 0;
    while (offset < total && !this.aborted) {
      const end = Math.min(offset + CHUNK_BYTES, total);
      const chunk = file.slice(offset, end);
      const ok = await this.putChunkWithRetry(sessionUri, chunk, offset, total - 1, total, videoId);
      if (!ok) return false;
      offset = end;
      this._state.set({
        kind: 'uploading',
        percent: Math.round((offset / total) * 100),
        videoId,
      });
    }
    return !this.aborted;
  }

  private async putChunkWithRetry(
    sessionUri: string,
    chunk: Blob,
    start: number,
    last: number,
    total: number,
    videoId: VideoId,
  ): Promise<boolean> {
    for (let attempt = 0; attempt <= MAX_RETRIES_PER_CHUNK; attempt++) {
      const status = await this.putChunk(sessionUri, chunk, start, last, total);
      if (this.aborted) return false;
      if (status === 200 || status === 308) return true;
      if (status >= 500 && attempt < MAX_RETRIES_PER_CHUNK) {
        await new Promise((res) => setTimeout(res, BACKOFF_MS[attempt] ?? 4000));
        continue;
      }
      // hard failure
      await firstValueFrom(
        this.api.markFailed(videoId, `Upload failed with status ${status}.`),
      ).catch(() => undefined);
      this._state.set({
        kind: 'failed',
        reason: `Upload failed: status ${status}.`,
        videoId,
      });
      return false;
    }
    return false;
  }

  private putChunk(
    sessionUri: string,
    chunk: Blob,
    start: number,
    last: number,
    total: number,
  ): Promise<number> {
    return new Promise((resolve) => {
      const xhr = this.xhrFactory();
      this.currentXhr = xhr;
      xhr.open('PUT', sessionUri, true);
      xhr.setRequestHeader('Content-Range', `bytes ${start}-${last}/${total}`);
      xhr.upload.onprogress = () => {
        // chunk-level granularity already updates `percent` in caller
      };
      xhr.onload = () => resolve(xhr.status);
      xhr.onerror = () => resolve(0);
      xhr.send(chunk);
    });
  }

  private errorMessage(err: unknown): string {
    const msg =
      typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Unknown error.';
    return msg;
  }
}
