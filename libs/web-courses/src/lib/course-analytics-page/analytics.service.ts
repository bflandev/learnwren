import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { CourseAnalyticsView } from '@learnwren/shared-data-models';

const OPTS = { withCredentials: true } as const;

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);

  getAnalytics(cid: string): Promise<CourseAnalyticsView> {
    return firstValueFrom(
      this.http.get<CourseAnalyticsView>(`/api/courses/${cid}/analytics`, OPTS),
    );
  }
}
