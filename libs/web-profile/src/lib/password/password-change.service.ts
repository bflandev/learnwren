import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { ChangePasswordRequest } from '@learnwren/shared-data-models';

@Injectable({ providedIn: 'root' })
export class PasswordChangeService {
  private readonly http = inject(HttpClient);

  change(input: ChangePasswordRequest): Promise<void> {
    return firstValueFrom(this.http.post<void>('/api/profile/password', input));
  }
}
