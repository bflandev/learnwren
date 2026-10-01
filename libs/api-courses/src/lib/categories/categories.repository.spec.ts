import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createInMemoryDocumentStore,
  DOCUMENT_STORE,
  type DocumentStore,
  type InMemoryDocumentStore,
} from '@learnwren/api-document-store';
import type {
  CategoryId,
  Course,
  CourseCategoryDoc,
  CourseId,
  ISODateString,
  UserId,
} from '@learnwren/shared-data-models';

import {
  CategoryExistsException,
  CategoryInUseException,
  CategoryNotFoundException,
  LastCategoryException,
} from './categories.exception';
import { CategoriesRepository } from './categories.repository';
import { DEFAULT_COURSE_CATEGORIES } from './categories.seed';

const SEED_DATE = '2026-05-12T00:00:00.000Z' as ISODateString;
const NOW = new Date('2026-07-10T12:00:00.000Z');
const NOW_ISO = '2026-07-10T12:00:00.000Z' as ISODateString;

function makeCategory(overrides: Partial<CourseCategoryDoc> = {}): CourseCategoryDoc {
  return {
    id: 'DESIGN' as CategoryId,
    name: 'Design',
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
    ...overrides,
  };
}

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: 'cid-1' as CourseId,
    title: 'Intro to Wren',
    description: 'A course.',
    instructorId: 'uid-instructor-1' as UserId,
    status: 'DRAFT',
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
    ...overrides,
  };
}

async function buildRepo(fake: InMemoryDocumentStore): Promise<CategoriesRepository> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CategoriesRepository,
      { provide: DOCUMENT_STORE, useValue: fake as unknown as DocumentStore },
    ],
  }).compile();
  return moduleRef.get(CategoriesRepository);
}

