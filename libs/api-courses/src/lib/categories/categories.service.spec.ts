import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CategoryId, CourseCategoryDoc, ISODateString } from '@learnwren/shared-data-models';
import { CATEGORY_NAME_MAX_LENGTH } from '@learnwren/shared-data-models';

import { CategoryValidationException } from './categories.exception';
import { CategoriesRepository } from './categories.repository';
import { CategoriesService } from './categories.service';

const SEED_DATE = '2026-05-12T00:00:00.000Z' as ISODateString;

function makeCategory(id: string, name: string): CourseCategoryDoc {
  return { id: id as CategoryId, name, createdAt: SEED_DATE, updatedAt: SEED_DATE };
}

describe('CategoriesService', () => {
  let service: CategoriesService;
  let repo: {
    listAll: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    rename: ReturnType<typeof vi.fn>;
    deleteWithReassign: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    repo = {
      listAll: vi.fn(),
      create: vi.fn(),
      rename: vi.fn(),
      deleteWithReassign: vi.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [CategoriesService, { provide: CategoriesRepository, useValue: repo }],
    }).compile();
    service = moduleRef.get(CategoriesService);
  });

  describe('list', () => {
    it('returns categories alphabetically by name, case-insensitively', async () => {
      repo.listAll.mockResolvedValue([
        makeCategory('OTHER', 'Other'),
        makeCategory('BUSINESS', 'business'),
        makeCategory('DESIGN', 'Design'),
      ]);

      const listed = await service.list();

      expect(listed.map((c) => c.name)).toEqual(['business', 'Design', 'Other']);
    });
  });

  describe('create', () => {
    it('trims the name and derives the slug id', async () => {
      repo.create.mockImplementation((id: CategoryId, name: string) =>
        Promise.resolve(makeCategory(id, name)),
      );

      const created = await service.create('  Data Science & AI  ');

      expect(repo.create).toHaveBeenCalledWith('DATA_SCIENCE_AI', 'Data Science & AI');
      expect(created.name).toBe('Data Science & AI');
    });

    it('strips a leading and trailing separator from the slug', async () => {
      repo.create.mockImplementation((id: CategoryId, name: string) =>
        Promise.resolve(makeCategory(id, name)),
      );

      await service.create('!Mixed Media!');

      expect(repo.create).toHaveBeenCalledWith('MIXED_MEDIA', '!Mixed Media!');
    });

    it('rejects an empty (or whitespace-only) name', async () => {
      await expect(service.create('   ')).rejects.toThrow('Category name must not be empty.');
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('rejects a name longer than CATEGORY_NAME_MAX_LENGTH', async () => {
      await expect(service.create('x'.repeat(CATEGORY_NAME_MAX_LENGTH + 1))).rejects.toThrow(
        `Category name must be at most ${CATEGORY_NAME_MAX_LENGTH} characters.`,
      );
    });

    it('accepts a name of exactly CATEGORY_NAME_MAX_LENGTH', async () => {
      repo.create.mockImplementation((id: CategoryId, name: string) =>
        Promise.resolve(makeCategory(id, name)),
      );

      await service.create('x'.repeat(CATEGORY_NAME_MAX_LENGTH));

      expect(repo.create).toHaveBeenCalled();
    });

    it('rejects a name that yields an empty slug (no alphanumerics)', async () => {
      await expect(service.create('!!!')).rejects.toThrow(
        'Category name must contain at least one letter or digit.',
      );
    });
  });

  describe('rename', () => {
    it('trims the name and delegates to the repository', async () => {
      repo.rename.mockResolvedValue(makeCategory('DESIGN', 'Design & UX'));

      const renamed = await service.rename('DESIGN' as CategoryId, ' Design & UX ');

      expect(repo.rename).toHaveBeenCalledWith('DESIGN', 'Design & UX');
      expect(renamed.name).toBe('Design & UX');
    });

    it('rejects an invalid name without touching the repository', async () => {
      await expect(service.rename('DESIGN' as CategoryId, '')).rejects.toBeInstanceOf(
        CategoryValidationException,
      );
      expect(repo.rename).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('delegates to deleteWithReassign', async () => {
      repo.deleteWithReassign.mockResolvedValue({ reassignedCourses: 3 });

      await service.remove('DESIGN' as CategoryId, 'BUSINESS' as CategoryId);

      expect(repo.deleteWithReassign).toHaveBeenCalledWith('DESIGN', 'BUSINESS');
    });

    it('rejects reassignTo equal to the deleted category', async () => {
      await expect(service.remove('DESIGN' as CategoryId, 'DESIGN' as CategoryId)).rejects.toThrow(
        'reassignTo must differ from the deleted category.',
      );
      expect(repo.deleteWithReassign).not.toHaveBeenCalled();
    });
  });
});
