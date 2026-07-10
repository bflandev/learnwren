import { Injectable } from '@nestjs/common';

import { CATEGORY_NAME_MAX_LENGTH } from '@learnwren/shared-data-models';
import type { CategoryId, CourseCategoryDoc } from '@learnwren/shared-data-models';

import { CategoryValidationException } from './categories.exception';
import { CategoriesRepository } from './categories.repository';

/**
 * Derive the stable doc id from a display name: uppercase alphanumeric runs
 * joined by underscores ("Data Science & AI" → "DATA_SCIENCE_AI"), matching
 * the shape of the historical hardcoded category values.
 */
function slugify(name: string): string {
  // The first replace collapses runs, so at most ONE underscore can sit at
  // either end — anchored single-char trims are sufficient.
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_/, '')
    .replace(/_$/, '');
}

@Injectable()
export class CategoriesService {
  constructor(private readonly repo: CategoriesRepository) {}

  /** All categories, alphabetical by display name (AC 3). */
  async list(): Promise<CourseCategoryDoc[]> {
    const all = await this.repo.listAll();
    return [...all].sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(rawName: string): Promise<CourseCategoryDoc> {
    const name = this.validateName(rawName);
    const id = slugify(name);
    if (id.length === 0) {
      throw new CategoryValidationException(
        'Category name must contain at least one letter or digit.',
      );
    }
    return this.repo.create(id as CategoryId, name);
  }

  async rename(id: CategoryId, rawName: string): Promise<CourseCategoryDoc> {
    const name = this.validateName(rawName);
    return this.repo.rename(id, name);
  }

  async remove(
    id: CategoryId,
    reassignTo: CategoryId | undefined,
  ): Promise<{ reassignedCourses: number }> {
    if (reassignTo === id) {
      throw new CategoryValidationException('reassignTo must differ from the deleted category.');
    }
    return this.repo.deleteWithReassign(id, reassignTo);
  }

  private validateName(rawName: string): string {
    const name = rawName.trim();
    if (name.length === 0) {
      throw new CategoryValidationException('Category name must not be empty.');
    }
    if (name.length > CATEGORY_NAME_MAX_LENGTH) {
      throw new CategoryValidationException(
        `Category name must be at most ${CATEGORY_NAME_MAX_LENGTH} characters.`,
      );
    }
    return name;
  }
}
