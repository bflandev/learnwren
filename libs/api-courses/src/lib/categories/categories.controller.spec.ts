import { describe, expect, it, vi } from 'vitest';

import type { CategoryId, CourseCategoryDoc, ISODateString } from '@learnwren/shared-data-models';

import { AdminCategoriesController } from './admin-categories.controller';
import { CategoriesController } from './categories.controller';
import type { CategoriesService } from './categories.service';

const DESIGN: CourseCategoryDoc = {
  id: 'DESIGN' as CategoryId,
  name: 'Design',
  createdAt: '2026-05-12T00:00:00.000Z' as ISODateString,
  updatedAt: '2026-05-12T00:00:00.000Z' as ISODateString,
};

describe('CategoriesController', () => {
  it('GET /categories delegates to service.list', async () => {
    const svc = { list: vi.fn().mockResolvedValue([DESIGN]) };
    const controller = new CategoriesController(svc as unknown as CategoriesService);

    expect(await controller.list()).toEqual([DESIGN]);
    expect(svc.list).toHaveBeenCalled();
  });
});

describe('AdminCategoriesController', () => {
  const svc = {
    create: vi.fn().mockResolvedValue(DESIGN),
    rename: vi.fn().mockResolvedValue(DESIGN),
    remove: vi.fn().mockResolvedValue({ reassignedCourses: 2 }),
  };
  const controller = new AdminCategoriesController(svc as unknown as CategoriesService);

  it('POST delegates the body name to service.create', async () => {
    expect(await controller.create({ name: 'Design' })).toEqual(DESIGN);
    expect(svc.create).toHaveBeenCalledWith('Design');
  });

  it('PATCH :id delegates to service.rename', async () => {
    await controller.rename('DESIGN', { name: 'Design & UX' });
    expect(svc.rename).toHaveBeenCalledWith('DESIGN', 'Design & UX');
  });

  it('DELETE :id passes reassignTo through', async () => {
    expect(await controller.remove('DESIGN', 'BUSINESS')).toEqual({ reassignedCourses: 2 });
    expect(svc.remove).toHaveBeenCalledWith('DESIGN', 'BUSINESS');
  });

  it('DELETE :id maps an absent/empty reassignTo to undefined', async () => {
    await controller.remove('DESIGN', '');
    expect(svc.remove).toHaveBeenCalledWith('DESIGN', undefined);
    await controller.remove('DESIGN', undefined);
    expect(svc.remove).toHaveBeenLastCalledWith('DESIGN', undefined);
  });

  it('DELETE :id rejects a repeated reassignTo param (string[]) with a 400 validation error', async () => {
    // ?reassignTo=A&reassignTo=B reaches Nest as string[]; without the guard
    // it would fall through to a misleading CATEGORY_NOT_FOUND 404.
    svc.remove.mockClear();
    let err: unknown;
    try {
      await controller.remove('DESIGN', ['BUSINESS', 'MUSIC'] as unknown as string);
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'VALIDATION_FAILED', status: 400 });
    expect(svc.remove).not.toHaveBeenCalled();
  });
});
