import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import type {
  CourseId,
  CreateUploadSessionResponse,
  LessonId,
  ModuleId,
  SupportedVideoContentType,
  Video,
  VideoId,
} from '@learnwren/shared-data-models';

export type { CreateUploadSessionResponse } from '@learnwren/shared-data-models';

const OPTS = { withCredentials: true } as const;

export interface CreateUploadSessionPayload {
  sizeBytes: number;
  contentType: SupportedVideoContentType;
  filename?: string;
}

@Injectable({ providedIn: 'root' })
export class VideoService {
  private readonly http = inject(HttpClient);

  createUploadSession(
    cid: CourseId,
    mid: ModuleId,
    lid: LessonId,
    payload: CreateUploadSessionPayload,
  ): Observable<CreateUploadSessionResponse> {
    return this.http.post<CreateUploadSessionResponse>(
      `/api/courses/${cid}/modules/${mid}/lessons/${lid}/video/upload-session`,
      payload,
      OPTS,
    );
  }

  getVideo(vid: VideoId): Observable<Video> {
    return this.http.get<Video>(`/api/videos/${vid}`, OPTS);
  }

  completeUpload(vid: VideoId): Observable<Video> {
    return this.http.post<Video>(`/api/videos/${vid}/upload-complete`, {}, OPTS);
  }

  markFailed(vid: VideoId, failureReason: string): Observable<Video> {
    return this.http.patch<Video>(
      `/api/videos/${vid}`,
      { state: 'FAILED', failureReason },
      OPTS,
    );
  }

  delete(vid: VideoId): Observable<void> {
    return this.http.delete<void>(`/api/videos/${vid}`, OPTS);
  }
}
