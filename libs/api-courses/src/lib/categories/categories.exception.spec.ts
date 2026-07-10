import { describe, expect, it } from 'vitest';

import {
  CategoriesException,
  CategoryExistsException,
  CategoryInUseException,
  CategoryNotFoundException,
  CategoryValidationException,
  LastCategoryException,
} from './categories.exception';

describe('CategoriesException family', () => {
  it('CategoriesException carries code, message, status, name, and optional details', () => {
    const ex = new CategoriesException('VALIDATION_FAILED', 'bad input', 400, { foo: 'bar' });
    expect(ex.code).toBe('VALIDATION_FAILED');
    expect(ex.message).toBe('bad input');
    expect(ex.status).toBe(400);
    expect(ex.details).toEqual({ foo: 'bar' });
    // `name` is read by exception filters that dispatch on the constructor
    // name — a StringLiteral mutant blanking it would break that dispatch.
    expect(ex.name).toBe('CategoriesException');
  });

  it('CategoryValidationException is 400 with code VALIDATION_FAILED and the given message', () => {
    const ex = new CategoryValidationException('name is bad');
    expect(ex.code).toBe('VALIDATION_FAILED');
    expect(ex.status).toBe(400);
    expect(ex.message).toBe('name is bad');
  });

  it('CategoryNotFoundException is 404 with code CATEGORY_NOT_FOUND', () => {
    const ex = new CategoryNotFoundException();
    expect(ex.code).toBe('CATEGORY_NOT_FOUND');
    expect(ex.status).toBe(404);
    expect(ex.message).toBe('Category not found.');
  });

  it('CategoryExistsException is 409 with code CATEGORY_EXISTS', () => {
    const ex = new CategoryExistsException();
    expect(ex.code).toBe('CATEGORY_EXISTS');
    expect(ex.status).toBe(409);
    expect(ex.message).toBe('A category with this name already exists.');
  });

  it('CategoryInUseException is 409 with code CATEGORY_IN_USE and courseCount details', () => {
    const ex = new CategoryInUseException(3);
    expect(ex.code).toBe('CATEGORY_IN_USE');
    expect(ex.status).toBe(409);
    expect(ex.details).toEqual({ courseCount: 3 });
    expect(ex.message).toBe(
      'Courses are assigned to this category — pass reassignTo to move them before deleting.',
    );
  });

  it('LastCategoryException is 409 with code LAST_CATEGORY', () => {
    const ex = new LastCategoryException();
    expect(ex.code).toBe('LAST_CATEGORY');
    expect(ex.status).toBe(409);
    expect(ex.message).toBe('The last remaining category cannot be deleted.');
  });
});
