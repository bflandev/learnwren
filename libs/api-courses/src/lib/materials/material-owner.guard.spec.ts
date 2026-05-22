import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { Material, MaterialId } from '@learnwren/shared-data-models';

import { MaterialOwnerGuard } from './material-owner.guard';
import type { MaterialScopedRequest } from './types/loaded-material';

const material = { id: 'm1', ownerInstructorId: 'owner-uid' } as Material;

function ctxFor(req: Partial<MaterialScopedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as ExecutionContext;
}

function repoReturning(value: Material | null) {
  return { get: async () => value } as never;
}

describe('MaterialOwnerGuard', () => {
  it('passes and attaches the material when the requester owns it', async () => {
    const guard = new MaterialOwnerGuard(repoReturning(material));
    const req: Partial<MaterialScopedRequest> = {
      params: { matId: 'm1' },
      user: { uid: 'owner-uid' } as MaterialScopedRequest['user'],
    };
    expect(await guard.canActivate(ctxFor(req))).toBe(true);
    expect(req.material).toBe(material);
  });

  it('throws MATERIAL_NOT_FOUND when the param is missing', async () => {
    const guard = new MaterialOwnerGuard(repoReturning(material));
    await expect(guard.canActivate(ctxFor({ params: {} }))).rejects.toThrow(/not found/i);
  });

  it('throws MATERIAL_NOT_FOUND when the material does not exist', async () => {
    const guard = new MaterialOwnerGuard(repoReturning(null));
    await expect(
      guard.canActivate(ctxFor({ params: { matId: 'm1' } })),
    ).rejects.toThrow(/not found/i);
  });

  it('throws NOT_MATERIAL_OWNER for a different instructor', async () => {
    const guard = new MaterialOwnerGuard(repoReturning(material));
    await expect(
      guard.canActivate(
        ctxFor({
          params: { matId: 'm1' },
          user: { uid: 'other-uid' } as MaterialScopedRequest['user'],
        }),
      ),
    ).rejects.toThrow(/access/i);
  });
});
