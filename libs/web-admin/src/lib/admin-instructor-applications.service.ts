import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  InstructorApplicationView,
  PendingInstructorApplicationsResponse,
} from '@learnwren/shared-data-models';

const BASE = '/api/admin/instructor-applications';

@Injectable({ providedIn: 'root' })
export class AdminInstructorApplicationsService {
  private readonly http = inject(HttpClient);

  list(): Promise<PendingInstructorApplicationsResponse> {
    return firstValueFrom(this.http.get<PendingInstructorApplicationsResponse>(BASE));
  }

  approve(uid: string): Promise<InstructorApplicationView> {
    return firstValueFrom(
      this.http.post<InstructorApplicationView>(`${BASE}/${uid}/approve`, {}),
    );
  }

  decline(uid: string): Promise<InstructorApplicationView> {
    return firstValueFrom(
      this.http.post<InstructorApplicationView>(`${BASE}/${uid}/decline`, {}),
    );
  }
}
