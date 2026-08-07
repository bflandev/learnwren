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
}

export const NOW = '2026-08-01T00:00:00.000Z';

export const CATEGORIES = [
  { id: 'design', name: 'Design' },
  { id: 'engineering', name: 'Engineering' },
];

export const COURSE_CARD = {
  id: 'c-1',
  title: 'Introduction to Wren',
  description: 'A short course used by the accessibility sweep.',
  category: 'engineering',
  difficulty: 'BEGINNER',
  instructorName: 'Ingrid Instructor',
  enrollmentCount: 12,
  coverImageUrl: null,
  publishedAt: NOW,
};

export const CATALOG_LIST = { courses: [COURSE_CARD], total: 1, page: 1, pageSize: 12 };

export const COURSE_DETAIL = {
  ...COURSE_CARD,
  instructorId: 'a11y-instructor',
  instructorBiography: 'Teaches things.',
  moduleCount: 1,
  lessonCount: 2,
  status: 'PUBLISHED',
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
  },
  {
    name: 'search results',
    path: '/search?q=wren',
    role: 'guest',
    stubs: async (page) => {
      await stubJson(page, '**/api/catalog/search**', CATALOG_LIST);
    },
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
  },
];
