import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { MaterialId } from '@learnwren/shared-data-models';

import { CoursesRepository } from '../courses.repository';
import { EnrollmentRepository } from '../enrollment/enrollment.repository';
import {
  MaterialNotFoundException,
  NotMaterialOwnerException,
} from './errors/material.exception';
import { MaterialsRepository } from './materials.repository';
import type { MaterialScopedRequest } from './types/loaded-material';

/**
 * Gates material download: course owner OR active enrollee in a PUBLISHED
 * course. If the instructor unpublishes/archives, enrolled students lose
 * access until the course is re-published.
 */
@Injectable()
export class MaterialAccessGuard implements CanActivate {
  constructor(
    private readonly repo: MaterialsRepository,
    private readonly enrollment: EnrollmentRepository,
    private readonly courses: CoursesRepository,
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
      const course = await this.courses.getCourse(material.courseId);
      if (course?.status === 'PUBLISHED') {
        req.material = material;
        return true;
      }
    }

    throw new NotMaterialOwnerException();
  }
}
