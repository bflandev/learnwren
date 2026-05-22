import { describe, expect, it, vi } from 'vitest';

import type { CourseId, Lesson, Material } from '@learnwren/shared-data-models';

import { LessonNotFoundException, ModuleNotFoundException } from '../errors/courses.exception';
import { MaterialsController } from './materials.controller';
import type { MaterialScopedRequest } from './types/loaded-material';

const material = { id: 'm1', displayName: 'Doc' } as Material;

function svcMock(over: Record<string, unknown> = {}) {
  return {
    createUploadUrl: vi.fn().mockResolvedValue({ materialId: 'm1', uploadUrl: 'u', expiresAt: 'T' }),
    listForLesson: vi.fn().mockResolvedValue([material]),
    complete: vi.fn().mockResolvedValue(material),
    rename: vi.fn().mockResolvedValue(material),
    remove: vi.fn().mockResolvedValue(undefined),
    buildDownloadUrl: vi.fn().mockResolvedValue({ downloadUrl: 'd', expiresAt: 'T' }),
    ...over,
  };
}

function coursesRepoMock(over: Record<string, unknown> = {}) {
  return {
    moduleExists: vi.fn().mockResolvedValue(true),
    getLesson: vi.fn().mockResolvedValue({ id: 'l1' } as Lesson),
    ...over,
  };
}

const req = (over: Partial<MaterialScopedRequest> = {}): MaterialScopedRequest =>
  ({
    params: {},
    user: { uid: 'u1' },
    material,
    ...over,
  }) as MaterialScopedRequest;

describe('MaterialsController', () => {
  it('createUploadUrl resolves the lesson then delegates to the service', async () => {
    const svc = svcMock();
    const ctrl = new MaterialsController(svc as never, coursesRepoMock() as never);
    const r = await ctrl.createUploadUrl(
      'c1' as CourseId,
      'mid1' as never,
      'lid1' as never,
      { filename: 'a.pdf', sizeBytes: 10 },
      req(),
    );
    expect(r.materialId).toBe('m1');
    expect(svc.createUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'u1', courseId: 'c1', lessonId: 'lid1', filename: 'a.pdf' }),
    );
  });

  it('createUploadUrl throws MODULE_NOT_FOUND when the module is unknown', async () => {
    const ctrl = new MaterialsController(
      svcMock() as never,
      coursesRepoMock({ moduleExists: vi.fn().mockResolvedValue(false) }) as never,
    );
    await expect(
      ctrl.createUploadUrl('c1' as CourseId, 'm' as never, 'l' as never, { filename: 'a.pdf', sizeBytes: 1 }, req()),
    ).rejects.toBeInstanceOf(ModuleNotFoundException);
  });

  it('createUploadUrl throws LESSON_NOT_FOUND when the lesson is unknown', async () => {
    const ctrl = new MaterialsController(
      svcMock() as never,
      coursesRepoMock({ getLesson: vi.fn().mockResolvedValue(null) }) as never,
    );
    await expect(
      ctrl.createUploadUrl('c1' as CourseId, 'm' as never, 'l' as never, { filename: 'a.pdf', sizeBytes: 1 }, req()),
    ).rejects.toBeInstanceOf(LessonNotFoundException);
  });

  it('list resolves the lesson then returns the service result', async () => {
    const svc = svcMock();
    const ctrl = new MaterialsController(svc as never, coursesRepoMock() as never);
    const r = await ctrl.list('c1' as CourseId, 'm' as never, 'l1' as never);
    expect(r).toEqual([material]);
    expect(svc.listForLesson).toHaveBeenCalledWith('l1');
  });

  it('complete delegates with the loaded material id', async () => {
    const svc = svcMock();
    const ctrl = new MaterialsController(svc as never, coursesRepoMock() as never);
    await ctrl.complete(req());
    expect(svc.complete).toHaveBeenCalledWith('m1');
  });

  it('rename delegates the new display name', async () => {
    const svc = svcMock();
    const ctrl = new MaterialsController(svc as never, coursesRepoMock() as never);
    await ctrl.rename({ displayName: 'New' }, req());
    expect(svc.rename).toHaveBeenCalledWith('m1', 'New');
  });

  it('remove delegates to the service', async () => {
    const svc = svcMock();
    const ctrl = new MaterialsController(svc as never, coursesRepoMock() as never);
    await ctrl.remove(req());
    expect(svc.remove).toHaveBeenCalledWith('m1');
  });

  it('downloadUrl returns the signed URL', async () => {
    const svc = svcMock();
    const ctrl = new MaterialsController(svc as never, coursesRepoMock() as never);
    expect(await ctrl.downloadUrl(req())).toEqual({ downloadUrl: 'd', expiresAt: 'T' });
    expect(svc.buildDownloadUrl).toHaveBeenCalledWith('m1');
  });
});
