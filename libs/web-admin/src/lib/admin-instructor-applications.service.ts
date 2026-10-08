import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  AdminInstructorApplicationsResponse,
  InstructorApplicationStatus,
  InstructorApplicationView,
} from '@learnwren/shared-data-models';

const BASE = '/api/admin/instructor-applications';

@Injectable({ providedIn: 'root' })
export class AdminInstructorApplicationsService {
  private readonly http = inject(HttpClient);

  list(status: InstructorApplicationStatus): Promise<AdminInstructorApplicationsResponse> {
    return firstValueFrom(
      this.http.get<AdminInstructorApplicationsResponse>(BASE, { params: { status } }),
    );
  }

  approve(uid: string): Promise<InstructorApplicationView> {
    return firstValueFrom(
      this.http.post<InstructorApplicationView>(`${BASE}/${uid}/approve`, {}),
    );
  }

  decline(uid: string, reason?: string): Promise<InstructorApplicationView> {
    return firstValueFrom(
      this.http.post<InstructorApplicationView>(
        `${BASE}/${uid}/decline`,
        reason ? { reason } : {},
      ),
    );
  }
}
