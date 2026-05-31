import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { VideoCaptionsMeta, VideoId } from '@learnwren/shared-data-models';

const MAX_BYTES = 256_000;

export type LocalValidation = { ok: true } | { ok: false; reason: string };

@Injectable({ providedIn: 'root' })
export class CaptionsService {
  private readonly http = inject(HttpClient);

  validateLocally(file: File): LocalValidation {
    if (!/\.vtt$/i.test(file.name) && file.type !== 'text/vtt') {
      return { ok: false, reason: 'Captions must be a WebVTT (.vtt) file.' };
    }
    if (file.size > MAX_BYTES) {
      return { ok: false, reason: 'Caption file exceeds the 256 KB limit.' };
    }
    return { ok: true };
  }

  getMeta(vid: VideoId): Promise<VideoCaptionsMeta | null> {
    return firstValueFrom(
      this.http.get<VideoCaptionsMeta | null>(`/api/videos/${vid}/captions`, { withCredentials: true }),
    );
  }

  upload(vid: VideoId, file: File): Promise<VideoCaptionsMeta> {
    const form = new FormData();
    form.append('file', file, file.name);
    return firstValueFrom(
      this.http.put<VideoCaptionsMeta>(`/api/videos/${vid}/captions`, form, { withCredentials: true }),
    );
  }

  async remove(vid: VideoId): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`/api/videos/${vid}/captions`, { withCredentials: true }),
    );
  }
}
