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
      instructorId: 'u1' as CourseSummary['instructorId'],
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
      instructorId: 'u1' as CourseCatalogDetail['instructorId'],
      instructorDisplayName: 'X',
      lessonCount: 0,
      modules: [],
      publishedAt: '2026-05-12T00:00:00.000Z' as CourseCatalogDetail['publishedAt'],
      coverImageUrl: 'https://cdn.example/course-covers/c1/cover.jpg?v=2026-05-12T00:00:00.000Z',
    };
    expect(d.coverImageUrl).toContain('cover.jpg');
  });
});

describe('CourseSummary — instructor avatar fields', () => {
  it('exposes instructorId and accepts optional instructorPhotoUrl', () => {
    const s: CourseSummary = {
      id: 'c1' as CourseSummary['id'],
      title: 'Intro',
      description: 'x',
      instructorId: 'u1' as CourseSummary['instructorId'],
      instructorDisplayName: 'Ada',
      instructorPhotoUrl: 'https://example.com/p/u1/avatar.jpg?v=…',
      publishedAt: '2026-05-28T00:00:00.000Z' as CourseSummary['publishedAt'],
    };
    expect(s.instructorId).toBe('u1');
    expect(s.instructorPhotoUrl).toContain('avatar.jpg');
  });

  it('accepts CourseSummary with no instructorPhotoUrl', () => {
    const s: CourseSummary = {
      id: 'c1' as CourseSummary['id'],
      title: 'Intro',
      description: 'x',
      instructorId: 'u1' as CourseSummary['instructorId'],
      instructorDisplayName: 'Ada',
      publishedAt: '2026-05-28T00:00:00.000Z' as CourseSummary['publishedAt'],
    };
    expect(s.instructorPhotoUrl).toBeUndefined();
  });
});

describe('CourseCatalogDetail — instructor block', () => {
  it('carries instructorId, optional photoUrl, optional biography', () => {
    const d: CourseCatalogDetail = {
      id: 'c1' as CourseCatalogDetail['id'],
      title: 'Intro',
      description: 'x',
      instructorId: 'u1' as CourseCatalogDetail['instructorId'],
      instructorDisplayName: 'Ada',
      instructorPhotoUrl: 'https://example.com/p/u1/avatar.jpg?v=…',
      instructorBiography: 'Mathematician.',
      lessonCount: 0,
      modules: [],
      publishedAt: '2026-05-28T00:00:00.000Z' as CourseCatalogDetail['publishedAt'],
    };
    expect(d.instructorBiography).toBe('Mathematician.');
  });

  it('accepts CourseCatalogDetail without photoUrl or biography', () => {
    const d: CourseCatalogDetail = {
      id: 'c1' as CourseCatalogDetail['id'],
      title: 'Intro',
      description: 'x',
      instructorId: 'u1' as CourseCatalogDetail['instructorId'],
      instructorDisplayName: 'Ada',
      lessonCount: 0,
      modules: [],
      publishedAt: '2026-05-28T00:00:00.000Z' as CourseCatalogDetail['publishedAt'],
    };
    expect(d.instructorBiography).toBeUndefined();
    expect(d.instructorPhotoUrl).toBeUndefined();
  });
});
