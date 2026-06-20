import { describe, expect, it, vi } from 'vitest';

import type {
  Course,
  Enrollment,
  EnrollmentId,
  EnrollmentStatus,
  Lesson,
  LessonId,
  Module,
  ModuleId,
  CourseId,
  UserId,
} from '@learnwren/shared-data-models';

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

function makeEnrollment(enrollment: Enrollment | null): EnrollmentRepository {
  return {
    getEnrollment: vi.fn().mockResolvedValue(enrollment),
    // Legacy convenience — guard no longer calls this, but keep so any future
    // tests that wire in a richer fake don't trip over a missing method.
    isEnrolled: vi.fn().mockResolvedValue(enrollment?.status === 'ACTIVE'),
  } as unknown as EnrollmentRepository;
}

const COURSE_ID = 'c1' as CourseId;
const MODULE_ID = 'm1' as ModuleId;
const LESSON_ID = 'l1' as LessonId;
const INSTRUCTOR_ID = 'u1' as UserId;
const STUDENT_ID = 'u2' as UserId;

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

function makeEnrollmentRecord(status: EnrollmentStatus): Enrollment {
  return {
    id: `${STUDENT_ID}__${COURSE_ID}` as EnrollmentId,
    userId: STUDENT_ID,
    courseId: COURSE_ID,
    status,
    progress: [],
    withdrawnAt: status === 'WITHDRAWN' ? ('now' as Enrollment['withdrawnAt']) : null,
    createdAt: 'now' as Enrollment['createdAt'],
    updatedAt: 'now' as Enrollment['updatedAt'],
  };
}

const activeEnrollment = makeEnrollmentRecord('ACTIVE');
const withdrawnEnrollment = makeEnrollmentRecord('WITHDRAWN');

