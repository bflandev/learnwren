import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CatalogSort,
  CourseCatalogDetail,
  CourseCatalogPage,
  CourseCategory,
  CourseDifficulty,
} from '@learnwren/shared-data-models';

export interface CatalogQueryParams {
  page?: number;
  sort?: CatalogSort;
  category?: CourseCategory;
  difficulty?: CourseDifficulty;
}

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);

  getCatalogue(params: CatalogQueryParams): Promise<CourseCatalogPage> {
    let httpParams = new HttpParams();
    if (params.page) httpParams = httpParams.set('page', params.page);
    if (params.sort) httpParams = httpParams.set('sort', params.sort);
    if (params.category) httpParams = httpParams.set('category', params.category);
    if (params.difficulty) httpParams = httpParams.set('difficulty', params.difficulty);
    return firstValueFrom(
      this.http.get<CourseCatalogPage>('/api/catalog', { params: httpParams }),
    );
  }

  search(q: string, page?: number): Promise<CourseCatalogPage> {
    let httpParams = new HttpParams().set('q', q);
    if (page) httpParams = httpParams.set('page', page);
    return firstValueFrom(
      this.http.get<CourseCatalogPage>('/api/catalog/search', { params: httpParams }),
    );
  }

  getCourseDetail(id: string): Promise<CourseCatalogDetail> {
    return firstValueFrom(this.http.get<CourseCatalogDetail>(`/api/catalog/${id}`));
  }
}
