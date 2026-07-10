import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { CourseCategoryDoc } from '@learnwren/shared-data-models';

/**
 * Public category list (US-08-02). Categories are admin-managed; the API
 * returns them alphabetically by display name. Consumed by the catalogue
 * filter bar and the course creation form.
 */
@Injectable({ providedIn: 'root' })
export class CategoriesService {
  private readonly http = inject(HttpClient);

  list(): Promise<CourseCategoryDoc[]> {
    return firstValueFrom(this.http.get<CourseCategoryDoc[]>('/api/categories'));
  }
}
