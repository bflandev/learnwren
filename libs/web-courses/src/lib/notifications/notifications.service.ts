import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { NotifyModuleResult } from '@learnwren/shared-data-models';

const OPTS = { withCredentials: true } as const;

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);

  notifyModule(cid: string, mid: string): Promise<NotifyModuleResult> {
    return firstValueFrom(
      this.http.post<NotifyModuleResult>(`/api/courses/${cid}/modules/${mid}/notify`, null, OPTS),
    );
  }
}
