# EP-06 Slice B — Mark Lesson Complete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship UC-06-02: an enrolled student clicks **Mark as Complete** on a lesson page; the API persists `completedAt` on their per-lesson progress; the button swaps to a "✓ Completed" pill that persists across reload and across a `WITHDRAWN → ACTIVE` re-enrolment.

**Architecture:** Extend the existing `learn/` submodule in `libs/api-courses` with one POST endpoint and one new owner-rejecting guard (`LessonEnrollmentGuard`). Extend the Slice A `LessonView` payload with a `progress` field so the page can render the right button state from the initial GET — no second round-trip. The repository write is a transactional, storage-layer-idempotent update on the existing `enrollments/{uid}__{cid}` doc; `LessonProgress.lastWatchedSeconds` is untouched (Slice C owns it). The web library extends `LearnService` with a thin HTTP wrapper and the `LessonPlayerPageComponent` with the button → pill swap.

**Tech Stack:** NestJS 11 (controllers + guards + per-feature exception filter), Firestore transactions (via `api-firebase`), Vitest + fake-firestore for backend unit tests, Playwright for api-e2e and web-e2e, Angular 21 standalone signal-based components, hls.js (unchanged from Slice A).

**Spec:** [`docs/superpowers/specs/2026-05-25-ep06-slice-b-mark-complete-design.md`](../specs/2026-05-25-ep06-slice-b-mark-complete-design.md)

**Working tree:** This plan executes in the worktree at `.claude/worktrees/ep06-slice-b-mark-complete` on branch `ep06-slice-b-mark-complete` (already created from `main`). `node_modules` is symlinked to the parent; **never run `git add -A`** in this worktree (the symlink would otherwise be staged). Stage files by name.

---

## Task 1: Extend the learn error catalogue

**Files:**
- Modify: `libs/api-courses/src/lib/learn/errors/learn-error.codes.ts`
- Modify: `libs/api-courses/src/lib/learn/errors/learn.exception.ts`
- Modify: `libs/api-courses/src/lib/learn/errors/learn.exception.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `libs/api-courses/src/lib/learn/errors/learn.exception.spec.ts`:

```ts
describe('NotEnrolledLessonException', () => {
  it('has code NOT_ENROLLED_LESSON and HTTP 403', () => {
    const err = new NotEnrolledLessonException();
    expect(err.code).toBe('NOT_ENROLLED_LESSON');
    expect(err.status).toBe(403);
    expect(err.message).toMatch(/enrolled/i);
  });
});
```

…and add `NotEnrolledLessonException` to the imports at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses --testFile=learn.exception.spec.ts`
Expected: FAIL — `NotEnrolledLessonException is not defined` (TypeScript error in the spec file).

- [ ] **Step 3: Add the new error code**

Replace the contents of `libs/api-courses/src/lib/learn/errors/learn-error.codes.ts` with:

```ts
export const LEARN_ERROR_CODES = [
  'LESSON_NOT_FOUND',
  'NOT_LESSON_OWNER',
  'NOT_ENROLLED_LESSON',
] as const;
export type LearnErrorCode = (typeof LEARN_ERROR_CODES)[number];
```

- [ ] **Step 4: Add the new exception class**

Append to `libs/api-courses/src/lib/learn/errors/learn.exception.ts`:

```ts
export class NotEnrolledLessonException extends LearnException {
  constructor() {
    super(
      'NOT_ENROLLED_LESSON',
      'You must be enrolled in this course to mark lessons complete.',
      403,
    );
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test api-courses --testFile=learn.exception.spec.ts`
Expected: PASS — including the existing `LessonNotFoundException` / `NotLessonOwnerException` tests.

- [ ] **Step 6: Commit**

```bash
git add libs/api-courses/src/lib/learn/errors/learn-error.codes.ts \
        libs/api-courses/src/lib/learn/errors/learn.exception.ts \
        libs/api-courses/src/lib/learn/errors/learn.exception.spec.ts
git commit -m "feat(api-courses): add NOT_ENROLLED_LESSON learn error code"
```

---

## Task 2: Extract the lesson-lookup helper used by both guards

**Files:**
- Create: `libs/api-courses/src/lib/learn/guards/find-lesson-in-course.ts`
- Modify: `libs/api-courses/src/lib/learn/guards/lesson-enrollment-or-owner.guard.ts`

The Slice A guard has a private `findLessonInCourse` method. Task 3 needs the same logic in the new guard. DRY: extract once before duplicating.

- [ ] **Step 1: Create the helper**

Create `libs/api-courses/src/lib/learn/guards/find-lesson-in-course.ts`:

```ts
import type { CourseId, Lesson, LessonId } from '@learnwren/shared-data-models';

import type { CoursesRepository } from '../../courses.repository';

/**
 * Iterate the course's modules and return the first lesson whose id matches.
 * Returns null when the lesson does not exist in any module of the course.
 */
export async function findLessonInCourse(
  courses: CoursesRepository,
  cid: CourseId,
  lid: LessonId,
): Promise<Lesson | null> {
  const modules = await courses.listModulesByCourse(cid);
  for (const m of modules) {
    const lesson = await courses.getLesson(cid, m.id, lid);
    if (lesson) return lesson;
  }
  return null;
}
```

- [ ] **Step 2: Refactor the Slice A guard to use it**

In `libs/api-courses/src/lib/learn/guards/lesson-enrollment-or-owner.guard.ts`:

1. Add import: `import { findLessonInCourse } from './find-lesson-in-course';`
2. Replace the call site `const lesson = await this.findLessonInCourse(cid, lid);` with `const lesson = await findLessonInCourse(this.courses, cid, lid);`
3. Delete the private `findLessonInCourse` method at the bottom of the class.

- [ ] **Step 3: Run the existing guard spec to confirm no regression**

Run: `pnpm nx test api-courses --testFile=lesson-enrollment-or-owner.guard.spec.ts`
Expected: PASS — all existing cases still green.

- [ ] **Step 4: Commit**

```bash
git add libs/api-courses/src/lib/learn/guards/find-lesson-in-course.ts \
        libs/api-courses/src/lib/learn/guards/lesson-enrollment-or-owner.guard.ts
git commit -m "refactor(api-courses): extract findLessonInCourse helper for reuse across learn guards"
```

---

## Task 3: Add `LessonEnrollmentGuard` (owner-rejecting variant)

**Files:**
- Create: `libs/api-courses/src/lib/learn/guards/lesson-enrollment.guard.ts`
- Create: `libs/api-courses/src/lib/learn/guards/lesson-enrollment.guard.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-courses/src/lib/learn/guards/lesson-enrollment.guard.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses --testFile=lesson-enrollment.guard.spec.ts`
Expected: FAIL — `Cannot find module './lesson-enrollment.guard'`.

- [ ] **Step 3: Write the guard**

Create `libs/api-courses/src/lib/learn/guards/lesson-enrollment.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { CourseId, LessonId } from '@learnwren/shared-data-models';

import { CoursesRepository } from '../../courses.repository';
import { EnrollmentRepository } from '../../enrollment/enrollment.repository';
import {
  LessonNotFoundException,
  NotEnrolledLessonException,
} from '../errors/learn.exception';
import type { LessonScopedRequest } from '../types/lesson-scoped-request';
import { findLessonInCourse } from './find-lesson-in-course';

@Injectable()
export class LessonEnrollmentGuard implements CanActivate {
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

    // Owner is REJECTED — owners have no enrolment row to record progress on.
    if (course.instructorId === req.user?.uid) {
      throw new NotEnrolledLessonException();
    }

    if (req.user && (await this.enrollment.isEnrolled(req.user.uid, cid))) {
      if (course.status === 'PUBLISHED') {
        req.course = course;
        req.lesson = lesson;
        return true;
      }
    }

    throw new NotEnrolledLessonException();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-courses --testFile=lesson-enrollment.guard.spec.ts`
