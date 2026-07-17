import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { AdminHealthReport } from '@learnwren/shared-data-models';

/** Admin platform-health report (US-08-04). */
@Injectable({ providedIn: 'root' })
export class AdminHealthService {
  private readonly http = inject(HttpClient);

  getReport(): Promise<AdminHealthReport> {
    return firstValueFrom(this.http.get<AdminHealthReport>('/api/admin/health'));
  }
}
