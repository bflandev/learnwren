import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  MeResponse,
  ProfileView,
  UpdateProfileInput,
} from '@learnwren/shared-data-models';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);

  getProfile(): Promise<ProfileView> {
    return firstValueFrom(this.http.get<ProfileView>('/api/profile'));
  }

  updateProfile(input: UpdateProfileInput): Promise<MeResponse> {
    return firstValueFrom(this.http.patch<MeResponse>('/api/profile', input));
  }
}