Expected: PASS — all 9 cases green.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/learn/guards/lesson-enrollment.guard.ts \
        libs/api-courses/src/lib/learn/guards/lesson-enrollment.guard.spec.ts
git commit -m "feat(api-courses): add LessonEnrollmentGuard for owner-rejecting endpoints"
```

---

## Task 4: Add `EnrollmentRepository.markLessonComplete`

**Files:**
- Modify: `libs/api-courses/src/lib/enrollment/enrollment.repository.ts`
- Modify: `libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts`

The transaction reads the enrolment doc, finds-or-creates the `LessonProgress` row, sets `completedAt` only if it was previously `null`, and returns the (possibly pre-existing) ISO timestamp. The repository throws the existing `NotEnrolledException` from `../errors/courses.exception` for missing or `WITHDRAWN` enrolments — this keeps the repository's error vocabulary co-located with the rest of the EP-05 Slice B work; the controller layer catches it and re-throws `NotEnrolledLessonException` if needed. (In practice the guard prevents this from happening; the transaction re-check is the racy defense.)

- [ ] **Step 1: Write the failing tests**

Append to `libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts` (inside the existing `describe('EnrollmentRepository', ...)` block, or in a new sibling describe — match the file's existing convention):

```ts
describe('markLessonComplete', () => {
  it('appends a new LessonProgress row with completedAt when none exists', async () => {
    const fs = makeFakeFirestore();
    await fs.collection('enrollments').doc('u__c').set({
      id: 'u__c',
      userId: 'u',
      courseId: 'c',
      status: 'ACTIVE',
      progress: [],
      withdrawnAt: null,
      createdAt: 't0',
      updatedAt: 't0',
    });
    const repo = new EnrollmentRepository(fs);
    const result = await repo.markLessonComplete(
      'u' as UserId,
      'c' as CourseId,
      'l1' as LessonId,
      '2026-05-25T12:00:00.000Z' as ISODateString,
    );
    expect(result.completedAt).toBe('2026-05-25T12:00:00.000Z');
    const after = (await fs.collection('enrollments').doc('u__c').get()).data();
    expect(after?.progress).toEqual([
      { lessonId: 'l1', completedAt: '2026-05-25T12:00:00.000Z', lastWatchedSeconds: 0 },
    ]);
    expect(after?.updatedAt).toBe('2026-05-25T12:00:00.000Z');
  });

  it('updates completedAt on an existing row with completedAt: null', async () => {
    const fs = makeFakeFirestore();
    await fs.collection('enrollments').doc('u__c').set({
      id: 'u__c',
      userId: 'u',
      courseId: 'c',
      status: 'ACTIVE',
      progress: [{ lessonId: 'l1', completedAt: null, lastWatchedSeconds: 42 }],
      withdrawnAt: null,
      createdAt: 't0',
      updatedAt: 't0',
    });
    const repo = new EnrollmentRepository(fs);
    const result = await repo.markLessonComplete(
      'u' as UserId,
      'c' as CourseId,
      'l1' as LessonId,
      '2026-05-25T12:00:00.000Z' as ISODateString,
    );
    expect(result.completedAt).toBe('2026-05-25T12:00:00.000Z');
    const after = (await fs.collection('enrollments').doc('u__c').get()).data();
    expect(after?.progress).toEqual([
      { lessonId: 'l1', completedAt: '2026-05-25T12:00:00.000Z', lastWatchedSeconds: 42 },
    ]);
  });

  it('is idempotent: a second call returns the original completedAt and does not bump updatedAt', async () => {
    const fs = makeFakeFirestore();
    await fs.collection('enrollments').doc('u__c').set({
      id: 'u__c',
      userId: 'u',
      courseId: 'c',
      status: 'ACTIVE',
      progress: [{ lessonId: 'l1', completedAt: '2026-05-25T08:00:00.000Z', lastWatchedSeconds: 99 }],
      withdrawnAt: null,
      createdAt: 't0',
      updatedAt: 't0',
    });
    const repo = new EnrollmentRepository(fs);
    const result = await repo.markLessonComplete(
      'u' as UserId,
      'c' as CourseId,
      'l1' as LessonId,
      '2026-05-25T12:00:00.000Z' as ISODateString,
    );
    expect(result.completedAt).toBe('2026-05-25T08:00:00.000Z');
    const after = (await fs.collection('enrollments').doc('u__c').get()).data();
    expect(after?.progress[0].lastWatchedSeconds).toBe(99); // untouched
    expect(after?.updatedAt).toBe('t0'); // no write
  });

  it('throws NotEnrolledException when the enrolment doc is missing', async () => {
    const fs = makeFakeFirestore();
    const repo = new EnrollmentRepository(fs);
    await expect(
      repo.markLessonComplete(
        'u' as UserId,
        'c' as CourseId,
        'l1' as LessonId,
        '2026-05-25T12:00:00.000Z' as ISODateString,
      ),
    ).rejects.toBeInstanceOf(NotEnrolledException);
  });

  it('throws NotEnrolledException when the enrolment is WITHDRAWN', async () => {
    const fs = makeFakeFirestore();
    await fs.collection('enrollments').doc('u__c').set({
      id: 'u__c',
      userId: 'u',
      courseId: 'c',
      status: 'WITHDRAWN',
      progress: [{ lessonId: 'l1', completedAt: null, lastWatchedSeconds: 0 }],
      withdrawnAt: 't0',
      createdAt: 't0',
      updatedAt: 't0',
    });
    const repo = new EnrollmentRepository(fs);
    await expect(
      repo.markLessonComplete(
        'u' as UserId,
        'c' as CourseId,
        'l1' as LessonId,
        '2026-05-25T12:00:00.000Z' as ISODateString,
      ),
    ).rejects.toBeInstanceOf(NotEnrolledException);
  });

  it('does not touch unrelated LessonProgress rows', async () => {
    const fs = makeFakeFirestore();
    await fs.collection('enrollments').doc('u__c').set({
      id: 'u__c',
      userId: 'u',
      courseId: 'c',
      status: 'ACTIVE',
      progress: [
        { lessonId: 'la', completedAt: '2026-05-20T00:00:00.000Z', lastWatchedSeconds: 10 },
        { lessonId: 'lb', completedAt: null, lastWatchedSeconds: 22 },
      ],
      withdrawnAt: null,
      createdAt: 't0',
      updatedAt: 't0',
    });
    const repo = new EnrollmentRepository(fs);
    await repo.markLessonComplete(
      'u' as UserId,
      'c' as CourseId,
      'lb' as LessonId,
      '2026-05-25T12:00:00.000Z' as ISODateString,
    );
    const after = (await fs.collection('enrollments').doc('u__c').get()).data();
    expect(after?.progress).toEqual([
      { lessonId: 'la', completedAt: '2026-05-20T00:00:00.000Z', lastWatchedSeconds: 10 },
      { lessonId: 'lb', completedAt: '2026-05-25T12:00:00.000Z', lastWatchedSeconds: 22 },
    ]);
  });
});
```

Verify the imports at the top of the spec already include `LessonId`, `ISODateString`, `UserId`, `CourseId`, and `NotEnrolledException` — add any missing ones from `@learnwren/shared-data-models` and `../errors/courses.exception`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test api-courses --testFile=enrollment.repository.spec.ts`
Expected: FAIL — `markLessonComplete is not a function` on every new case.

