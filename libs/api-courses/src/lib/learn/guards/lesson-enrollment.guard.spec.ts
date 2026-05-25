import { describe, expect, it, vi } from 'vitest';

import type {
  Course,
  CourseId,
  Lesson,
  LessonId,
  Module,
  ModuleId,
} from '@learnwren/shared-data-models';

import type { CoursesRepository } from '../../courses.repository';
import type { EnrollmentRepository } from '../../enrollment/enrollment.repository';
import {
  LessonNotFoundException,
  NotEnrolledLessonException,
} from '../errors/learn.exception';
import { LessonEnrollmentGuard } from './lesson-enrollment.guard';

function ctxFor(req: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as Parameters<LessonEnrollmentGuard['canActivate']>[0];
}

function makeCourses(
  course: Course | null,
  modules: Module[],
  lesson: Lesson | null,
): CoursesRepository {
  return {
    getCourse: vi.fn().mockResolvedValue(course),
    listModulesByCourse: vi.fn().mockResolvedValue(modules),
    getLesson: vi.fn().mockImplementation((_cid: CourseId, mid: ModuleId) => {
      if (lesson && modules.some((m) => m.id === mid)) return Promise.resolve(lesson);
      return Promise.resolve(null);
    }),
  } as unknown as CoursesRepository;
}

function makeEnrollment(isEnrolled: boolean): EnrollmentRepository {
  return { isEnrolled: vi.fn().mockResolvedValue(isEnrolled) } as unknown as EnrollmentRepository;
}

const COURSE_ID = 'c1' as CourseId;
const MODULE_ID = 'm1' as ModuleId;
const LESSON_ID = 'l1' as LessonId;
const INSTRUCTOR_ID = 'u1';
const STUDENT_ID = 'u2';

const publishedCourse: Course = {
  id: COURSE_ID,
  title: 'Test Course',
  description: 'desc',
  instructorId: INSTRUCTOR_ID as Course['instructorId'],
  status: 'PUBLISHED',
  createdAt: 'now' as Course['createdAt'],
  updatedAt: 'now' as Course['updatedAt'],
};
const draftCourse: Course = { ...publishedCourse, status: 'DRAFT' };
const archivedCourse: Course = { ...publishedCourse, status: 'ARCHIVED' };

const aModule: Module = {
  id: MODULE_ID,
  courseId: COURSE_ID,
  title: 'M1',
  order: 0,
  createdAt: 'now' as Module['createdAt'],
  updatedAt: 'now' as Module['updatedAt'],
};

const aLesson: Lesson = {
  id: LESSON_ID,
  courseId: COURSE_ID,
  moduleId: MODULE_ID,
  title: 'L1',
  description: '',
  order: 0,
  videoId: null,
  createdAt: 'now' as Lesson['createdAt'],
  updatedAt: 'now' as Lesson['updatedAt'],
};

describe('LessonEnrollmentGuard', () => {
  it('rejects the course owner on PUBLISHED', async () => {
    const guard = new LessonEnrollmentGuard(
      makeCourses(publishedCourse, [aModule], aLesson),
      makeEnrollment(false),
    );
    await expect(
      guard.canActivate(ctxFor({ params: { cid: COURSE_ID, lid: LESSON_ID }, user: { uid: INSTRUCTOR_ID } })),
    ).rejects.toBeInstanceOf(NotEnrolledLessonException);
  });

  it('rejects the course owner on DRAFT', async () => {
    const guard = new LessonEnrollmentGuard(
      makeCourses(draftCourse, [aModule], aLesson),
      makeEnrollment(false),
    );
    await expect(
      guard.canActivate(ctxFor({ params: { cid: COURSE_ID, lid: LESSON_ID }, user: { uid: INSTRUCTOR_ID } })),
    ).rejects.toBeInstanceOf(NotEnrolledLessonException);
  });

  it('allows an enrolled student on PUBLISHED', async () => {
    const guard = new LessonEnrollmentGuard(
      makeCourses(publishedCourse, [aModule], aLesson),
      makeEnrollment(true),
    );
    const req: Record<string, unknown> = { params: { cid: COURSE_ID, lid: LESSON_ID }, user: { uid: STUDENT_ID } };
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req.course).toBe(publishedCourse);
    expect(req.lesson).toBe(aLesson);
  });

  it('rejects an enrolled student on DRAFT', async () => {
    const guard = new LessonEnrollmentGuard(
      makeCourses(draftCourse, [aModule], aLesson),
      makeEnrollment(true),
    );
    await expect(
      guard.canActivate(ctxFor({ params: { cid: COURSE_ID, lid: LESSON_ID }, user: { uid: STUDENT_ID } })),
    ).rejects.toBeInstanceOf(NotEnrolledLessonException);
  });

  it('rejects an enrolled student on ARCHIVED', async () => {
    const guard = new LessonEnrollmentGuard(
      makeCourses(archivedCourse, [aModule], aLesson),
      makeEnrollment(true),
    );
    await expect(
      guard.canActivate(ctxFor({ params: { cid: COURSE_ID, lid: LESSON_ID }, user: { uid: STUDENT_ID } })),
    ).rejects.toBeInstanceOf(NotEnrolledLessonException);
  });

  it('rejects a non-owner, non-enrolled caller', async () => {
    const guard = new LessonEnrollmentGuard(
      makeCourses(publishedCourse, [aModule], aLesson),
      makeEnrollment(false),
    );
    await expect(
      guard.canActivate(ctxFor({ params: { cid: COURSE_ID, lid: LESSON_ID }, user: { uid: STUDENT_ID } })),
    ).rejects.toBeInstanceOf(NotEnrolledLessonException);
  });

  it('throws LESSON_NOT_FOUND when course is missing', async () => {
    const guard = new LessonEnrollmentGuard(
      makeCourses(null, [], null),
      makeEnrollment(true),
    );
    await expect(
      guard.canActivate(ctxFor({ params: { cid: COURSE_ID, lid: LESSON_ID }, user: { uid: STUDENT_ID } })),
    ).rejects.toBeInstanceOf(LessonNotFoundException);
  });

  it('throws LESSON_NOT_FOUND when the lesson is missing', async () => {
    const guard = new LessonEnrollmentGuard(
      makeCourses(publishedCourse, [aModule], null),
      makeEnrollment(true),
    );
    await expect(
      guard.canActivate(ctxFor({ params: { cid: COURSE_ID, lid: LESSON_ID }, user: { uid: STUDENT_ID } })),
    ).rejects.toBeInstanceOf(LessonNotFoundException);
  });

  it('throws LESSON_NOT_FOUND when cid or lid is missing from params', async () => {
    const guard = new LessonEnrollmentGuard(
      makeCourses(publishedCourse, [aModule], aLesson),
      makeEnrollment(true),
    );
    await expect(
      guard.canActivate(ctxFor({ params: { cid: COURSE_ID }, user: { uid: STUDENT_ID } })),
    ).rejects.toBeInstanceOf(LessonNotFoundException);
  });
});
