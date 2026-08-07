import type { Page } from '@playwright/test';

import { stubJson, type A11yRole } from './a11y-stubs';

export interface A11yRoute {
  /** Human label used as the test title. */
  name: string;
  /** Path to navigate to. */
  path: string;
  /** Role to stub for GET /api/auth/me. */
  role: A11yRole;
  /** Stub the page's data calls. Register broad globs BEFORE specific paths. */
  stubs?: (page: Page) => Promise<void>;
  /** A selector that must be visible before scanning, so axe sees settled DOM. */
  readySelector?: string;
  /**
   * Text that must be visible before scanning — proof the route rendered
   * its REAL content rather than an error/empty state (a stubbed page can
   * "settle" on an error paragraph just as fast as on real data, and that
   * paragraph still matches `readySelector`). Required whenever `stubs` is
   * set: fixture-shape bugs (wrong field name, missing required field) throw
   * inside the component and never satisfy this expectation, failing the
   * test instead of silently scanning three lines of chrome.
   */
  expectText?: string;
}

export const NOW = '2026-08-01T00:00:00.000Z';

export const CATEGORIES = [
  { id: 'design', name: 'Design' },
  { id: 'engineering', name: 'Engineering' },
];

// Shape verified against CourseSummary, libs/shared-data-models/src/lib/catalog.ts:11-21.
// instructorDisplayName (not instructorName) — course-card.component.html:16,23 reads it.
export const COURSE_CARD = {
  id: 'c-1',
  title: 'Introduction to Wren',
  description: 'A short course used by the accessibility sweep.',
  category: 'engineering',
  difficulty: 'BEGINNER',
  instructorId: 'a11y-instructor',
  instructorDisplayName: 'Ingrid Instructor',
  publishedAt: NOW,
};

// Shape verified against CourseCatalogPage, catalog.ts:24-30 — `items`, not
// `courses`; `totalPages` required (catalog-page.component.html:17,32 reads
// result()!.items.length and result()!.totalPages).
export const CATALOG_LIST = {
  items: [COURSE_CARD],
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
};

// Shape verified against CourseCatalogDetail, catalog.ts:46-61 — modules is
// required (course-detail-page.component.html:77 binds it straight into
// ModuleOutlineComponent, which does `modules().length` — undefined throws).
const FIRST_LESSON_TITLE = 'Welcome to Wren';

export const COURSE_DETAIL = {
  ...COURSE_CARD,
  instructorBiography: 'Teaches things.',
  lessonCount: 2,
  modules: [
    {
      title: 'Getting started',
      lessons: [{ id: 'lesson-1', title: FIRST_LESSON_TITLE }],
    },
  ],
};

export const GUEST_ROUTES: A11yRoute[] = [
  { name: 'landing', path: '/', role: 'guest' },
  { name: 'login', path: '/login', role: 'guest' },
  { name: 'register', path: '/register', role: 'guest' },
  { name: 'register confirm', path: '/register/confirm', role: 'guest' },
  { name: 'forgot password', path: '/forgot-password', role: 'guest' },
  { name: 'unlock', path: '/auth/unlock', role: 'guest' },
  {
    name: 'catalogue',
    path: '/catalog',
    role: 'guest',
    stubs: async (page) => {
      await stubJson(page, '**/api/categories', CATEGORIES);
      await stubJson(page, '**/api/catalog**', CATALOG_LIST);
    },
    expectText: COURSE_CARD.title,
  },
  {
    name: 'search results',
    path: '/search?q=wren',
    role: 'guest',
    stubs: async (page) => {
      await stubJson(page, '**/api/catalog/search**', CATALOG_LIST);
    },
    expectText: COURSE_CARD.title,
  },
  {
    name: 'course detail',
    path: '/catalog/c-1',
    role: 'guest',
    stubs: async (page) => {
      // Broad glob first, specific path last — handlers match in REVERSE order.
      await stubJson(page, '**/api/catalog**', CATALOG_LIST);
      await stubJson(page, '**/api/catalog/c-1', COURSE_DETAIL);
    },
    expectText: FIRST_LESSON_TITLE,
  },
];
