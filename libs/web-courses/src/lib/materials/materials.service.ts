import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import type {
  CourseId,
  LessonId,
  Material,
  MaterialId,
  ModuleId,
} from '@learnwren/shared-data-models';

const OPTS = { withCredentials: true } as const;

export interface CreateMaterialUploadPayload {
  filename: string;
  sizeBytes: number;
}

export interface CreateMaterialUploadResponse {
  materialId: MaterialId;
  uploadUrl: string;
  expiresAt: string;
}

export interface MaterialDownloadUrlResponse {
  downloadUrl: string;
  expiresAt: string;
}

@Injectable({ providedIn: 'root' })
export class MaterialsService {
  private readonly http = inject(HttpClient);

  createUploadUrl(
    cid: CourseId,
    mid: ModuleId,
    lid: LessonId,
    payload: CreateMaterialUploadPayload,
  ): Observable<CreateMaterialUploadResponse> {
    return this.http.post<CreateMaterialUploadResponse>(
      `/api/courses/${cid}/modules/${mid}/lessons/${lid}/materials/upload-url`,
      payload,
      OPTS,
    );
  }

  listMaterials(cid: CourseId, mid: ModuleId, lid: LessonId): Observable<Material[]> {
    return this.http.get<Material[]>(
      `/api/courses/${cid}/modules/${mid}/lessons/${lid}/materials`,
      OPTS,
    );
  }

  complete(matId: MaterialId): Observable<Material> {
    return this.http.post<Material>(`/api/materials/${matId}/complete`, {}, OPTS);
  }

  rename(matId: MaterialId, displayName: string): Observable<Material> {
    return this.http.patch<Material>(`/api/materials/${matId}`, { displayName }, OPTS);
  }

  remove(matId: MaterialId): Observable<void> {
    return this.http.delete<void>(`/api/materials/${matId}`, OPTS);
  }

  getDownloadUrl(matId: MaterialId): Observable<MaterialDownloadUrlResponse> {
    return this.http.get<MaterialDownloadUrlResponse>(
      `/api/materials/${matId}/download-url`,
      OPTS,
    );
  }
}
