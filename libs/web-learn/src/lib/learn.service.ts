import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { ISODateString, LessonView } from '@learnwren/shared-data-models';

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
}