- [ ] **Step 3: Implement the repository method**

Append to `libs/api-courses/src/lib/enrollment/enrollment.repository.ts` (inside the class, after `withdraw`):

```ts
  async markLessonComplete(
    userId: UserId,
    courseId: CourseId,
    lessonId: LessonId,
    nowIso: ISODateString,
  ): Promise<{ completedAt: ISODateString }> {
    const enrollmentRef = this.db.collection(ENROLLMENTS).doc(enrollmentId(userId, courseId));

    return this.db.runTransaction(async (t) => {
      const snap = await t.get(enrollmentRef);
      const existing = snap.exists ? (snap.data() as Enrollment) : null;
      if (!existing || existing.status !== 'ACTIVE') {
        throw new NotEnrolledException();
      }

      const progress = [...(existing.progress ?? [])];
      const idx = progress.findIndex((p) => p.lessonId === lessonId);

      if (idx >= 0 && progress[idx].completedAt != null) {
        // Already complete — idempotent no-op. Return the prior value, write nothing.
        return { completedAt: progress[idx].completedAt as ISODateString };
      }

      if (idx >= 0) {
        progress[idx] = { ...progress[idx], completedAt: nowIso };
      } else {
        progress.push({ lessonId, completedAt: nowIso, lastWatchedSeconds: 0 });
      }

      t.update(enrollmentRef, { progress, updatedAt: nowIso });
      return { completedAt: nowIso };
    });
  }
```

Add `LessonId` to the type-import from `@learnwren/shared-data-models` at the top of the file if it isn't already there.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test api-courses --testFile=enrollment.repository.spec.ts`
Expected: PASS — all six new cases plus the existing enrolment cases green.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/enrollment/enrollment.repository.ts \
        libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts
git commit -m "feat(api-courses): add EnrollmentRepository.markLessonComplete with storage-layer idempotency"
```

---

## Task 5: Extend `LessonView` with the `progress` field

**Files:**
- Modify: `libs/shared-data-models/src/lib/lesson-view.ts`
- Modify: `libs/shared-data-models/src/lib/lesson-view.spec.ts` (if it exists; otherwise this task has no spec change)

- [ ] **Step 1: Update the shared type**

Replace `libs/shared-data-models/src/lib/lesson-view.ts` with:

```ts
import type { CourseId, ISODateString, LessonId, ModuleId, VideoId } from './common';
import type { CourseStatus } from './course';
import type { VideoState } from './video';

/**
 * Response shape of GET /api/learn/courses/:cid/lessons/:lid.
 * The page composes the manifest URL itself; videoId/videoState are both
 * null when the lesson has no video uploaded yet.
 *
 * `progress` is the caller's per-lesson progress:
 *   - null when the caller is the course's owner (no enrolment doc),
 *   - { completedAt: null } when the caller is an enrolled student who has not
 *     yet completed this lesson,
 *   - { completedAt: <ISO> } when the caller has previously marked it complete.
 */
