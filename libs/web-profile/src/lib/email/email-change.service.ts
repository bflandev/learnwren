import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  ChangeEmailRequest,
  ConfirmEmailChangeResponse,
} from '@learnwren/shared-data-models';

@Injectable({ providedIn: 'root' })
export class EmailChangeService {
  private readonly http = inject(HttpClient);

  requestChange(input: ChangeEmailRequest): Promise<void> {
    return firstValueFrom(this.http.post<void>('/api/profile/email', input));
  }

  confirm(): Promise<ConfirmEmailChangeResponse> {
    return firstValueFrom(
      this.http.post<ConfirmEmailChangeResponse>('/api/profile/email/confirm', {}),
    );
  }
}
