import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { CourseId, LessonId } from '@learnwren/shared-data-models';

import { CoursesRepository } from '../../courses.repository';
import { EnrollmentRepository } from '../../enrollment/enrollment.repository';
import { LessonNotFoundException, NotLessonOwnerException } from '../errors/learn.exception';
import type { LessonScopedRequest } from '../types/lesson-scoped-request';
import { findLessonInCourse } from './find-lesson-in-course';

@Injectable()
export class LessonEnrollmentOrOwnerGuard implements CanActivate {
  constructor(
    private readonly courses: CoursesRepository,
    private readonly enrollment: EnrollmentRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<LessonScopedRequest>();
    const cid = req.params?.cid as CourseId | undefined;
    const lid = req.params?.lid as LessonId | undefined;
    if (!cid || !lid) throw new LessonNotFoundException();

    const course = await this.courses.getCourse(cid);
    if (!course) throw new LessonNotFoundException();

    const lesson = await findLessonInCourse(this.courses, cid, lid);
    if (!lesson) throw new LessonNotFoundException();

    // Owner branch — owners get access regardless of course.status (preview).
    if (course.instructorId === req.user?.uid) {
      req.course = course;
      req.lesson = lesson;
      return true;
    }

    // Enrolled students need the course to still be PUBLISHED. Once the
    // instructor unpublishes or archives, enrolment-based access is revoked
    // at the API boundary. Mirrors EnrollmentOrOwnerGuard.
    if (req.user && (await this.enrollment.isEnrolled(req.user.uid, cid))) {
      if (course.status === 'PUBLISHED') {
        req.course = course;
        req.lesson = lesson;
        return true;
      }
    }

    throw new NotLessonOwnerException();
  }
}
