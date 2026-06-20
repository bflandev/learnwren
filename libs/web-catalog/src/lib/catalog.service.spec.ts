import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CatalogService } from './catalog.service';

describe('CatalogService', () => {
  let service: CatalogService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CatalogService);
    http = TestBed.inject(HttpTestingController);
  });

  it('GET /api/catalog with filter and sort query params', async () => {
    const promise = service.getCatalogue({ page: 2, sort: 'NEWEST', category: 'PROGRAMMING', difficulty: 'BEGINNER' });
    const req = http.expectOne(
      (r) => r.url === '/api/catalog' && r.params.get('page') === '2',
    );
    expect(req.request.params.get('sort')).toBe('NEWEST');
    expect(req.request.params.get('category')).toBe('PROGRAMMING');
    expect(req.request.params.get('difficulty')).toBe('BEGINNER');
    req.flush({ items: [], page: 2, pageSize: 20, total: 0, totalPages: 0 });
    const result = await promise;
    expect(result.page).toBe(2);
  });

  it('GET /api/catalog omits optional params when not provided', async () => {
    const promise = service.getCatalogue({});
    const req = http.expectOne((r) => r.url === '/api/catalog');
    expect(req.request.params.has('page')).toBe(false);
    expect(req.request.params.has('sort')).toBe(false);
    expect(req.request.params.has('category')).toBe(false);
    expect(req.request.params.has('difficulty')).toBe(false);
    req.flush({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    await promise;
  });

  it('GET /api/catalog/search omits page when not provided', async () => {
    const promise = service.search('rust');
    const req = http.expectOne((r) => r.url === '/api/catalog/search');
    expect(req.request.params.get('q')).toBe('rust');
    expect(req.request.params.has('page')).toBe(false);
    req.flush({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    await promise;
  });

  it('GET /api/catalog/search with the q param', async () => {
    const promise = service.search('rust', 1);
    const req = http.expectOne((r) => r.url === '/api/catalog/search');
    expect(req.request.params.get('q')).toBe('rust');
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    const result = await promise;
    expect(result.page).toBe(1);
  });

  it('GET /api/catalog/:id for course detail', async () => {
    const promise = service.getCourseDetail('c-1');
    http.expectOne('/api/catalog/c-1').flush({ id: 'c-1' });
    const result = await promise;
    expect(result.id).toBe('c-1');
  });
});
