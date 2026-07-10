import type { CategoriesErrorCode } from '@learnwren/shared-data-models';

export class CategoriesException extends Error {
  constructor(
    public readonly code: CategoriesErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CategoriesException';
  }
}

export class CategoryValidationException extends CategoriesException {
  constructor(message: string) {
    super('VALIDATION_FAILED', message, 400);
  }
}

export class CategoryNotFoundException extends CategoriesException {
  constructor() {
    super('CATEGORY_NOT_FOUND', 'Category not found.', 404);
  }
}

export class CategoryExistsException extends CategoriesException {
  constructor() {
    super('CATEGORY_EXISTS', 'A category with this name already exists.', 409);
  }
}

export class CategoryInUseException extends CategoriesException {
  constructor(courseCount: number) {
    super(
      'CATEGORY_IN_USE',
      'Courses are assigned to this category — pass reassignTo to move them before deleting.',
      409,
      { courseCount },
    );
  }
}

export class LastCategoryException extends CategoriesException {
  constructor() {
    super('LAST_CATEGORY', 'The last remaining category cannot be deleted.', 409);
  }
}
