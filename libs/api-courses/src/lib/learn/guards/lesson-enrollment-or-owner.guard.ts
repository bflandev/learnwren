import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { CourseId, Lesson, LessonId } from '@learnwren/shared-data-models';

import { CoursesRepository } from '../../courses.repository';
import { EnrollmentRepository } from '../../enrollment/enrollment.repository';
import { LessonNotFoundException, NotLessonOwnerException } from '../errors/learn.exception';
import type { LessonScopedRequest } from '../types/lesson-scoped-request';

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

    const lesson = await this.findLessonInCourse(cid, lid);
    if (!lesson) throw new LessonNotFoundException();

    // Owner branch — owners get truthful access regardless of course.status
    // (preview / authoring).
    if (course.instructorId === req.user?.uid) {
      req.course = course;
      req.lesson = lesson;
      return true;
    }

    // For non-owners we MUST distinguish three enrolment states to avoid
    // leaking a course-membership oracle to an authenticated attacker:
    //   • No enrolment record at all  → 404 (probe; never had a relationship).
    //   • Record exists, ACTIVE       → continue to status check.
    //   • Record exists, WITHDRAWN    → 403 (they had a relationship that was
    //                                   revoked; the UI needs the signal).
    const enrolment = req.user
      ? await this.enrollment.getEnrollment(req.user.uid, cid)
      : null;

    if (!enrolment) {
      // No prior relationship to this course. Collapse to 404 so an attacker
      // cannot distinguish "lesson is in this course but I'm not enrolled"
      // from "lesson does not exist in this course".
      throw new LessonNotFoundException();
    }

    if (enrolment.status === 'ACTIVE' && course.status === 'PUBLISHED') {
      req.course = course;
      req.lesson = lesson;
      return true;
    }

    // Either the enrolment was withdrawn, or the course was unpublished /
    // archived after enrolment. In both cases the student had access and
    // lost it, so a 403 is the honest answer (and the UI needs the signal).
    throw new NotLessonOwnerException();
  }

  private async findLessonInCourse(cid: CourseId, lid: LessonId): Promise<Lesson | null> {
    const modules = await this.courses.listModulesByCourse(cid);
    for (const m of modules) {
      const lesson = await this.courses.getLesson(cid, m.id, lid);
      if (lesson) return lesson;
    }
    return null;
  }
}
