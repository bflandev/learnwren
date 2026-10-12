import { Injectable, InjectionToken, inject, signal, type Signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CourseId,
  LessonId,
  ModuleId,
  SupportedVideoContentType,
  VideoId,
} from '@learnwren/shared-data-models';
import { SUPPORTED_VIDEO_CONTENT_TYPES } from '@learnwren/shared-data-models';

import { VideoService } from '../video.service';

export const XHR_FACTORY = new InjectionToken<() => XMLHttpRequest>(
  // Stryker disable next-line StringLiteral: InjectionToken description is a human-readable debug label with no runtime behavior.
  'XHR_FACTORY',
  {
    // Stryker disable next-line StringLiteral: a token carrying its own factory resolves via that factory regardless of the providedIn string (Angular falls back to the token factory), so 'root' vs '' is behaviourally identical — equivalent mutant.
    providedIn: 'root',
    factory: () => () => new XMLHttpRequest(),
  },
);

const SUPPORTED_MIME = new Set<SupportedVideoContentType>(SUPPORTED_VIDEO_CONTENT_TYPES);
// Browsers report '' for .mkv on some platforms and video/x-m4v for .m4v (an
// MP4 container), so fall back to the extension the picker's accept list offers.
const CONTENT_TYPE_BY_EXT: Record<string, SupportedVideoContentType> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
};

function contentTypeOf(file: File): SupportedVideoContentType | undefined {
  if (SUPPORTED_MIME.has(file.type as SupportedVideoContentType)) {
    return file.type as SupportedVideoContentType;
  }
  return CONTENT_TYPE_BY_EXT[file.name.split('.').pop()?.toLowerCase() ?? ''];
}
const MAX_BYTES = 10_000_000_000;
const CHUNK_BYTES = 8 * 1024 * 1024;
const BACKOFF_MS = [1000, 2000, 4000];
// One backoff delay per retry, so BACKOFF_MS[attempt] is always in range.
const MAX_RETRIES_PER_CHUNK = BACKOFF_MS.length;

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
  // Stryker disable next-line BooleanLiteral: start() resets `this.aborted = false` as its first statement before any code reads the flag, so the initializer value is never observed — flipping it to `true` is overwritten immediately. Equivalent mutant.
  private aborted = false;

  readonly state: Signal<UploadState> = this._state.asReadonly();

  selectFile(file: File): { ok: true; contentType: SupportedVideoContentType } | { ok: false } {
    if (file.size > MAX_BYTES) {
      this._state.set({ kind: 'failed', reason: 'File size exceeds the 10 GB limit.' });
      return { ok: false };
    }
    const contentType = contentTypeOf(file);
    if (!contentType) {
      this._state.set({
        kind: 'failed',
        reason: 'Unsupported format. Please upload MP4, MOV, or MKV.',
      });
      return { ok: false };
    }
    return { ok: true, contentType };
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
          contentType: check.contentType,
        }),
      );
      videoId = r.videoId;
      sessionUri = r.uploadSessionUri;
    } catch (err) {
      this._state.set({ kind: 'failed', reason: this.errorMessage(err) });
      return;
    }

    if (this.aborted) {
      // cancel() raced ahead of the session response — clean up the just-minted session
      await firstValueFrom(this.api.delete(videoId)).catch(() => undefined);
      this._state.set({ kind: 'idle' });
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
    if (s.kind !== 'failed') return;
    // A client-side rejection (bad type, session create failed) has no video
    // yet; it must still return to idle or the picker never comes back.
    if (s.videoId) {
      await firstValueFrom(this.api.delete(s.videoId)).catch(() => undefined);
    }
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
      const ok = await this.putChunkWithRetry(sessionUri, chunk, offset, end - 1, total, videoId);
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
      // status 0 = network error (xhr.onerror): a transient blip is retryable,
      // same as a 5xx. Aborts also resolve 0 but are caught by the guard above.
      if ((status === 0 || status >= 500) && attempt < MAX_RETRIES_PER_CHUNK) {
        await new Promise((res) => setTimeout(res, BACKOFF_MS[attempt]));
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
    // Stryker disable next-line BooleanLiteral: unreachable. The for-loop spans attempt 0..MAX_RETRIES_PER_CHUNK and every iteration returns (abort→false, 200/308→true, retriable-with-budget→continue, otherwise hard-failure→false); on the final attempt `attempt < MAX_RETRIES_PER_CHUNK` is false so it returns inside the loop. Execution never falls through here. Equivalent mutant.
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
      xhr.onload = () => resolve(xhr.status);
      xhr.onerror = () => resolve(0);
      xhr.onabort = () => resolve(0);
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
