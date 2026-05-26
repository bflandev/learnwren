import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  ISODateString,
  LessonView,
  MaterialDownloadUrlResponse,
  MaterialId,
} from '@learnwren/shared-data-models';

@Injectable({ providedIn: 'root' })
export class LearnService {
  private readonly http = inject(HttpClient);

  getLessonView(courseId: string, lessonId: string): Promise<LessonView> {
    return firstValueFrom(
      this.http.get<LessonView>(`/api/learn/courses/${courseId}/lessons/${lessonId}`, {
        withCredentials: true,
      }),
    );
  }

  markLessonComplete(
    courseId: string,
    lessonId: string,
  ): Promise<{ completedAt: ISODateString }> {
    return firstValueFrom(
      this.http.post<{ completedAt: ISODateString }>(
        `/api/learn/courses/${courseId}/lessons/${lessonId}/complete`,
        {},
        { withCredentials: true },
      ),
    );
  }

  requestDownloadUrl(matId: MaterialId): Promise<MaterialDownloadUrlResponse> {
    return firstValueFrom(
      this.http.get<MaterialDownloadUrlResponse>(
        `/api/materials/${matId}/download-url`,
        { withCredentials: true },
      ),
    );
  }

  savePosition(
    courseId: string,
    lessonId: string,
    seconds: number,
  ): Promise<{ lastWatchedSeconds: number }> {
    return firstValueFrom(
      this.http.post<{ lastWatchedSeconds: number }>(
        `/api/learn/courses/${courseId}/lessons/${lessonId}/position`,
        { seconds },
        { withCredentials: true },
      ),
    );
  }
}
