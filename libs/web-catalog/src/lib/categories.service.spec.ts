import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CategoriesService);
    http = TestBed.inject(HttpTestingController);
  });

  it('GET /api/categories returns the category list', async () => {
    const promise = service.list();
    const req = http.expectOne('/api/categories');
    expect(req.request.method).toBe('GET');
    req.flush([
      { id: 'DESIGN', name: 'Design', createdAt: 'x', updatedAt: 'x' },
    ]);
    const cats = await promise;
    expect(cats).toHaveLength(1);
    expect(cats[0].id).toBe('DESIGN');
  });
});