export interface LessonView {
  course: {
    id: CourseId;
    title: string;
    status: CourseStatus;
  };
  lesson: {
    id: LessonId;
    moduleId: ModuleId;
    title: string;
    description?: string;
    videoId: VideoId | null;
    videoState: VideoState | null;
  };
  progress: { completedAt: ISODateString | null } | null;
}
```

(Keeps the `description?: string` shape from the Slice A review fix at `1d4a933` — verify by reading the current file before editing if you suspect drift.)

- [ ] **Step 2: Confirm `ISODateString` is already exported**

Run: `grep "ISODateString" libs/shared-data-models/src/lib/common.ts`
Expected: a line like `export type ISODateString = string & { __brand: 'ISODateString' };`. If absent, halt and report.

- [ ] **Step 3: Typecheck the workspace**

Run: `pnpm nx run-many -t typecheck -p api-courses,web-learn,shared-data-models`
Expected: api-courses and web-learn fail with errors about a missing `progress` property — that's the next task's wiring. Confirm `shared-data-models` itself typechecks clean.

- [ ] **Step 4: Commit**

```bash
git add libs/shared-data-models/src/lib/lesson-view.ts
git commit -m "feat(shared-data-models): add LessonView.progress for per-lesson completion state"
```

---

## Task 6: Extend `LearnService.getLessonView` to read progress

**Files:**
- Modify: `libs/api-courses/src/lib/learn/learn.service.ts`
- Modify: `libs/api-courses/src/lib/learn/learn.service.spec.ts`

The service signature gains `userId: UserId` as the first argument so it can look up the caller's enrolment. Owner callers get `progress: null`. Enrolled callers get `{ completedAt: <row's completedAt> | null }`, falling back to `{ completedAt: null }` when no row exists yet.

- [ ] **Step 1: Write the failing tests**

Open `libs/api-courses/src/lib/learn/learn.service.spec.ts`. The existing tests call `service.getLessonView(course, lesson)`. Two changes are needed:

1. Every existing call site changes to `service.getLessonView(userId, course, lesson)` — pass a student id like `'student-1' as UserId`.
2. The service constructor now takes an `EnrollmentRepository`. Update the construction to inject a fake.

Append these new test cases:

```ts
describe('getLessonView progress', () => {
  it('returns progress: null when the caller is the course owner', async () => {
    const videos = { getVideo: vi.fn().mockResolvedValue(null) } as unknown as VideoRepository;
    const enrollment = {
      getEnrollment: vi.fn().mockResolvedValue(null),
    } as unknown as EnrollmentRepository;
    const service = new LearnService(videos, enrollment);
    const course = makeCourse({ instructorId: 'owner-1' as UserId });
    const view = await service.getLessonView('owner-1' as UserId, course, makeLesson());
    expect(view.progress).toBeNull();
    expect(enrollment.getEnrollment).not.toHaveBeenCalled();
  });

  it('returns { completedAt: null } when the enrolled student has no LessonProgress row yet', async () => {
    const videos = { getVideo: vi.fn().mockResolvedValue(null) } as unknown as VideoRepository;
    const enrollment = {
      getEnrollment: vi.fn().mockResolvedValue({
        id: 's__c', userId: 's', courseId: 'c', status: 'ACTIVE',
        progress: [], withdrawnAt: null, createdAt: 't', updatedAt: 't',
      }),
    } as unknown as EnrollmentRepository;
    const service = new LearnService(videos, enrollment);
    const view = await service.getLessonView(
      's' as UserId,
      makeCourse({ instructorId: 'owner-1' as UserId }),
      makeLesson({ id: 'l1' as LessonId }),
    );
    expect(view.progress).toEqual({ completedAt: null });
  });

  it('returns { completedAt: <iso> } when the LessonProgress row has a prior completion', async () => {
    const videos = { getVideo: vi.fn().mockResolvedValue(null) } as unknown as VideoRepository;
    const enrollment = {
      getEnrollment: vi.fn().mockResolvedValue({
        id: 's__c', userId: 's', courseId: 'c', status: 'ACTIVE',
        progress: [{ lessonId: 'l1', completedAt: '2026-05-20T00:00:00.000Z', lastWatchedSeconds: 0 }],
        withdrawnAt: null, createdAt: 't', updatedAt: 't',
      }),
    } as unknown as EnrollmentRepository;
    const service = new LearnService(videos, enrollment);
    const view = await service.getLessonView(
      's' as UserId,
      makeCourse({ instructorId: 'owner-1' as UserId }),
      makeLesson({ id: 'l1' as LessonId }),
    );
    expect(view.progress).toEqual({ completedAt: '2026-05-20T00:00:00.000Z' });
  });

  it('returns progress: null when no enrolment exists (defensive — guard should have blocked)', async () => {
    const videos = { getVideo: vi.fn().mockResolvedValue(null) } as unknown as VideoRepository;
    const enrollment = {
      getEnrollment: vi.fn().mockResolvedValue(null),
    } as unknown as EnrollmentRepository;
    const service = new LearnService(videos, enrollment);
    const view = await service.getLessonView(
      's' as UserId,
      makeCourse({ instructorId: 'owner-1' as UserId }),
      makeLesson({ id: 'l1' as LessonId }),
    );
    expect(view.progress).toBeNull();
  });
});
```

Add a `makeCourse` / `makeLesson` helper at the top of the file if there isn't one already; otherwise reuse the existing one. Add `EnrollmentRepository` to the imports.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test api-courses --testFile=learn.service.spec.ts`
Expected: FAIL — TypeScript errors on the signature change and on the constructor.

- [ ] **Step 3: Update the service**

Replace `libs/api-courses/src/lib/learn/learn.service.ts` with:

```ts
import { Injectable } from '@nestjs/common';

import type {
  Course,
  ISODateString,
  Lesson,
  LessonView,
  UserId,
} from '@learnwren/shared-data-models';

import { EnrollmentRepository } from '../enrollment/enrollment.repository';
import { VideoRepository } from '../video/video.repository';

@Injectable()
export class LearnService {
  constructor(
    private readonly videos: VideoRepository,
    private readonly enrollment: EnrollmentRepository,
  ) {}

  async getLessonView(userId: UserId, course: Course, lesson: Lesson): Promise<LessonView> {
    let videoState: LessonView['lesson']['videoState'] = null;
    if (lesson.videoId) {
      const video = await this.videos.getVideo(lesson.videoId);
      videoState = video?.state ?? null;
    }

    const progress = await this.resolveProgress(userId, course, lesson);

    return {
      course: { id: course.id, title: course.title, status: course.status },
      lesson: {
        id: lesson.id,
        moduleId: lesson.moduleId,
        title: lesson.title,
        description: lesson.description ?? '',
        videoId: lesson.videoId ?? null,
        videoState,
      },
      progress,
    };
  }

  async markLessonComplete(
    userId: UserId,
    course: Course,
    lesson: Lesson,
  ): Promise<{ completedAt: ISODateString }> {
    return this.enrollment.markLessonComplete(
      userId,
      course.id,
      lesson.id,
      new Date().toISOString() as ISODateString,
    );
  }

  private async resolveProgress(
    userId: UserId,
    course: Course,
    lesson: Lesson,
  ): Promise<LessonView['progress']> {
    if (course.instructorId === userId) return null;
    const enrolment = await this.enrollment.getEnrollment(userId, course.id);
    if (!enrolment) return null;
    const row = enrolment.progress.find((p) => p.lessonId === lesson.id);
    return { completedAt: row?.completedAt ?? null };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test api-courses --testFile=learn.service.spec.ts`
Expected: PASS — including the new progress tests and the existing video-state tests.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/learn/learn.service.ts \
        libs/api-courses/src/lib/learn/learn.service.spec.ts
git commit -m "feat(api-courses): teach LearnService about caller progress and add markLessonComplete"
```

---

## Task 7: Restructure controller + add POST `/complete`

**Files:**
- Modify: `libs/api-courses/src/lib/learn/learn.controller.ts`
- Modify: `libs/api-courses/src/lib/learn/learn.controller.spec.ts`
- Modify: `libs/api-courses/src/lib/courses.module.ts`

The class-level `LessonEnrollmentOrOwnerGuard` moves to method-level (only on `@Get`). The new `@Post` uses `LessonEnrollmentGuard`. Nest concatenates class-level and method-level guards, so the session check stays at the class level.

- [ ] **Step 1: Write the failing tests**

Open `libs/api-courses/src/lib/learn/learn.controller.spec.ts`. Append new cases:

```ts
describe('POST /learn/courses/:cid/lessons/:lid/complete', () => {
  it('returns 200 with { completedAt } on the happy path', async () => {
    // Reuse the existing test harness pattern from the GET tests:
    // build a Nest TestingModule with overridden providers/guards,
    // then call request(app).post(...).expect(200).
    const app = await buildAppForEnrolledStudent({
      uid: 's',
      courseId: 'c',
      lessonId: 'l1',
      markResult: { completedAt: '2026-05-25T12:00:00.000Z' as ISODateString },
    });
    const res = await request(app.getHttpServer())
      .post('/learn/courses/c/lessons/l1/complete')
      .expect(200);
    expect(res.body).toEqual({ completedAt: '2026-05-25T12:00:00.000Z' });
  });

  it('is idempotent: two calls return the same completedAt', async () => {
    const app = await buildAppForEnrolledStudent({
      uid: 's',
      courseId: 'c',
      lessonId: 'l1',
      markResult: { completedAt: '2026-05-25T08:00:00.000Z' as ISODateString },
    });
    const first = await request(app.getHttpServer())
      .post('/learn/courses/c/lessons/l1/complete').expect(200);
    const second = await request(app.getHttpServer())
      .post('/learn/courses/c/lessons/l1/complete').expect(200);
    expect(first.body).toEqual(second.body);
  });

  it('returns 403 NOT_ENROLLED_LESSON for the course owner', async () => {
    const app = await buildAppForOwner({ uid: 'owner-1', courseId: 'c', lessonId: 'l1' });
    const res = await request(app.getHttpServer())
      .post('/learn/courses/c/lessons/l1/complete')
      .expect(403);
    expect(res.body.error.code).toBe('NOT_ENROLLED_LESSON');
  });

  it('returns 403 NOT_ENROLLED_LESSON for an unenrolled student', async () => {
    const app = await buildAppForUnenrolledStudent({
      uid: 's', courseId: 'c', lessonId: 'l1',
    });
    const res = await request(app.getHttpServer())
      .post('/learn/courses/c/lessons/l1/complete')
      .expect(403);
    expect(res.body.error.code).toBe('NOT_ENROLLED_LESSON');
  });
});

describe('GET /learn/courses/:cid/lessons/:lid progress field', () => {
  it('carries progress: null for the owner', async () => {
    const app = await buildAppForOwner({ uid: 'owner-1', courseId: 'c', lessonId: 'l1' });
    const res = await request(app.getHttpServer())
      .get('/learn/courses/c/lessons/l1')
      .expect(200);
    expect(res.body.progress).toBeNull();
  });

  it('carries progress.completedAt for an enrolled student who has completed', async () => {
    const app = await buildAppForEnrolledStudent({
      uid: 's', courseId: 'c', lessonId: 'l1',
      enrolment: {
        id: 's__c', userId: 's', courseId: 'c', status: 'ACTIVE',
        progress: [{ lessonId: 'l1', completedAt: '2026-05-20T00:00:00.000Z', lastWatchedSeconds: 0 }],
        withdrawnAt: null, createdAt: 't', updatedAt: 't',
      },
    });
    const res = await request(app.getHttpServer())
      .get('/learn/courses/c/lessons/l1')
      .expect(200);
    expect(res.body.progress).toEqual({ completedAt: '2026-05-20T00:00:00.000Z' });
  });
});
```

The names `buildAppForEnrolledStudent` / `buildAppForOwner` / `buildAppForUnenrolledStudent` are placeholders — adapt them to match the existing harness in the file. If the existing harness uses inline `Test.createTestingModule({...})` with `.overrideGuard(...).useValue(...)`, follow that pattern for the new cases.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test api-courses --testFile=learn.controller.spec.ts`
Expected: FAIL — the POST route doesn't exist yet (404 instead of 200 / 403).

- [ ] **Step 3: Restructure the controller**

Replace `libs/api-courses/src/lib/learn/learn.controller.ts` with:

```ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import type { ISODateString, LessonView, UserId } from '@learnwren/shared-data-models';

import { FirebaseSessionGuard } from '@learnwren/api-auth';

import { LessonEnrollmentGuard } from './guards/lesson-enrollment.guard';
import { LessonEnrollmentOrOwnerGuard } from './guards/lesson-enrollment-or-owner.guard';
import { LearnExceptionFilter } from './learn.exception-filter';
import { LearnService } from './learn.service';
import type { LessonScopedRequest } from './types/lesson-scoped-request';

@Controller('learn')
@UseFilters(LearnExceptionFilter)
@UseGuards(FirebaseSessionGuard)
export class LearnController {
  constructor(private readonly service: LearnService) {}

  @Get('courses/:cid/lessons/:lid')
  @UseGuards(LessonEnrollmentOrOwnerGuard)
  async getLesson(@Req() req: LessonScopedRequest): Promise<LessonView> {
    if (!req.course || !req.lesson || !req.user) {
      throw new Error('LearnController: guard did not attach course/lesson/user');
    }
    return this.service.getLessonView(req.user.uid as UserId, req.course, req.lesson);
  }

  @Post('courses/:cid/lessons/:lid/complete')
  @HttpCode(200)
  @UseGuards(LessonEnrollmentGuard)
  async markComplete(
    @Req() req: LessonScopedRequest,
    @Body() _body: unknown,
  ): Promise<{ completedAt: ISODateString }> {
    if (!req.course || !req.lesson || !req.user) {
      throw new Error('LearnController: guard did not attach course/lesson/user');
    }
    return this.service.markLessonComplete(req.user.uid as UserId, req.course, req.lesson);
  }
}
```

- [ ] **Step 4: Wire the new guard in the module**

In `libs/api-courses/src/lib/courses.module.ts`:

1. Add the import: `import { LessonEnrollmentGuard } from './learn/guards/lesson-enrollment.guard';`
2. Add `LessonEnrollmentGuard` to the `providers: [...]` array, immediately after `LessonEnrollmentOrOwnerGuard`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm nx test api-courses --testFile=learn.controller.spec.ts`
Expected: PASS — all new cases plus the existing GET cases green.

- [ ] **Step 6: Typecheck the affected libs**

Run: `pnpm nx run-many -t typecheck -p api-courses,api`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add libs/api-courses/src/lib/learn/learn.controller.ts \
        libs/api-courses/src/lib/learn/learn.controller.spec.ts \
        libs/api-courses/src/lib/courses.module.ts
git commit -m "feat(api-courses): expose POST /learn/courses/:cid/lessons/:lid/complete"
```

---

## Task 8: Extend api-e2e `learn.e2e-spec.ts`

**Files:**
- Modify: `apps/api-e2e/src/learn.e2e-spec.ts`

This test runs against the live emulators and the running `api` process — same posture as Slice A. The existing file already seeds a course/module/lesson and uses the auth helpers; the new cases reuse those.

- [ ] **Step 1: Add new test cases at the bottom of the file**

Append to `apps/api-e2e/src/learn.e2e-spec.ts` (inside the same `test.describe` if present, or in a new sibling block — match the file's existing structure):

```ts
test('POST /complete is idempotent and reflects in subsequent GET', async ({ request }) => {
  const { instructorCookie, instructorId } = await registerAndPromoteInstructor();
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId });
  const moduleId = await seedModule(courseId);
  const { lessonId } = await seedLesson({ courseId, moduleId, videoState: 'READY' });

  const { sessionCookie: studentCookie } = await registerStudent();
  // Enroll via the existing endpoint
  const enroll = await request.post(`${API_BASE}/api/enrollments`, {
    headers: { Cookie: studentCookie },
    data: { courseId },
  });
  expect(enroll.status()).toBe(201);

  const first = await request.post(
    `${API_BASE}/api/learn/courses/${courseId}/lessons/${lessonId}/complete`,
    { headers: { Cookie: studentCookie } },
  );
  expect(first.status()).toBe(200);
  const firstBody = await first.json();
  expect(typeof firstBody.completedAt).toBe('string');

  const second = await request.post(
    `${API_BASE}/api/learn/courses/${courseId}/lessons/${lessonId}/complete`,
    { headers: { Cookie: studentCookie } },
  );
  expect(second.status()).toBe(200);
  const secondBody = await second.json();
  expect(secondBody.completedAt).toBe(firstBody.completedAt);

  const view = await request.get(
    `${API_BASE}/api/learn/courses/${courseId}/lessons/${lessonId}`,
    { headers: { Cookie: studentCookie } },
  );
  expect(view.status()).toBe(200);
  const viewBody = await view.json();
  expect(viewBody.progress).toEqual({ completedAt: firstBody.completedAt });

  // Cleanup — silence harmless ESLint vars-unused if needed
  void instructorCookie;
});

test('POST /complete returns 403 NOT_ENROLLED_LESSON for the course owner', async ({ request }) => {
  const { instructorCookie, instructorId } = await registerAndPromoteInstructor();
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId });
  const moduleId = await seedModule(courseId);
  const { lessonId } = await seedLesson({ courseId, moduleId, videoState: 'READY' });

  const res = await request.post(
    `${API_BASE}/api/learn/courses/${courseId}/lessons/${lessonId}/complete`,
    { headers: { Cookie: instructorCookie } },
  );
  expect(res.status()).toBe(403);
  const body = await res.json();
  expect(body.error.code).toBe('NOT_ENROLLED_LESSON');
});

test('POST /complete returns 403 after the student withdraws', async ({ request }) => {
  const { instructorId } = await registerAndPromoteInstructor();
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId });
  const moduleId = await seedModule(courseId);
  const { lessonId } = await seedLesson({ courseId, moduleId, videoState: 'READY' });

  const { sessionCookie: studentCookie } = await registerStudent();
  await request.post(`${API_BASE}/api/enrollments`, {
    headers: { Cookie: studentCookie },
    data: { courseId },
  });
  await request.delete(`${API_BASE}/api/enrollments/${courseId}`, {
    headers: { Cookie: studentCookie },
  });

  const res = await request.post(
    `${API_BASE}/api/learn/courses/${courseId}/lessons/${lessonId}/complete`,
    { headers: { Cookie: studentCookie } },
  );
  expect(res.status()).toBe(403);
  expect((await res.json()).error.code).toBe('NOT_ENROLLED_LESSON');
});

test('completion persists across WITHDRAWN → ACTIVE re-enrolment', async ({ request }) => {
  const { instructorId } = await registerAndPromoteInstructor();
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId });
  const moduleId = await seedModule(courseId);
  const { lessonId } = await seedLesson({ courseId, moduleId, videoState: 'READY' });

  const { sessionCookie: studentCookie } = await registerStudent();
  await request.post(`${API_BASE}/api/enrollments`, {
    headers: { Cookie: studentCookie },
    data: { courseId },
  });
  const mark = await request.post(
    `${API_BASE}/api/learn/courses/${courseId}/lessons/${lessonId}/complete`,
    { headers: { Cookie: studentCookie } },
  );
  const original = (await mark.json()).completedAt;

  await request.delete(`${API_BASE}/api/enrollments/${courseId}`, {
    headers: { Cookie: studentCookie },
  });
  await request.post(`${API_BASE}/api/enrollments`, {
    headers: { Cookie: studentCookie },
    data: { courseId },
  });

  const view = await request.get(
    `${API_BASE}/api/learn/courses/${courseId}/lessons/${lessonId}`,
    { headers: { Cookie: studentCookie } },
  );
  expect((await view.json()).progress).toEqual({ completedAt: original });
});

test('POST /complete returns 401 without a session cookie', async ({ request }) => {
  const { instructorId } = await registerAndPromoteInstructor();
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId });
  const moduleId = await seedModule(courseId);
  const { lessonId } = await seedLesson({ courseId, moduleId, videoState: 'READY' });

  const res = await request.post(
    `${API_BASE}/api/learn/courses/${courseId}/lessons/${lessonId}/complete`,
  );
  expect(res.status()).toBe(401);
});
```

- [ ] **Step 2: Note about runtime**

The api-e2e suite needs `pnpm emulators` running in one terminal and `pnpm start:api` in another, matching the existing test header. You do not run this suite as part of the per-task TDD loop; it runs as part of the final integration step (Task 11).

- [ ] **Step 3: Commit**

```bash
git add apps/api-e2e/src/learn.e2e-spec.ts
git commit -m "test(api-e2e): cover POST /learn .../complete idempotency, owner-reject, withdraw, re-enrol"
```

---

## Task 9: Add `markLessonComplete` to the web `LearnService`

**Files:**
- Modify: `libs/web-learn/src/lib/learn.service.ts`
- Modify: `libs/web-learn/src/lib/learn.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `libs/web-learn/src/lib/learn.service.spec.ts`:

```ts
describe('markLessonComplete', () => {
  it('POSTs to /api/learn/courses/:cid/lessons/:lid/complete and resolves with the body', async () => {
    const service = TestBed.inject(LearnService);
    const promise = service.markLessonComplete('c1', 'l1');
    const req = httpMock.expectOne('/api/learn/courses/c1/lessons/l1/complete');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ completedAt: '2026-05-25T12:00:00.000Z' });
    await expect(promise).resolves.toEqual({ completedAt: '2026-05-25T12:00:00.000Z' });
  });

  it('rejects with HttpErrorResponse on 403', async () => {
    const service = TestBed.inject(LearnService);
    const promise = service.markLessonComplete('c1', 'l1');
    const req = httpMock.expectOne('/api/learn/courses/c1/lessons/l1/complete');
    req.flush({ error: { code: 'NOT_ENROLLED_LESSON' } }, { status: 403, statusText: 'Forbidden' });
    await expect(promise).rejects.toMatchObject({ status: 403 });
  });
});
```

(Reuse the existing `httpMock` / `TestBed` setup at the top of the file — match the style used for the existing `getLessonView` tests.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-learn --testFile=learn.service.spec.ts`
Expected: FAIL — `service.markLessonComplete is not a function`.

