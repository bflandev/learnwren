import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { AuthenticatedUser } from '@learnwren/web-auth';
import type { ProfilePictureErrorCode } from '@learnwren/shared-data-models';

const MAX_BYTES = 2_000_000;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png']);

export type LocalValidation = { ok: true } | { ok: false; reason: string };

export class ProfilePictureError extends Error {
  constructor(
    public readonly code: ProfilePictureErrorCode | 'UNKNOWN',
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ProfilePictureError';
  }
}

@Injectable({ providedIn: 'root' })
export class ProfilePictureService {
  private readonly http = inject(HttpClient);

  validateLocally(file: File): LocalValidation {
    if (!ALLOWED_MIME.has(file.type)) {
      return { ok: false, reason: 'Profile picture must be JPEG or PNG.' };
    }
    if (file.size > MAX_BYTES) {
      return { ok: false, reason: 'Profile picture must be 2 MB or smaller.' };
    }
    return { ok: true };
  }

  async upload(file: File): Promise<AuthenticatedUser> {
    const body = new FormData();
    body.append('file', file);
    try {
      return await firstValueFrom(
        this.http.put<AuthenticatedUser>('/api/profile/picture', body, {
          withCredentials: true,
        }),
      );
    } catch (err) {
      throw this.toTyped(err);
    }
  }

  async remove(): Promise<AuthenticatedUser> {
    try {
      return await firstValueFrom(
        this.http.delete<AuthenticatedUser>('/api/profile/picture', {
          withCredentials: true,
        }),
      );
    } catch (err) {
      throw this.toTyped(err);
    }
  }

  private toTyped(err: unknown): ProfilePictureError {
    if (err instanceof HttpErrorResponse && err.error?.error?.code) {
      return new ProfilePictureError(
        err.error.error.code,
        err.error.error.message ?? 'Profile picture upload failed.',
        err.error.error.details,
      );
    }
    return new ProfilePictureError('UNKNOWN', 'Network error.');
  }
}
