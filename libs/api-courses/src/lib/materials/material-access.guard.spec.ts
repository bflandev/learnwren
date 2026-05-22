import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { Material } from '@learnwren/shared-data-models';

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

describe('MaterialAccessGuard', () => {
  it('passes for the course owner', async () => {
    const guard = new MaterialAccessGuard(repo(material), enrollment(false));
    const req: Partial<MaterialScopedRequest> = {
      params: { matId: 'm1' },
      user: { uid: 'owner-uid' } as MaterialScopedRequest['user'],
    };
    expect(await guard.canActivate(ctxFor(req))).toBe(true);
    expect(req.material).toBe(material);
  });

  it('passes for an ACTIVE-enrolled non-owner', async () => {
    const enr = enrollment(true);
    const guard = new MaterialAccessGuard(repo(material), enr);
    const req: Partial<MaterialScopedRequest> = {
      params: { matId: 'm1' },
      user: { uid: 'student-uid' } as MaterialScopedRequest['user'],
    };
    expect(await guard.canActivate(ctxFor(req))).toBe(true);
    expect(req.material).toBe(material);
    expect(enr.isEnrolled).toHaveBeenCalledWith('student-uid', 'c1');
  });

  it('throws NOT_MATERIAL_OWNER for a non-owner who is not enrolled', async () => {
    const guard = new MaterialAccessGuard(repo(material), enrollment(false));
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
    const guard = new MaterialAccessGuard(repo(null), enrollment(false));
    await expect(
      guard.canActivate(ctxFor({ params: { matId: 'm1' } })),
    ).rejects.toThrow(/not found/i);
  });

  it('throws MATERIAL_NOT_FOUND when the matId param is missing', async () => {
    const guard = new MaterialAccessGuard(repo(material), enrollment(false));
    await expect(guard.canActivate(ctxFor({ params: {} }))).rejects.toThrow(/not found/i);
  });

  it('throws NOT_MATERIAL_OWNER when req.user is undefined (unauthenticated request)', async () => {
    const guard = new MaterialAccessGuard(repo(material), enrollment(false));
    await expect(
      guard.canActivate(ctxFor({ params: { matId: 'm1' } })),
    ).rejects.toThrow(/access/i);
  });
});
