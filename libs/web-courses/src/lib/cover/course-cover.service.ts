import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { CourseId, ISODateString } from '@learnwren/shared-data-models';

const MAX_BYTES = 10_000_000;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png']);

export interface UploadCoverResult {
  coverImageUrl: string;
  updatedAt: ISODateString;
}

export type LocalValidation = { ok: true } | { ok: false; reason: string };

@Injectable({ providedIn: 'root' })
export class CourseCoverService {
  private readonly http = inject(HttpClient);

  validateLocally(file: File): LocalValidation {
    if (!ALLOWED_MIME.has(file.type)) {
      return { ok: false, reason: 'Cover image must be JPEG or PNG.' };
    }
    if (file.size > MAX_BYTES) {
      return { ok: false, reason: 'Cover image exceeds the 10 MB limit.' };
    }
    return { ok: true };
  }

  upload(courseId: CourseId, file: File): Promise<UploadCoverResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    return firstValueFrom(
      this.http.put<UploadCoverResult>(`/api/courses/${courseId}/cover`, form, {
        withCredentials: true,
      }),
    );
  }

  async remove(courseId: CourseId): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`/api/courses/${courseId}/cover`, { withCredentials: true }),
    );
  }
}