describe('CategoriesRepository', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  describe('listAll (lazy seed)', () => {
    it('DEFAULT_COURSE_CATEGORIES carries the six historical ids with display names', () => {
      // Literal assertion — a mutant blanking any seed name would otherwise be
      // self-consistent with the seed-write test below.
      expect(DEFAULT_COURSE_CATEGORIES).toEqual([
        { id: 'PROGRAMMING', name: 'Programming' },
        { id: 'DESIGN', name: 'Design' },
        { id: 'BUSINESS', name: 'Business' },
        { id: 'MARKETING', name: 'Marketing' },
        { id: 'PERSONAL_DEVELOPMENT', name: 'Personal Development' },
        { id: 'OTHER', name: 'Other' },
      ]);
    });

    it('seeds the default categories when the collection is empty', async () => {
      const fake = createInMemoryDocumentStore();
      const repo = await buildRepo(fake);

      const listed = await repo.listAll();

      expect(listed).toHaveLength(DEFAULT_COURSE_CATEGORIES.length);
      for (const { id, name } of DEFAULT_COURSE_CATEGORIES) {
        expect(fake.__store.get(`courseCategories/${id}`)).toEqual({
          id,
          name,
          createdAt: NOW_ISO,
          updatedAt: NOW_ISO,
        });
      }
    });

    it('returns the stored categories without re-seeding when non-empty', async () => {
      const fake = createInMemoryDocumentStore({
        'courseCategories/DESIGN': makeCategory(),
      });
      const repo = await buildRepo(fake);

      const listed = await repo.listAll();

      expect(listed).toEqual([makeCategory()]);
      expect(fake.__store.get('courseCategories/PROGRAMMING')).toBeUndefined();
    });
  });

  describe('get', () => {
    it('returns the stored category', async () => {
      const fake = createInMemoryDocumentStore({ 'courseCategories/DESIGN': makeCategory() });
      const repo = await buildRepo(fake);

      expect(await repo.get('DESIGN' as CategoryId)).toEqual(makeCategory());
    });

    it('returns null for an unknown id in a non-empty collection', async () => {
      const fake = createInMemoryDocumentStore({ 'courseCategories/DESIGN': makeCategory() });
      const repo = await buildRepo(fake);

      expect(await repo.get('NOPE' as CategoryId)).toBeNull();
    });

    it('seeds the defaults on a miss against an empty collection, then resolves', async () => {
      const fake = createInMemoryDocumentStore();
      const repo = await buildRepo(fake);

      const got = await repo.get('PROGRAMMING' as CategoryId);

      expect(got?.name).toBe('Programming');
    });
  });

  describe('create', () => {
    it('writes the category with timestamps and returns it', async () => {
      const fake = createInMemoryDocumentStore({ 'courseCategories/DESIGN': makeCategory() });
      const repo = await buildRepo(fake);

      const created = await repo.create('DATA_SCIENCE' as CategoryId, 'Data Science');

      expect(created).toEqual({
        id: 'DATA_SCIENCE',
        name: 'Data Science',
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
      });
      expect(fake.__store.get('courseCategories/DATA_SCIENCE')).toEqual(created);
    });

    it('throws CategoryExistsException on an id collision', async () => {
      const fake = createInMemoryDocumentStore({ 'courseCategories/DESIGN': makeCategory() });
      const repo = await buildRepo(fake);

      await expect(repo.create('DESIGN' as CategoryId, 'Design')).rejects.toBeInstanceOf(
        CategoryExistsException,
      );
    });

    it('throws CategoryExistsException on an id collision even when the name differs', async () => {
      const fake = createInMemoryDocumentStore({
        'courseCategories/DESIGN': makeCategory(),
        'courseCategories/BUSINESS': makeCategory({ id: 'BUSINESS' as CategoryId, name: 'Business' }),
      });
      const repo = await buildRepo(fake);

      // Only DESIGN collides (by id, not name) — kills a some→every mutant and
      // an id-check-dropped mutant in one go.
      await expect(
        repo.create('DESIGN' as CategoryId, 'Totally Different'),
      ).rejects.toBeInstanceOf(CategoryExistsException);
    });

    it('throws CategoryExistsException on a case-insensitive name collision', async () => {
      const fake = createInMemoryDocumentStore({ 'courseCategories/DESIGN': makeCategory() });
      const repo = await buildRepo(fake);

      await expect(repo.create('DE_SIGN' as CategoryId, 'dEsIgN')).rejects.toBeInstanceOf(
        CategoryExistsException,
      );
    });

    it('seeds the defaults before creating into an empty collection', async () => {
      const fake = createInMemoryDocumentStore();
      const repo = await buildRepo(fake);

      await repo.create('DATA_SCIENCE' as CategoryId, 'Data Science');

      expect(fake.__store.get('courseCategories/PROGRAMMING')).toBeDefined();
      expect(fake.__store.get('courseCategories/DATA_SCIENCE')).toBeDefined();
    });
  });

  describe('rename', () => {
    it('updates name and updatedAt, preserving createdAt, and returns the doc', async () => {
      const fake = createInMemoryDocumentStore({ 'courseCategories/DESIGN': makeCategory() });
      const repo = await buildRepo(fake);

      const renamed = await repo.rename('DESIGN' as CategoryId, 'Design & UX');

      expect(renamed).toEqual({
        id: 'DESIGN',
        name: 'Design & UX',
        createdAt: SEED_DATE,
        updatedAt: NOW_ISO,
      });
      expect(fake.__store.get('courseCategories/DESIGN')).toEqual(renamed);
    });

    it('throws CategoryNotFoundException for an unknown id', async () => {
      const fake = createInMemoryDocumentStore({ 'courseCategories/DESIGN': makeCategory() });
      const repo = await buildRepo(fake);

      await expect(repo.rename('NOPE' as CategoryId, 'Nope')).rejects.toBeInstanceOf(
        CategoryNotFoundException,
      );
    });

    it('throws CategoryExistsException when another category holds the name (case-insensitive)', async () => {
      const fake = createInMemoryDocumentStore({
        'courseCategories/DESIGN': makeCategory(),
        'courseCategories/BUSINESS': makeCategory({ id: 'BUSINESS' as CategoryId, name: 'Business' }),
      });
      const repo = await buildRepo(fake);

      await expect(repo.rename('BUSINESS' as CategoryId, 'design')).rejects.toBeInstanceOf(
        CategoryExistsException,
      );
    });

    it('allows renaming a category to a different casing of its own name', async () => {
      const fake = createInMemoryDocumentStore({ 'courseCategories/DESIGN': makeCategory() });
      const repo = await buildRepo(fake);

      const renamed = await repo.rename('DESIGN' as CategoryId, 'DESIGN');

      expect(renamed.name).toBe('DESIGN');
    });
  });

  describe('deleteWithReassign', () => {
    const TWO_CATS = {
      'courseCategories/DESIGN': makeCategory(),
      'courseCategories/BUSINESS': makeCategory({ id: 'BUSINESS' as CategoryId, name: 'Business' }),
    };

    it('deletes an unused category without requiring reassignTo', async () => {
      const fake = createInMemoryDocumentStore(TWO_CATS);
      const repo = await buildRepo(fake);

      const result = await repo.deleteWithReassign('DESIGN' as CategoryId, undefined);

      expect(result).toEqual({ reassignedCourses: 0 });
      expect(fake.__store.get('courseCategories/DESIGN')).toBeUndefined();
    });

    it('throws CategoryNotFoundException for an unknown id', async () => {
      const fake = createInMemoryDocumentStore(TWO_CATS);
      const repo = await buildRepo(fake);

      await expect(repo.deleteWithReassign('NOPE' as CategoryId, undefined)).rejects.toBeInstanceOf(
        CategoryNotFoundException,
      );
    });

    it('throws LastCategoryException when only one category remains', async () => {
      const fake = createInMemoryDocumentStore({ 'courseCategories/DESIGN': makeCategory() });
      const repo = await buildRepo(fake);

      await expect(
        repo.deleteWithReassign('DESIGN' as CategoryId, undefined),
      ).rejects.toBeInstanceOf(LastCategoryException);
    });

    it('throws CategoryInUseException (with courseCount) when courses reference it and no reassignTo', async () => {
      const fake = createInMemoryDocumentStore({
        ...TWO_CATS,
        'courses/cid-1': makeCourse({ category: 'DESIGN' as CategoryId }),
        'courses/cid-2': makeCourse({ id: 'cid-2' as CourseId, category: 'DESIGN' as CategoryId }),
      });
      const repo = await buildRepo(fake);

      await expect(
        repo.deleteWithReassign('DESIGN' as CategoryId, undefined),
      ).rejects.toMatchObject({
        code: 'CATEGORY_IN_USE',
        details: { courseCount: 2 },
      });
      expect(fake.__store.get('courseCategories/DESIGN')).toBeDefined();
    });

    it('reassigns every referencing course (any status) then deletes the category', async () => {
      const fake = createInMemoryDocumentStore({
        ...TWO_CATS,
        'courses/cid-1': makeCourse({ category: 'DESIGN' as CategoryId, status: 'PUBLISHED' }),
        'courses/cid-2': makeCourse({ id: 'cid-2' as CourseId, category: 'DESIGN' as CategoryId }),
        'courses/cid-3': makeCourse({ id: 'cid-3' as CourseId, category: 'BUSINESS' as CategoryId }),
      });
      const repo = await buildRepo(fake);

      const result = await repo.deleteWithReassign('DESIGN' as CategoryId, 'BUSINESS' as CategoryId);

      expect(result).toEqual({ reassignedCourses: 2 });
      expect(fake.__store.get('courseCategories/DESIGN')).toBeUndefined();
      expect(fake.__store.get('courses/cid-1')).toMatchObject({
        category: 'BUSINESS',
        updatedAt: NOW_ISO,
      });
      expect(fake.__store.get('courses/cid-2')).toMatchObject({ category: 'BUSINESS' });
      expect(fake.__store.get('courses/cid-3')).toMatchObject({
        category: 'BUSINESS',
        updatedAt: SEED_DATE,
      });
    });

    it('throws CategoryNotFoundException when reassignTo does not exist', async () => {
      const fake = createInMemoryDocumentStore({
        ...TWO_CATS,
        'courses/cid-1': makeCourse({ category: 'DESIGN' as CategoryId }),
      });
      const repo = await buildRepo(fake);

      await expect(
        repo.deleteWithReassign('DESIGN' as CategoryId, 'NOPE' as CategoryId),
      ).rejects.toBeInstanceOf(CategoryNotFoundException);
      expect(fake.__store.get('courseCategories/DESIGN')).toBeDefined();
      expect(fake.__store.get('courses/cid-1')).toMatchObject({ category: 'DESIGN' });
    });
  });
});