- [ ] **Step 3: Add the method**

Replace `libs/web-learn/src/lib/learn.service.ts` with:

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { ISODateString, LessonView } from '@learnwren/shared-data-models';

@Injectable({ providedIn: 'root' })
export class LearnService {
  private readonly http = inject(HttpClient);

  getLessonView(courseId: string, lessonId: string): Promise<LessonView> {
    return firstValueFrom(
      this.http.get<LessonView>(`/api/learn/courses/${courseId}/lessons/${lessonId}`, {
        withCredentials: true,
      }),
    );
  }

  markLessonComplete(
    courseId: string,
    lessonId: string,
  ): Promise<{ completedAt: ISODateString }> {
    return firstValueFrom(
      this.http.post<{ completedAt: ISODateString }>(
        `/api/learn/courses/${courseId}/lessons/${lessonId}/complete`,
        {},
        { withCredentials: true },
      ),
    );
  }
}
```

(Adds `withCredentials: true` to `getLessonView` if it wasn't already present — the API requires the session cookie. Verify the existing tests still pass.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test web-learn --testFile=learn.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-learn/src/lib/learn.service.ts \
        libs/web-learn/src/lib/learn.service.spec.ts
git commit -m "feat(web-learn): add LearnService.markLessonComplete"
```

---

