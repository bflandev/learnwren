import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CourseCatalogDetail, CourseCatalogPage, CourseId } from '@learnwren/shared-data-models';

import { CatalogController } from './catalog.controller';
import type { CatalogService } from './catalog.service';

const emptyPage: CourseCatalogPage = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0,
};

describe('CatalogController', () => {
  let svc: { listCatalogue: ReturnType<typeof vi.fn>; search: ReturnType<typeof vi.fn>; getCourseDetail: ReturnType<typeof vi.fn> };
  let controller: CatalogController;

  beforeEach(() => {
    svc = {
      listCatalogue: vi.fn().mockResolvedValue(emptyPage),
      search: vi.fn().mockResolvedValue(emptyPage),
      getCourseDetail: vi.fn(),
    };
    controller = new CatalogController(svc as unknown as CatalogService);
  });

  it('delegates GET /catalog to listCatalogue', async () => {
    const result = await controller.list({ page: 2, sort: 'NEWEST' });
    expect(svc.listCatalogue).toHaveBeenCalledWith({ page: 2, sort: 'NEWEST' });
    expect(result).toBe(emptyPage);
  });

  it('delegates GET /catalog/search to search', async () => {
    await controller.search({ q: 'rust', page: 1 });
    expect(svc.search).toHaveBeenCalledWith({ q: 'rust', page: 1 });
  });

  it('delegates GET /catalog/:cid to getCourseDetail', async () => {
    const detail = { id: 'c-1' } as CourseCatalogDetail;
    svc.getCourseDetail.mockResolvedValue(detail);
    const result = await controller.detail('c-1' as CourseId);
    expect(svc.getCourseDetail).toHaveBeenCalledWith('c-1');
    expect(result).toBe(detail);
  });

  // The catalog is public, read-only, and identical for every anonymous
  // visitor, so it is the one surface worth caching at the browser/CDN edge —
  // otherwise every hit re-runs listPublished() inside a cold-start-prone
  // function. `@Header` attaches Nest's HEADERS_METADATA ('__headers__') to the
  // route method; assert it directly rather than bootstrapping the full app.
  function cacheControlOf(method: (...args: never[]) => unknown): string | undefined {
    const headers =
      (Reflect.getMetadata('__headers__', method) as { name: string; value: string }[] | undefined) ??
      [];
    return headers.find((h) => h.name.toLowerCase() === 'cache-control')?.value;
  }

  it('sets a public, time-bounded Cache-Control header on every read endpoint', () => {
    for (const method of [controller.list, controller.search, controller.detail]) {
      const value = cacheControlOf(method);
      expect(value, `Cache-Control on ${method.name}`).toBeDefined();
      expect(value).toContain('public');
      expect(value).toMatch(/max-age=\d+/);
    }
  });
});
