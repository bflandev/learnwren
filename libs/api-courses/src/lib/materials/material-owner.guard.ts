import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { MaterialId } from '@learnwren/shared-data-models';

import {
  MaterialNotFoundException,
  NotMaterialOwnerException,
} from './errors/material.exception';
import { MaterialsRepository } from './materials.repository';
import type { MaterialScopedRequest } from './types/loaded-material';

@Injectable()
export class MaterialOwnerGuard implements CanActivate {
  constructor(private readonly repo: MaterialsRepository) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<MaterialScopedRequest>();
    const matId = req.params?.['matId'] as MaterialId | undefined;
    if (!matId) throw new MaterialNotFoundException();

    const material = await this.repo.get(matId);
    if (!material) throw new MaterialNotFoundException();
    if (material.ownerInstructorId !== req.user?.uid) {
      throw new NotMaterialOwnerException();
    }
    req.material = material;
    return true;
  }
}
