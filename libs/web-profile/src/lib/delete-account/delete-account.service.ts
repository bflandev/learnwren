import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { DeleteAccountRequest } from '@learnwren/shared-data-models';

@Injectable({ providedIn: 'root' })
export class DeleteAccountService {
  private readonly http = inject(HttpClient);

  deleteAccount(input: DeleteAccountRequest): Promise<void> {
    return firstValueFrom(this.http.delete<void>('/api/profile/account', { body: input }));
  }
}
