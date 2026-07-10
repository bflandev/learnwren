import type { CategoryId, ISODateString } from './common';

/**
 * An admin-managed course category (US-08-02). Stored in the `courseCategories`
 * collection with the doc id doubling as the stable slug referenced by
 * `Course.category` — rename changes `name` only and never touches course docs.
 */
export interface CourseCategoryDoc {
  id: CategoryId;
  name: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Category display-name length cap, enforced server-side and mirrored in the admin form. */
export const CATEGORY_NAME_MAX_LENGTH = 60;
