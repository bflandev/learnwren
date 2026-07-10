import type { CategoryId } from '@learnwren/shared-data-models';

/**
 * The categories every deployment starts with (US-08-02). The ids match the
 * historical hardcoded `COURSE_CATEGORIES` union values, so course documents
 * written before categories became admin-managed resolve without migration.
 * Seeded lazily by CategoriesRepository the first time the collection is read.
 */
export const DEFAULT_COURSE_CATEGORIES: readonly { id: CategoryId; name: string }[] = [
  { id: 'PROGRAMMING' as CategoryId, name: 'Programming' },
  { id: 'DESIGN' as CategoryId, name: 'Design' },
  { id: 'BUSINESS' as CategoryId, name: 'Business' },
  { id: 'MARKETING' as CategoryId, name: 'Marketing' },
  { id: 'PERSONAL_DEVELOPMENT' as CategoryId, name: 'Personal Development' },
  { id: 'OTHER' as CategoryId, name: 'Other' },
];
