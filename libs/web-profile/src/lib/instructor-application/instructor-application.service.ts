import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  InstructorApplicationView,
  SubmitInstructorApplicationRequest,
} from '@learnwren/shared-data-models';

@Injectable({ providedIn: 'root' })
export class InstructorApplicationService {
  private readonly http = inject(HttpClient);
  private readonly url = '/api/profile/instructor-application';

  getApplication(): Promise<InstructorApplicationView> {
    return firstValueFrom(this.http.get<InstructorApplicationView>(this.url));
  }

  submit(input: SubmitInstructorApplicationRequest): Promise<InstructorApplicationView> {
    return firstValueFrom(this.http.post<InstructorApplicationView>(this.url, input));
  }
}
