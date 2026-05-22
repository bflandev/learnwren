import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { MaterialId } from '@learnwren/shared-data-models';

import { EnrollmentRepository } from '../enrollment/enrollment.repository';
import {
  MaterialNotFoundException,
  NotMaterialOwnerException,
} from './errors/material.exception';
import { MaterialsRepository } from './materials.repository';
import type { MaterialScopedRequest } from './types/loaded-material';

/** Gates the material download endpoint: the course owner or an ACTIVE-enrolled student. */
@Injectable()
export class MaterialAccessGuard implements CanActivate {
  constructor(
    private readonly repo: MaterialsRepository,
    private readonly enrollment: EnrollmentRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<MaterialScopedRequest>();
    const matId = req.params?.['matId'] as MaterialId | undefined;
    if (!matId) throw new MaterialNotFoundException();

    const material = await this.repo.get(matId);
    if (!material) throw new MaterialNotFoundException();

    if (material.ownerInstructorId === req.user?.uid) {
      req.material = material;
      return true;
    }

    if (req.user && (await this.enrollment.isEnrolled(req.user.uid, material.courseId))) {
      req.material = material;
      return true;
    }

    throw new NotMaterialOwnerException();
  }
}
