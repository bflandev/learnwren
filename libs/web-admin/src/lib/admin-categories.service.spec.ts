import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { CategoryId } from '@learnwren/shared-data-models';

import { AdminCategoriesService } from './admin-categories.service';

const DESIGN = { id: 'DESIGN', name: 'Design', createdAt: 'x', updatedAt: 'x' };

describe('AdminCategoriesService', () => {
  let service: AdminCategoriesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminCategoriesService);
    http = TestBed.inject(HttpTestingController);
  });

  it('list GETs the public /api/categories endpoint', async () => {
    const promise = service.list();
    const req = http.expectOne('/api/categories');
    expect(req.request.method).toBe('GET');
    req.flush([DESIGN]);
    expect(await promise).toEqual([DESIGN]);
  });

  it('create POSTs the name', async () => {
    const promise = service.create('Design');
    const req = http.expectOne('/api/admin/categories');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Design' });
    req.flush(DESIGN);
    expect(await promise).toEqual(DESIGN);
  });

  it('rename PATCHes the category by id', async () => {
    const promise = service.rename('DESIGN' as CategoryId, 'Design & UX');
    const req = http.expectOne('/api/admin/categories/DESIGN');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: 'Design & UX' });
    req.flush({ ...DESIGN, name: 'Design & UX' });
    expect((await promise).name).toBe('Design & UX');
  });

  it('delete sends reassignTo as a query param', async () => {
    const promise = service.delete('DESIGN' as CategoryId, 'BUSINESS' as CategoryId);
    const req = http.expectOne(
      (r) => r.url === '/api/admin/categories/DESIGN' && r.params.get('reassignTo') === 'BUSINESS',
    );
    expect(req.request.method).toBe('DELETE');
    req.flush({ reassignedCourses: 2 });
    expect(await promise).toEqual({ reassignedCourses: 2 });
  });
});