## Task 10: Wire Mark-Complete UI into the lesson page

**Files:**
- Modify: `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts`
- Modify: `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.html`
- Modify: `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.spec.ts`:

```ts
describe('Mark as Complete', () => {
  it('renders the Mark as Complete button when progress.completedAt is null', async () => {
    const learn = makeLearnServiceStub({
      view: { ...baseView, progress: { completedAt: null } },
    });
    const fixture = await mountPage(learn);
    expect(fixture.nativeElement.querySelector('[data-testid="mark-complete"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="completed-pill"]')).toBeNull();
  });

  it('renders the Completed pill when progress.completedAt is set', async () => {
    const learn = makeLearnServiceStub({
      view: { ...baseView, progress: { completedAt: '2026-05-20T00:00:00.000Z' } },
    });
    const fixture = await mountPage(learn);
    expect(fixture.nativeElement.querySelector('[data-testid="completed-pill"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="mark-complete"]')).toBeNull();
  });

  it('renders the instructor-preview hint when progress is null', async () => {
    const learn = makeLearnServiceStub({
      view: { ...baseView, progress: null },
    });
    const fixture = await mountPage(learn);
    expect(fixture.nativeElement.querySelector('[data-testid="instructor-preview-hint"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="mark-complete"]')).toBeNull();
  });

  it('swaps the button for the pill after clicking Mark as Complete', async () => {
    const learn = makeLearnServiceStub({
      view: { ...baseView, progress: { completedAt: null } },
      markResult: { completedAt: '2026-05-25T12:00:00.000Z' },
    });
    const fixture = await mountPage(learn);
    fixture.nativeElement.querySelector('[data-testid="mark-complete"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="completed-pill"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="mark-complete"]')).toBeNull();
  });

  it('shows the revoked banner on a 403 from POST /complete', async () => {
    const learn = makeLearnServiceStub({
      view: { ...baseView, progress: { completedAt: null } },
      markError: new HttpErrorResponse({ status: 403 }),
    });
    const fixture = await mountPage(learn);
    fixture.nativeElement.querySelector('[data-testid="mark-complete"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="mark-error-revoked"]')).toBeTruthy();
  });

  it('shows the generic error banner with Retry on other failures', async () => {
    const learn = makeLearnServiceStub({
      view: { ...baseView, progress: { completedAt: null } },
      markError: new HttpErrorResponse({ status: 500 }),
    });
    const fixture = await mountPage(learn);
    fixture.nativeElement.querySelector('[data-testid="mark-complete"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="mark-error-other"]')).toBeTruthy();
  });
});
```

The helpers `makeLearnServiceStub` and `mountPage` are placeholders — match the harness style already in the spec file. If the existing file calls `TestBed.configureTestingModule(...)` with `{ provide: LearnService, useValue: { getLessonView: vi.fn() } }`, follow that style and add a `markLessonComplete` jest/vi mock to it. `baseView` is the existing `LessonView` fixture used by other tests; if the file doesn't have one, lift the inline literal from the existing READY-state test into a top-level const.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test web-learn --testFile=lesson-player-page.component.spec.ts`
Expected: FAIL — selectors like `[data-testid="mark-complete"]` don't exist yet.

- [ ] **Step 3: Update the component class**

Replace `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts` with:

