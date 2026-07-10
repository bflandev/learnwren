import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { CategoryId, CourseCategoryDoc } from '@learnwren/shared-data-models';

const BASE = '/api/admin/categories';

/** Admin category management (US-08-02). Listing uses the public endpoint. */
@Injectable({ providedIn: 'root' })
export class AdminCategoriesService {
  private readonly http = inject(HttpClient);

  list(): Promise<CourseCategoryDoc[]> {
    return firstValueFrom(this.http.get<CourseCategoryDoc[]>('/api/categories'));
  }

  create(name: string): Promise<CourseCategoryDoc> {
    return firstValueFrom(this.http.post<CourseCategoryDoc>(BASE, { name }));
  }

  rename(id: CategoryId, name: string): Promise<CourseCategoryDoc> {
    return firstValueFrom(this.http.patch<CourseCategoryDoc>(`${BASE}/${id}`, { name }));
  }

  delete(id: CategoryId, reassignTo: CategoryId): Promise<{ reassignedCourses: number }> {
    const params = new HttpParams().set('reassignTo', reassignTo);
    return firstValueFrom(
      this.http.delete<{ reassignedCourses: number }>(`${BASE}/${id}`, { params }),
    );
  }
}
