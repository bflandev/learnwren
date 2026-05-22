import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CourseId, LessonId, MaterialId, ModuleId } from '@learnwren/shared-data-models';

import { MaterialsService } from './materials.service';

describe('MaterialsService (web)', () => {
  let svc: MaterialsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MaterialsService, provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(MaterialsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('createUploadUrl POSTs to the lesson-scoped upload-url route', () => {
    svc
      .createUploadUrl('c1' as CourseId, 'm1' as ModuleId, 'l1' as LessonId, {
        filename: 'a.pdf',
        sizeBytes: 12,
      })
      .subscribe();
    const req = http.expectOne('/api/courses/c1/modules/m1/lessons/l1/materials/upload-url');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual({ filename: 'a.pdf', sizeBytes: 12 });
    req.flush({ materialId: 'mat1', uploadUrl: 'u', expiresAt: 'T' });
  });

  it('listMaterials GETs the lesson-scoped materials route', () => {
    svc.listMaterials('c1' as CourseId, 'm1' as ModuleId, 'l1' as LessonId).subscribe();
    const req = http.expectOne('/api/courses/c1/modules/m1/lessons/l1/materials');
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush([]);
  });

  it('complete POSTs to the material complete route', () => {
    svc.complete('mat1' as MaterialId).subscribe();
    const req = http.expectOne('/api/materials/mat1/complete');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    expect(req.request.withCredentials).toBe(true);
    req.flush({});
  });

  it('rename PATCHes the display name', () => {
    svc.rename('mat1' as MaterialId, 'New Name').subscribe();
    const req = http.expectOne('/api/materials/mat1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ displayName: 'New Name' });
    expect(req.request.withCredentials).toBe(true);
    req.flush({});
  });

  it('remove DELETEs the material', () => {
    svc.remove('mat1' as MaterialId).subscribe();
    const req = http.expectOne('/api/materials/mat1');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.withCredentials).toBe(true);
    req.flush(null);
  });

  it('getDownloadUrl GETs the download-url route', () => {
    svc.getDownloadUrl('mat1' as MaterialId).subscribe();
    const req = http.expectOne('/api/materials/mat1/download-url');
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ downloadUrl: 'd', expiresAt: 'T' });
  });
});
