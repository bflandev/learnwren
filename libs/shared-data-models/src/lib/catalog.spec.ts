import { describe, expect, it } from 'vitest';

import { CATALOG_PAGE_SIZE, CATALOG_SORT_OPTIONS } from '../index';
import type { CourseCatalogDetail, CourseSummary } from './catalog';

describe('catalog read-model', () => {
  it('exposes the three catalogue sort options', () => {
    expect(CATALOG_SORT_OPTIONS).toEqual(['NEWEST', 'ALPHABETICAL', 'POPULAR']);
  });

  it('fixes the catalogue page size at 20', () => {
    expect(CATALOG_PAGE_SIZE).toBe(20);
  });
});

describe('CourseSummary — cover image', () => {
  it('accepts a summary with coverImageUrl', () => {
    const s: CourseSummary = {
      id: 'c1' as CourseSummary['id'],
      title: 'T',
      description: 'D',
      instructorDisplayName: 'X',
      publishedAt: '2026-05-12T00:00:00.000Z' as CourseSummary['publishedAt'],
      coverImageUrl: 'https://cdn.example/course-covers/c1/cover.jpg?v=2026-05-12T00:00:00.000Z',
    };
    expect(s.coverImageUrl).toContain('cover.jpg');
  });
});

describe('CourseCatalogDetail — cover image', () => {
  it('accepts a detail with coverImageUrl', () => {
    const d: CourseCatalogDetail = {
      id: 'c1' as CourseCatalogDetail['id'],
      title: 'T',
      description: 'D',
      instructorDisplayName: 'X',
      lessonCount: 0,
      modules: [],
      publishedAt: '2026-05-12T00:00:00.000Z' as CourseCatalogDetail['publishedAt'],
      coverImageUrl: 'https://cdn.example/course-covers/c1/cover.jpg?v=2026-05-12T00:00:00.000Z',
    };
    expect(d.coverImageUrl).toContain('cover.jpg');
  });
});
