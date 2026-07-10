import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  Enrollment,
  EnrollmentListView,
  EnrollmentStatusView,
} from '@learnwren/shared-data-models';

@Injectable({ providedIn: 'root' })
export class EnrollmentService {
  private readonly http = inject(HttpClient);

  getEnrollmentStatus(courseId: string): Promise<EnrollmentStatusView> {
    return firstValueFrom(
      this.http.get<EnrollmentStatusView>(`/api/enrollments/${courseId}`),
    );
  }

  enroll(courseId: string): Promise<Enrollment> {
    return firstValueFrom(this.http.post<Enrollment>('/api/enrollments', { courseId }));
  }

  unenroll(courseId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/enrollments/${courseId}`));
  }

  listMyEnrollments(): Promise<EnrollmentListView> {
    return firstValueFrom(this.http.get<EnrollmentListView>('/api/enrollments'));
  }
}
