import type { CourseId, ISODateString } from './common';
import type { CourseCategory, CourseDifficulty } from './course';

/**
 * One card in the catalogue or a search-results list. Carries only fields
 * stored on the course document plus the instructor's resolved display name.
 * Deliberately excludes lessonCount — computing it per card would require an
 * N-course fan-out into the lessons subcollection.
 */
export interface CourseSummary {
  id: CourseId;
  title: string;
  description: string;
  category?: CourseCategory;
  difficulty?: CourseDifficulty;
  instructorDisplayName: string;
  publishedAt: ISODateString;
}

/** Paginated envelope shared by the catalogue and search responses. */
export interface CourseCatalogPage {
  items: CourseSummary[];
  page: number; // 1-based
  pageSize: number; // constant — CATALOG_PAGE_SIZE
  total: number; // total courses matching the query, before pagination
  totalPages: number; // ceil(total / pageSize); 0 when total is 0
}

/** Catalogue sort options. POPULAR (by enrolment count) is deferred to Slice B. */
export const CATALOG_SORT_OPTIONS = ['NEWEST', 'ALPHABETICAL'] as const;
export type CatalogSort = (typeof CATALOG_SORT_OPTIONS)[number];

/** Courses shown per page. UC-05-01 requires "at least 20 per page". */
export const CATALOG_PAGE_SIZE = 20;

/** A module in the public course outline — titles only, no IDs, no content. */
export interface CatalogModuleOutline {
  title: string;
  lessons: { title: string }[];
}

/** The full public course detail page payload. */
export interface CourseCatalogDetail {
  id: CourseId;
  title: string;
  description: string;
  longDescription?: string;
  category?: CourseCategory;
  difficulty?: CourseDifficulty;
  instructorDisplayName: string;
  lessonCount: number;
  modules: CatalogModuleOutline[];
  publishedAt: ISODateString;
}
