import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { CourseId } from '@learnwren/shared-data-models';

import { CoursesRepository } from './courses.repository';
import {
  CourseNotFoundException,
  NotCourseOwnerException,
} from './errors/courses.exception';
import type { CourseScopedRequest } from './types/loaded-course';

@Injectable()
export class CourseOwnerGuard implements CanActivate {
  constructor(private readonly repo: CoursesRepository) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<CourseScopedRequest>();
    const cid = req.params?.['cid'] as CourseId | undefined;
    if (!cid) throw new CourseNotFoundException();

    const course = await this.repo.getCourse(cid);
    if (!course) throw new CourseNotFoundException();
    if (course.instructorId !== req.user?.uid) {
      throw new NotCourseOwnerException();
    }

    req.course = course;
    return true;
  }
}
