import { describe, expect, it, vi } from 'vitest';

import type { Course, Lesson, LessonId, Module, ModuleId, CourseId } from '@learnwren/shared-data-models';

import type { CoursesRepository } from '../../courses.repository';
import type { EnrollmentRepository } from '../../enrollment/enrollment.repository';
import {
  LessonNotFoundException,
  NotLessonOwnerException,
} from '../errors/learn.exception';
import { LessonEnrollmentOrOwnerGuard } from './lesson-enrollment-or-owner.guard';

function ctxFor(req: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as Parameters<LessonEnrollmentOrOwnerGuard['canActivate']>[0];
}

function makeCourses(
  course: Course | null,
  modules: Module[],
  lesson: Lesson | null,
): CoursesRepository {
  return {
    getCourse: vi.fn().mockResolvedValue(course),
    listModulesByCourse: vi.fn().mockResolvedValue(modules),
    getLesson: vi.fn().mockImplementation((_cid: CourseId, mid: ModuleId, _lid: LessonId) => {
      // Return the lesson only when queried for the module it belongs to.
      if (lesson && modules.some((m) => m.id === mid)) {
        return Promise.resolve(lesson);
      }
      return Promise.resolve(null);
    }),
  } as unknown as CoursesRepository;
}

function makeEnrollment(isEnrolled: boolean): EnrollmentRepository {
  return {
    isEnrolled: vi.fn().mockResolvedValue(isEnrolled),
  } as unknown as EnrollmentRepository;
}

const COURSE_ID = 'c1' as CourseId;
const MODULE_ID = 'm1' as ModuleId;
const LESSON_ID = 'l1' as LessonId;
const INSTRUCTOR_ID = 'u1';

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

const testModule: Module = {
  id: MODULE_ID,
  courseId: COURSE_ID,
  title: 'Module 1',
  order: 0,
  createdAt: 'now' as Module['createdAt'],
  updatedAt: 'now' as Module['updatedAt'],
};

const testLesson: Lesson = {
  id: LESSON_ID,
  moduleId: MODULE_ID,
  title: 'Lesson 1',
  order: 0,
  createdAt: 'now' as Lesson['createdAt'],
  updatedAt: 'now' as Lesson['updatedAt'],
};

// ── T5: Owner branch ─────────────────────────────────────────────────────────

describe('LessonEnrollmentOrOwnerGuard', () => {
  it('allows the owner of a PUBLISHED course (lesson found)', async () => {
    const courses = makeCourses(publishedCourse, [testModule], testLesson);
    const guard = new LessonEnrollmentOrOwnerGuard(courses, makeEnrollment(false));
    const req: Record<string, unknown> = {
      params: { cid: COURSE_ID, lid: LESSON_ID },
      user: { uid: INSTRUCTOR_ID },
    };
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req['course']).toEqual(publishedCourse);
    expect(req['lesson']).toEqual(testLesson);
  });

  it('allows the owner of a DRAFT course (owners not status-gated)', async () => {
    const courses = makeCourses(draftCourse, [testModule], testLesson);
    const guard = new LessonEnrollmentOrOwnerGuard(courses, makeEnrollment(false));
    const req: Record<string, unknown> = {
      params: { cid: COURSE_ID, lid: LESSON_ID },
      user: { uid: INSTRUCTOR_ID },
    };
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
  });

  it('throws LessonNotFoundException when the course is missing', async () => {
    const courses = makeCourses(null, [], null);
    const guard = new LessonEnrollmentOrOwnerGuard(courses, makeEnrollment(false));
    await expect(
      guard.canActivate(
        ctxFor({ params: { cid: COURSE_ID, lid: LESSON_ID }, user: { uid: INSTRUCTOR_ID } }),
      ),
    ).rejects.toBeInstanceOf(LessonNotFoundException);
  });

  it('throws LessonNotFoundException when the lesson is missing from all the course modules', async () => {
    const courses = makeCourses(publishedCourse, [testModule], null);
    const guard = new LessonEnrollmentOrOwnerGuard(courses, makeEnrollment(false));
    await expect(
      guard.canActivate(
        ctxFor({ params: { cid: COURSE_ID, lid: LESSON_ID }, user: { uid: INSTRUCTOR_ID } }),
      ),
    ).rejects.toBeInstanceOf(LessonNotFoundException);
  });

  it('throws LessonNotFoundException when cid is missing from params', async () => {
    const courses = makeCourses(publishedCourse, [testModule], testLesson);
    const guard = new LessonEnrollmentOrOwnerGuard(courses, makeEnrollment(false));
    await expect(
      guard.canActivate(
        ctxFor({ params: { lid: LESSON_ID }, user: { uid: INSTRUCTOR_ID } }),
      ),
    ).rejects.toBeInstanceOf(LessonNotFoundException);
  });

  it('throws LessonNotFoundException when lid is missing from params', async () => {
    const courses = makeCourses(publishedCourse, [testModule], testLesson);
    const guard = new LessonEnrollmentOrOwnerGuard(courses, makeEnrollment(false));
    await expect(
      guard.canActivate(
        ctxFor({ params: { cid: COURSE_ID }, user: { uid: INSTRUCTOR_ID } }),
      ),
    ).rejects.toBeInstanceOf(LessonNotFoundException);
  });
});
