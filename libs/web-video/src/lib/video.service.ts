import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import type {
  CourseId,
  LessonId,
  ModuleId,
  Video,
  VideoId,
} from '@learnwren/shared-data-models';

export interface CreateUploadSessionPayload {
  sizeBytes: number;
  contentType: 'video/mp4' | 'video/quicktime' | 'video/x-matroska';
  filename?: string;
}

export interface CreateUploadSessionResponse {
  videoId: VideoId;
  uploadSessionUri: string;
  expiresAt: string;
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
    );
  }

  getVideo(vid: VideoId): Observable<Video> {
    return this.http.get<Video>(`/api/videos/${vid}`);
  }

  completeUpload(vid: VideoId): Observable<Video> {
    return this.http.post<Video>(`/api/videos/${vid}/upload-complete`, {});
  }

  markFailed(vid: VideoId, failureReason: string): Observable<Video> {
    return this.http.patch<Video>(`/api/videos/${vid}`, {
      state: 'FAILED',
      failureReason,
    });
  }

  delete(vid: VideoId): Observable<void> {
    return this.http.delete<void>(`/api/videos/${vid}`);
  }
}
