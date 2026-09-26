import { Injectable } from '@nestjs/common';

import type { MultipartPart } from '@learnwren/api-object-storage';

export interface VideoUploadSession {
  bucket: string;
  path: string;
  contentType: string;
  uploadId?: string;
  parts: MultipartPart[];
  received: number;
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

  open(videoId: string, input: { bucket: string; path: string; contentType: string }): void {
    this.sessions.set(videoId, { ...input, parts: [], received: 0 });
  }

  get(videoId: string): VideoUploadSession | undefined {
    return this.sessions.get(videoId);
  }

  close(videoId: string): void {
    this.sessions.delete(videoId);
  }
}