describe('LessonEnrollmentOrOwnerGuard', () => {
  // ── Owner branch ──────────────────────────────────────────────────────────

  it('allows the owner of a PUBLISHED course (lesson found)', async () => {
    const courses = makeCourses(publishedCourse, [testModule], testLesson);
    const guard = new LessonEnrollmentOrOwnerGuard(courses, makeEnrollment(null));
    const req: Record<string, unknown> = {
      params: { cid: COURSE_ID, lid: LESSON_ID },
      user: { uid: INSTRUCTOR_ID },
    };
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req['course']).toEqual(publishedCourse);
    expect(req['lesson']).toEqual(testLesson);
    // extractLessonScope must return BOTH params: getCourse is keyed on the real
    // cid (kills the `return { cid, lid }` -> `{}` mutant, which would call
    // getCourse(undefined)), and the lesson lookup is keyed on the real lid.
    expect(courses.getCourse).toHaveBeenCalledWith(COURSE_ID);
    expect(courses.getLesson).toHaveBeenCalledWith(COURSE_ID, testModule.id, LESSON_ID);
  });

  it('allows the owner of a DRAFT course (owners not status-gated)', async () => {
    const courses = makeCourses(draftCourse, [testModule], testLesson);
    const guard = new LessonEnrollmentOrOwnerGuard(courses, makeEnrollment(null));
    const req: Record<string, unknown> = {
      params: { cid: COURSE_ID, lid: LESSON_ID },
      user: { uid: INSTRUCTOR_ID },
    };
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
  });

  it('throws LessonNotFoundException to the OWNER when the lesson is not in the course (owners get truth)', async () => {
    const courses = makeCourses(publishedCourse, [testModule], null);
    const guard = new LessonEnrollmentOrOwnerGuard(courses, makeEnrollment(null));
    await expect(
      guard.canActivate(
        ctxFor({ params: { cid: COURSE_ID, lid: LESSON_ID }, user: { uid: INSTRUCTOR_ID } }),
      ),
    ).rejects.toBeInstanceOf(LessonNotFoundException);
  });

  // ── Course / lesson resolution failures (404) ─────────────────────────────

  it('throws LessonNotFoundException when the course is missing', async () => {
    const courses = makeCourses(null, [], null);
    const guard = new LessonEnrollmentOrOwnerGuard(courses, makeEnrollment(null));
    await expect(
      guard.canActivate(
        ctxFor({ params: { cid: COURSE_ID, lid: LESSON_ID }, user: { uid: INSTRUCTOR_ID } }),
      ),
    ).rejects.toBeInstanceOf(LessonNotFoundException);
  });

  it('throws on a missing course even when a lesson would resolve (kills the !course conditional-false)', async () => {
    // getCourse returns null but the modules/lesson ARE present, so
    // findLessonInCourse would succeed. The `if (!course)` guard MUST short-circuit
    // to 404 first; a mutant that skips it would dereference course.instructorId
    // (TypeError) instead of throwing LessonNotFoundException.
    const courses = makeCourses(null, [testModule], testLesson);
    const guard = new LessonEnrollmentOrOwnerGuard(courses, makeEnrollment(null));
    await expect(
      guard.canActivate(
        ctxFor({ params: { cid: COURSE_ID, lid: LESSON_ID }, user: { uid: INSTRUCTOR_ID } }),
      ),
    ).rejects.toBeInstanceOf(LessonNotFoundException);
  });

  it('returns 404 for an unenrolled student probing a lesson that does not exist in any module (locks the oracle)', async () => {
    // Student with no enrollment record probes a lesson id that is not in any
    // module of the course. The guard must return 404 — not 403 — so an
    // attacker cannot distinguish "lesson does not exist" from
    // "lesson exists but I'm not enrolled".
    const courses = makeCourses(publishedCourse, [testModule], null);
    const guard = new LessonEnrollmentOrOwnerGuard(courses, makeEnrollment(null));
    await expect(
      guard.canActivate(
        ctxFor({ params: { cid: COURSE_ID, lid: LESSON_ID }, user: { uid: STUDENT_ID } }),
      ),
    ).rejects.toBeInstanceOf(LessonNotFoundException);
  });

  it('throws LessonNotFoundException when cid is missing from params', async () => {
    const courses = makeCourses(publishedCourse, [testModule], testLesson);
    const guard = new LessonEnrollmentOrOwnerGuard(courses, makeEnrollment(null));
    await expect(
      guard.canActivate(
        ctxFor({ params: { lid: LESSON_ID }, user: { uid: INSTRUCTOR_ID } }),
      ),
    ).rejects.toBeInstanceOf(LessonNotFoundException);
  });

  it('throws LessonNotFoundException when lid is missing from params', async () => {
    const courses = makeCourses(publishedCourse, [testModule], testLesson);
    const guard = new LessonEnrollmentOrOwnerGuard(courses, makeEnrollment(null));
    await expect(
      guard.canActivate(
        ctxFor({ params: { cid: COURSE_ID }, user: { uid: INSTRUCTOR_ID } }),
      ),
    ).rejects.toBeInstanceOf(LessonNotFoundException);
  });

  // ── Policy: enrolled / unenrolled / withdrawn / status-revoked ───────────
  //
  // The five-row policy below kills the cross-course membership oracle from
  // commit 0778868: probe-style accesses (no prior relationship to the
  // course) collapse to 404 so an authenticated attacker cannot distinguish
  // "lesson exists in course X but I'm not enrolled" from "lesson does not
  // exist in course X". 403 is reserved for users with an existing
  // relationship (was-enrolled-now-revoked, or enrolled-but-course-was-
  // unpublished) so the UI can render an honest "you lost access" state.

  it('allows an ACTIVE-enrolled student on a PUBLISHED course (200)', async () => {
    const courses = makeCourses(publishedCourse, [testModule], testLesson);
    const enrollment = makeEnrollment(activeEnrollment);
    const guard = new LessonEnrollmentOrOwnerGuard(courses, enrollment);
    const req: Record<string, unknown> = {
      params: { cid: COURSE_ID, lid: LESSON_ID },
      user: { uid: STUDENT_ID },
    };
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req['course']).toEqual(publishedCourse);
    expect(req['lesson']).toEqual(testLesson);
    expect(enrollment.getEnrollment).toHaveBeenCalledWith(STUDENT_ID, COURSE_ID);
  });

  it('throws NotLessonOwnerException (403) for an ACTIVE student on a DRAFT course (course unpublished after enrolment)', async () => {
    const courses = makeCourses(draftCourse, [testModule], testLesson);
    const guard = new LessonEnrollmentOrOwnerGuard(courses, makeEnrollment(activeEnrollment));
    await expect(
      guard.canActivate(
        ctxFor({ params: { cid: COURSE_ID, lid: LESSON_ID }, user: { uid: STUDENT_ID } }),
      ),
    ).rejects.toBeInstanceOf(NotLessonOwnerException);
  });

  it('throws NotLessonOwnerException (403) for an ACTIVE student on an ARCHIVED course', async () => {
    const courses = makeCourses(archivedCourse, [testModule], testLesson);
    const guard = new LessonEnrollmentOrOwnerGuard(courses, makeEnrollment(activeEnrollment));
    await expect(
      guard.canActivate(
        ctxFor({ params: { cid: COURSE_ID, lid: LESSON_ID }, user: { uid: STUDENT_ID } }),
      ),
    ).rejects.toBeInstanceOf(NotLessonOwnerException);
  });

  it('throws NotLessonOwnerException (403) for a WITHDRAWN student on a PUBLISHED course (existing relationship → honest 403)', async () => {
    const courses = makeCourses(publishedCourse, [testModule], testLesson);
    const guard = new LessonEnrollmentOrOwnerGuard(courses, makeEnrollment(withdrawnEnrollment));
    await expect(
      guard.canActivate(
        ctxFor({ params: { cid: COURSE_ID, lid: LESSON_ID }, user: { uid: STUDENT_ID } }),
      ),
    ).rejects.toBeInstanceOf(NotLessonOwnerException);
  });

  it('throws LessonNotFoundException (404) for an UNENROLLED authenticated user on a PUBLISHED course (collapses the cross-course oracle)', async () => {
    const courses = makeCourses(publishedCourse, [testModule], testLesson);
    const guard = new LessonEnrollmentOrOwnerGuard(courses, makeEnrollment(null));
    await expect(
      guard.canActivate(
        ctxFor({ params: { cid: COURSE_ID, lid: LESSON_ID }, user: { uid: STUDENT_ID } }),
      ),
    ).rejects.toBeInstanceOf(LessonNotFoundException);
  });

  it('throws LessonNotFoundException (404) for an UNENROLLED user on a DRAFT course (do not leak publish state)', async () => {
    const courses = makeCourses(draftCourse, [testModule], testLesson);
    const guard = new LessonEnrollmentOrOwnerGuard(courses, makeEnrollment(null));
    await expect(
      guard.canActivate(
        ctxFor({ params: { cid: COURSE_ID, lid: LESSON_ID }, user: { uid: STUDENT_ID } }),
      ),
    ).rejects.toBeInstanceOf(LessonNotFoundException);
  });

  it('throws LessonNotFoundException (404) when req.user is absent (defensive — upstream auth should have rejected)', async () => {
    // Pins the `req.user?.uid` short-circuit and the `req.user ? … : null`
    // ternary. The auth guard would normally reject before this point, but
    // the guard defends against the missing-user case and must collapse to
    // 404 (same shape as an unenrolled user) — never 403 or a route success.
    const courses = makeCourses(publishedCourse, [testModule], testLesson);
    const guard = new LessonEnrollmentOrOwnerGuard(courses, makeEnrollment(null));
    await expect(
      guard.canActivate(ctxFor({ params: { cid: COURSE_ID, lid: LESSON_ID } })),
    ).rejects.toBeInstanceOf(LessonNotFoundException);
  });
});