```ts
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import type { ISODateString, LessonView } from '@learnwren/shared-data-models';
import { VideoPlayerComponent } from '@learnwren/web-video';

import { LearnService } from '../learn.service';

type PageState = 'LOADING' | 'READY' | 'PROCESSING' | 'NOT_ENROLLED' | 'NOT_FOUND' | 'LOAD_ERROR';
type MarkError = null | 'revoked' | 'other';

@Component({
  selector: 'lib-lesson-player-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, VideoPlayerComponent],
  templateUrl: './lesson-player-page.component.html',
})
export class LessonPlayerPageComponent implements OnInit {
  private readonly learn = inject(LearnService);

  readonly courseId = input.required<string>();
  readonly lessonId = input.required<string>();

  readonly state = signal<PageState>('LOADING');
  readonly view = signal<LessonView | null>(null);

  readonly completedAt = signal<ISODateString | null>(null);
  readonly isOwnerPreview = signal<boolean>(false);
  readonly markBusy = signal<boolean>(false);
  readonly markError = signal<MarkError>(null);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    this.state.set('LOADING');
    try {
      const view = await this.learn.getLessonView(this.courseId(), this.lessonId());
      this.view.set(view);
      this.completedAt.set(view.progress?.completedAt ?? null);
      this.isOwnerPreview.set(view.progress === null);
      const v = view.lesson;
      if (v.videoId && v.videoState === 'READY') {
        this.state.set('READY');
      } else {
        this.state.set('PROCESSING');
      }
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 403) {
          this.state.set('NOT_ENROLLED');
          return;
        }
        if (err.status === 404) {
          this.state.set('NOT_FOUND');
          return;
        }
      }
      this.state.set('LOAD_ERROR');
    }
  }

  retry(): void {
    void this.load();
  }

  async onMarkComplete(): Promise<void> {
    this.markBusy.set(true);
    this.markError.set(null);
    try {
      const { completedAt } = await this.learn.markLessonComplete(this.courseId(), this.lessonId());
      this.completedAt.set(completedAt);
    } catch (err) {
      const status = err instanceof HttpErrorResponse ? err.status : 0;
      this.markError.set(status === 403 ? 'revoked' : 'other');
    } finally {
      this.markBusy.set(false);
    }
  }
}
```

- [ ] **Step 4: Update the template**

Replace `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.html` with:

```html
@if (state() === 'LOADING') {
  <div data-testid="lesson-skeleton" class="animate-pulse">
    <div class="h-8 w-1/2 bg-gray-200 rounded mb-4"></div>
    <div class="aspect-video w-full bg-gray-200 rounded"></div>
  </div>
} @else if (state() === 'NOT_ENROLLED') {
  <div class="rounded border p-6">
    <h1 class="text-xl font-semibold">You're not enrolled in this course</h1>
    <p class="mt-2 text-sm text-gray-600">Enroll to start watching lessons.</p>
    <a data-testid="back-to-course" class="mt-4 inline-block underline"
       [routerLink]="['/catalog', courseId()]">← Back to course</a>
  </div>
} @else if (state() === 'NOT_FOUND') {
  <div class="rounded border p-6">
    <h1 class="text-xl font-semibold">Lesson not available</h1>
    <p class="mt-2 text-sm text-gray-600">This lesson could not be found.</p>
    <a data-testid="back-to-course" class="mt-4 inline-block underline"
       [routerLink]="['/catalog', courseId()]">← Back to course</a>
  </div>
} @else if (state() === 'LOAD_ERROR') {
  <div class="rounded border p-6">
    <h1 class="text-xl font-semibold">Something went wrong</h1>
    <button class="mt-4 underline" type="button" (click)="retry()">Retry</button>
  </div>
} @else if (view(); as v) {
  <article class="space-y-4">
    <h1 class="text-2xl font-semibold">{{ v.lesson.title }}</h1>
    @if (v.lesson.description) {
      <p class="text-sm text-gray-700">{{ v.lesson.description }}</p>
    }

    @if (state() === 'READY' && v.lesson.videoId; as vid) {
      <lib-video-player [videoId]="vid" />
    } @else {
      <div class="rounded border p-6 bg-amber-50" data-testid="video-processing">
        This lesson's video is still being processed. Please check back later.
      </div>
    }

    <section class="mt-4">
      @if (isOwnerPreview()) {
        <p data-testid="instructor-preview-hint" class="text-sm text-gray-500 italic">
          (Instructor preview — progress not tracked)
        </p>
      } @else if (completedAt(); as ts) {
        <span data-testid="completed-pill"
              class="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm text-green-800"
              aria-disabled="true">
          ✓ Completed on {{ ts | date: 'mediumDate' }}
        </span>
      } @else {
        <button data-testid="mark-complete"
                type="button"
                class="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
                [disabled]="markBusy()"
                (click)="onMarkComplete()">
          {{ markBusy() ? 'Marking…' : 'Mark as Complete' }}
        </button>
      }

      @if (markError() === 'revoked') {
        <p data-testid="mark-error-revoked" class="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          Your enrolment is no longer active.
          <a class="underline" [routerLink]="['/catalog', courseId()]">Back to course</a>
        </p>
      } @else if (markError() === 'other') {
        <p data-testid="mark-error-other" class="mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm">
          Something went wrong.
          <button class="underline" type="button" (click)="onMarkComplete()">Retry</button>
        </p>
      }
    </section>

    <a data-testid="back-to-course" class="inline-block underline"
       [routerLink]="['/catalog', courseId()]">← Back to course</a>
  </article>
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm nx test web-learn --testFile=lesson-player-page.component.spec.ts`
Expected: PASS — all six new cases plus all existing cases green.

- [ ] **Step 6: Commit**

```bash
git add libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts \
        libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.html \
        libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.spec.ts
git commit -m "feat(web-learn): add Mark-as-Complete button and Completed pill to lesson page"
```

---

## Task 11: Extend web-e2e `learn.e2e-spec.ts`

**Files:**
- Modify: `apps/web-e2e/src/learn.e2e-spec.ts`

- [ ] **Step 1: Add new scenarios**

Append two scenarios to `apps/web-e2e/src/learn.e2e-spec.ts` (match the existing structure — file already has a happy-path and an auth-redirect scenario from Slice A):

```ts
test('student can mark a lesson complete and the pill persists across reload', async ({ page, request }) => {
  // Re-use Slice A's happy-path seed helpers. If they're not exported,
  // copy the seeding block from the happy-path test.
  const { instructorId } = await registerAndPromoteInstructor(request);
  const { courseId, lessonId } = await seedPublishedCourseWithLesson({
    instructorId,
    videoState: 'READY',
  });

  const studentCookie = await registerAndSignInStudent(page);
  await page.goto(`/catalog/${courseId}`);
  await page.click('[data-testid="enroll-button"]');
  await page.click('[data-testid="start-learning"]');
  await expect(page).toHaveURL(`/learn/${courseId}/${lessonId}`);

  await expect(page.locator('[data-testid="mark-complete"]')).toBeVisible();
  await page.click('[data-testid="mark-complete"]');

  const pill = page.locator('[data-testid="completed-pill"]');
  await expect(pill).toBeVisible();
  await expect(pill).toContainText(/Completed on/);
  await expect(page.locator('[data-testid="mark-complete"]')).toHaveCount(0);

  // Reload and confirm the pill stays
  await page.reload();
  await expect(page.locator('[data-testid="completed-pill"]')).toBeVisible();

  void studentCookie;
});

test('instructor preview shows the instructor-preview hint and no Mark Complete button', async ({ page, request }) => {
  const { sessionCookie: instructorCookie, instructorId } = await registerAndPromoteInstructor(request);
  const { courseId, lessonId } = await seedDraftCourseWithLesson({
    instructorId,
    videoState: 'READY',
  });

  // Set the instructor's session cookie on the browser before navigation.
  await setSessionCookie(page, instructorCookie);
  await page.goto(`/learn/${courseId}/${lessonId}`);

  await expect(page.locator('[data-testid="instructor-preview-hint"]')).toBeVisible();
  await expect(page.locator('[data-testid="mark-complete"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="completed-pill"]')).toHaveCount(0);
});
```

