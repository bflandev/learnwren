import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { Material } from '@learnwren/shared-data-models';

import { MaterialAccessGuard } from './material-access.guard';
import type { MaterialScopedRequest } from './types/loaded-material';

const material = { id: 'm1', ownerInstructorId: 'owner-uid', courseId: 'c1' } as Material;

function ctxFor(req: Partial<MaterialScopedRequest>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as ExecutionContext;
}

describe('MaterialAccessGuard', () => {
  it('passes for the course owner', async () => {
    const guard = new MaterialAccessGuard({ get: async () => material } as never);
    const req: Partial<MaterialScopedRequest> = {
      params: { matId: 'm1' },
      user: { uid: 'owner-uid' } as MaterialScopedRequest['user'],
    };
    expect(await guard.canActivate(ctxFor(req))).toBe(true);
    expect(req.material).toBe(material);
  });

  it('throws NOT_MATERIAL_OWNER for a non-owner (enrolled-student access is EP-06)', async () => {
    const guard = new MaterialAccessGuard({ get: async () => material } as never);
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
    const guard = new MaterialAccessGuard({ get: async () => null } as never);
    await expect(
      guard.canActivate(ctxFor({ params: { matId: 'm1' } })),
    ).rejects.toThrow(/not found/i);
  });

  it('throws MATERIAL_NOT_FOUND when the matId param is missing', async () => {
    const guard = new MaterialAccessGuard({ get: async () => material } as never);
    await expect(guard.canActivate(ctxFor({ params: {} }))).rejects.toThrow(/not found/i);
  });

  it('throws NOT_MATERIAL_OWNER when req.user is undefined (unauthenticated request)', async () => {
    // Pins the `req.user?.uid` optional-chaining: without `?.`, accessing `.uid` on undefined
    // would throw a TypeError rather than treating the uid as undefined and denying access.
    const guard = new MaterialAccessGuard({ get: async () => material } as never);
    await expect(
      guard.canActivate(ctxFor({ params: { matId: 'm1' } })),
    ).rejects.toThrow(/access/i);
  });
});
