import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { Course, Material } from '@learnwren/shared-data-models';

import type { CoursesRepository } from '../courses.repository';
import type { EnrollmentRepository } from '../enrollment/enrollment.repository';
import { MaterialAccessGuard } from './material-access.guard';
import type { MaterialsRepository } from './materials.repository';
import type { MaterialScopedRequest } from './types/loaded-material';

const material = { id: 'm1', ownerInstructorId: 'owner-uid', courseId: 'c1' } as Material;

function ctxFor(req: Partial<MaterialScopedRequest>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as ExecutionContext;
}

function repo(found: Material | null): MaterialsRepository {
  return { get: vi.fn().mockResolvedValue(found) } as unknown as MaterialsRepository;
}

function enrollment(isEnrolled: boolean): EnrollmentRepository {
  return {
    isEnrolled: vi.fn().mockResolvedValue(isEnrolled),
  } as unknown as EnrollmentRepository;
}

function courses(status: Course['status'] | null): CoursesRepository {
  return {
    getCourse: vi
      .fn()
      .mockResolvedValue(status === null ? null : ({ id: 'c1', status } as Course)),
  } as unknown as CoursesRepository;
}

describe('MaterialAccessGuard', () => {
  it('passes for the course owner', async () => {
    const guard = new MaterialAccessGuard(repo(material), enrollment(false), courses('PUBLISHED'));
    const req: Partial<MaterialScopedRequest> = {
      params: { matId: 'm1' },
      user: { uid: 'owner-uid' } as MaterialScopedRequest['user'],
    };
    expect(await guard.canActivate(ctxFor(req))).toBe(true);
    expect(req.material).toBe(material);
  });

  it('owner passes even when the course is no longer PUBLISHED', async () => {
    const guard = new MaterialAccessGuard(repo(material), enrollment(false), courses('ARCHIVED'));
    const req: Partial<MaterialScopedRequest> = {
      params: { matId: 'm1' },
      user: { uid: 'owner-uid' } as MaterialScopedRequest['user'],
    };
    expect(await guard.canActivate(ctxFor(req))).toBe(true);
  });

  it('passes for an ACTIVE-enrolled non-owner on a PUBLISHED course', async () => {
    const enr = enrollment(true);
    const guard = new MaterialAccessGuard(repo(material), enr, courses('PUBLISHED'));
    const req: Partial<MaterialScopedRequest> = {
      params: { matId: 'm1' },
      user: { uid: 'student-uid' } as MaterialScopedRequest['user'],
    };
    expect(await guard.canActivate(ctxFor(req))).toBe(true);
    expect(req.material).toBe(material);
    expect(enr.isEnrolled).toHaveBeenCalledWith('student-uid', 'c1');
  });

  it('blocks an enrolled non-owner once the course is unpublished (DRAFT)', async () => {
    const guard = new MaterialAccessGuard(repo(material), enrollment(true), courses('DRAFT'));
    await expect(
      guard.canActivate(
        ctxFor({
          params: { matId: 'm1' },
          user: { uid: 'student-uid' } as MaterialScopedRequest['user'],
        }),
      ),
    ).rejects.toThrow(/access/i);
  });

  it('blocks an enrolled non-owner once the course is ARCHIVED', async () => {
    const guard = new MaterialAccessGuard(repo(material), enrollment(true), courses('ARCHIVED'));
    await expect(
      guard.canActivate(
        ctxFor({
          params: { matId: 'm1' },
          user: { uid: 'student-uid' } as MaterialScopedRequest['user'],
        }),
      ),
    ).rejects.toThrow(/access/i);
  });

  it('throws NOT_MATERIAL_OWNER for a non-owner who is not enrolled', async () => {
    const guard = new MaterialAccessGuard(repo(material), enrollment(false), courses('PUBLISHED'));
    await expect(
      guard.canActivate(
        ctxFor({
          params: { matId: 'm1' },
          user: { uid: 'student-uid' } as MaterialScopedRequest['user'],
        }),
      ),
    ).rejects.toThrow(/access/i);
  });

  it('throws MATERIAL_NOT_FOUND when the material does not exist', async () => {
    const guard = new MaterialAccessGuard(repo(null), enrollment(false), courses('PUBLISHED'));
    await expect(
      guard.canActivate(ctxFor({ params: { matId: 'm1' } })),
    ).rejects.toThrow(/not found/i);
  });

  it('throws MATERIAL_NOT_FOUND when the matId param is missing', async () => {
    const guard = new MaterialAccessGuard(repo(material), enrollment(false), courses('PUBLISHED'));
    await expect(guard.canActivate(ctxFor({ params: {} }))).rejects.toThrow(/not found/i);
  });

  it('throws NOT_MATERIAL_OWNER when req.user is undefined (unauthenticated request)', async () => {
    const guard = new MaterialAccessGuard(repo(material), enrollment(false), courses('PUBLISHED'));
    await expect(
      guard.canActivate(ctxFor({ params: { matId: 'm1' } })),
    ).rejects.toThrow(/access/i);
  });
});
