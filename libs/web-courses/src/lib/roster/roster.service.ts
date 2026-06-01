import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { CourseRosterView } from '@learnwren/shared-data-models';

const OPTS = { withCredentials: true } as const;

@Injectable({ providedIn: 'root' })
export class RosterService {
  private readonly http = inject(HttpClient);

  getRoster(cid: string): Promise<CourseRosterView> {
    return firstValueFrom(
      this.http.get<CourseRosterView>(`/api/courses/${cid}/students`, OPTS),
    );
  }
}
