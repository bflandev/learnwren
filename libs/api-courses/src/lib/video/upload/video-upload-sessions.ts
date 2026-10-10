import { Injectable } from '@nestjs/common';

import type { MultipartPart } from '@learnwren/api-object-storage';

export interface VideoUploadSession {
  bucket: string;
  path: string;
  contentType: string;
  uploadId?: string;
  parts: MultipartPart[];
  received: number;
  /** Set once the multipart upload is completed; a retried final chunk then just re-answers 200. */
  completed?: boolean;
  /** Epoch ms; lets an abandoned session (tab closed mid-upload) be swept. */
  openedAt: number;
}

/**
 * Open S3-mode upload sessions, keyed by video id. In-process on purpose:
 * ponytail: an api restart forgets in-flight uploads; the browser client then
 * gets UPLOAD_SESSION_MISSING, marks the video failed, and the instructor
 * re-uploads. Upgrade path: persist uploadId + parts on the Video document.
 */
@Injectable()
export class VideoUploadSessions {
  private readonly sessions = new Map<string, VideoUploadSession>();

  open(videoId: string, input: { bucket: string; path: string; contentType: string }, now = Date.now()): void {
    this.sessions.set(videoId, { ...input, parts: [], received: 0, openedAt: now });
  }

  /** Video ids whose session was opened before `cutoff` (epoch ms). */
  openedBefore(cutoff: number): string[] {
    return [...this.sessions].filter(([, s]) => s.openedAt < cutoff).map(([id]) => id);
  }

  get(videoId: string): VideoUploadSession | undefined {
    return this.sessions.get(videoId);
  }

  close(videoId: string): void {
    this.sessions.delete(videoId);
  }
}