(Helper names like `seedPublishedCourseWithLesson`, `seedDraftCourseWithLesson`, `setSessionCookie`, `registerAndSignInStudent` are placeholders — adapt to the helpers the existing Slice A spec actually uses. The Slice A happy-path scenario already does the equivalent of `seedPublishedCourseWithLesson` inline; lift its setup into a helper inside the file if the file does not already have one.)

- [ ] **Step 2: Note about runtime**

web-e2e runs against `pnpm emulators` + `pnpm start` (api + web). You do not run it as part of the per-task TDD loop; it runs as part of the final integration step (Task 12).

- [ ] **Step 3: Commit**

```bash
git add apps/web-e2e/src/learn.e2e-spec.ts
git commit -m "test(web-e2e): cover mark-complete pill persistence and instructor preview"
```

---

## Task 12: Update documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/USER_GUIDE.md`
- Modify: `docs/quality/spec-drift-report.md`
- Modify: `docs/superpowers/specs/2026-05-25-ep06-slice-b-mark-complete-design.md` (status → Approved)

- [ ] **Step 1: README — endpoints table and slice status**

Open `README.md`. Find the existing endpoints table (it lists `POST /api/enrollments`, `GET /api/learn/...`, etc.) and add a row:

```
POST   /api/learn/courses/:cid/lessons/:lid/complete   Mark a lesson as complete (idempotent)
```

Find the "what is wired up today" callout and add a row for **EP-06 Slice B — Mark Lesson Complete (UC-06-02)** beneath the existing Slice A row.

- [ ] **Step 2: USER_GUIDE — walkthrough extension**

In `docs/USER_GUIDE.md`, find the section that describes "Watch a lesson as an enrolled student" (added in Slice A) and append a sub-section "Mark a lesson as complete" with these bullets:

- On the lesson page, click **Mark as Complete** under the player.
- The button is replaced with a **✓ Completed on <date>** pill.
- Reloading the page or coming back tomorrow still shows the pill — completion is persisted.
- If you unenroll and later re-enroll, your prior completions are still visible.
- Instructors previewing their own course see "(Instructor preview — progress not tracked)" instead of the button — progress is a per-student concept.

- [ ] **Step 3: spec-drift-report — status transition**

In `docs/quality/spec-drift-report.md`, find the EP-06 section. Update:

- UC-06-02: **Built (2026-05-25)** (per-lesson only — module/course rollups deferred).
- UC-06-03 and UC-06-04: remain **Deferred** and named as upcoming slices.

- [ ] **Step 4: Spec status banner**

In `docs/superpowers/specs/2026-05-25-ep06-slice-b-mark-complete-design.md`, change the document status callout from **DRAFT** to:

```
> [!NOTE]
> **DOCUMENT STATUS: APPROVED**
> Implemented in commits leading up to the merge of branch `ep06-slice-b-mark-complete`.
```

- [ ] **Step 5: Commit**

```bash
git add README.md \
        docs/USER_GUIDE.md \
        docs/quality/spec-drift-report.md \
        docs/superpowers/specs/2026-05-25-ep06-slice-b-mark-complete-design.md
git commit -m "docs(ep06): record Slice B — Mark Lesson Complete is shipped"
```

---

## Task 13: Run the full quality gate

This is the final integration sweep. Run each gate; halt and fix on any failure.

- [ ] **Step 1: Lint (workspace-wide)**

Run: `pnpm lint`
Expected: 0 errors. If the new test data triggers a lint rule (e.g. unused vars in placeholder helpers), fix the test rather than disabling the rule.

- [ ] **Step 2: Typecheck (workspace-wide)**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 3: Unit tests (workspace-wide)**

Run: `pnpm test`
Expected: PASS. Watch specifically for regressions in `api-courses`, `web-learn`, `shared-data-models`, `web-catalog`, `web-enrollment`, and `web-video`.

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: api + web both build successfully.

- [ ] **Step 5: api-e2e — start the prerequisites and run the suite**

In one terminal: `pnpm emulators`
In another terminal: `pnpm start:api`
Once both are warm, in a third terminal: `pnpm nx e2e api-e2e --testFile=learn.e2e-spec.ts`
Expected: PASS. The other api-e2e files should also still pass if you run the full suite (`pnpm nx e2e api-e2e`).

- [ ] **Step 6: web-e2e — start the prerequisites and run the suite**

Emulators are still up. In a fresh terminal: `pnpm start` (this serves both api and web).
In another terminal: `pnpm nx e2e web-e2e --testFile=learn.e2e-spec.ts`
Expected: PASS. If the existing Slice A `learn.e2e-spec.ts` flake-relevant memo (`e2e specs written but not yet run`) is now a problem, fix the Slice A specs as part of this slice and note it in the commit.

- [ ] **Step 7: Affected report (sanity)**

Run: `pnpm nx affected -t lint test build typecheck --base=main`
Expected: every affected project shows green.

- [ ] **Step 8: CRAP & mutation reports (best-effort)**

Run: `pnpm crap` and `pnpm mutate:api-courses`
Expected: the new files appear in the reports; no method on a critical path scores worse than the existing baseline. Mutation may take 5–15 minutes; this is a sanity check, not a gate.

---

## Task 14: Land the slice

- [ ] **Step 1: Verify the worktree is on the expected branch with a clean tree**

Run: `git status && git log --oneline -20`
Expected: branch `ep06-slice-b-mark-complete`, working tree clean, ~14 commits since the design-spec commit `3a6f428`.

- [ ] **Step 2: Switch to the parent checkout and merge**

In the parent checkout (`/Volumes/Artie-Storage/github-repos/learnwren`):

```bash
git checkout main
git merge --no-ff ep06-slice-b-mark-complete -m "Merge ep06-slice-b-mark-complete: UC-06-02 mark lesson complete"
```

- [ ] **Step 3: Confirm the merge commit is on main**

Run: `git log --oneline -5 main`
Expected: a `Merge ep06-slice-b-mark-complete` commit at the tip, followed by the slice's commits.

- [ ] **Step 4: Remove the worktree**

```bash
git worktree remove .claude/worktrees/ep06-slice-b-mark-complete
```

If git refuses because of the `node_modules` symlink or any locally-modified files, investigate before forcing — do not pass `--force` without checking what's there.

- [ ] **Step 5: Delete the merged branch**

```bash
git branch -d ep06-slice-b-mark-complete
```

- [ ] **Step 6: Update the EP-06 follow-ups memory (post-merge)**

After landing, update the auto-memory note `project_ep06_slice_a_followups.md` (or create a sibling `project_ep06_slice_b_followups.md`) capturing:
- Merge SHA on main.
- UC-06-03 (resume) and UC-06-04 (outline) remain the open EP-06 work.
- Any deferred follow-up that came up during implementation (e.g. module-completion rollups still need a surface).

---

## Out-of-band checks

If at any task you discover that:

- `LessonView` is consumed somewhere outside `web-learn` and `learn.service.ts` that *also* asserts on the full shape (e.g. a snapshot test in `web-catalog`), **add the `progress` field to those fixtures** rather than relaxing them.
- The `LearnExceptionFilter` does not auto-dispatch `NotEnrolledLessonException` (i.e. the test for "POST 403 returns code NOT_ENROLLED_LESSON" fails with code `FORBIDDEN`), check `learn.exception-filter.ts` and verify it `instanceof`-checks `LearnException` (it does today, per the existing source — this should not be a problem, but flag if it is).
- The existing `web-e2e` Slice A spec was, per the EP-06 Slice A memo, "written but not yet run" — if it fails when you run the full web-e2e suite, fix it in this slice; do not punt.
