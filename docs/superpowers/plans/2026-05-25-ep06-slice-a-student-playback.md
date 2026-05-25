# EP-06 Slice A — Student Lesson Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship UC-06-01 (Watch a Lesson Video) end-to-end: an authenticated, enrolled student can navigate from `/catalog/:cid` via a **Start Learning** button to `/learn/:cid/:lid` and watch the lesson video in the existing hls.js player.

**Architecture:** New `learn/` submodule in `libs/api-courses` exposing one read endpoint (`GET /api/learn/courses/:cid/lessons/:lid`) gated by a course-scoped `EnrollmentOrOwner` guard. New Angular library `libs/web-learn` hosts the lesson page route and a signal-based data fetcher; it composes the existing `VideoPlayerComponent` from `web-video`. `CourseDetailPageComponent` in `web-catalog` gains a Start Learning CTA that resolves the first lesson from a (one-field-widened) `CatalogModuleOutline`.

**Tech Stack:** NestJS 11, Angular 21 (standalone, OnPush, signals), Firestore (via firebase-admin), hls.js, Vitest, Playwright. Nx 22 monorepo, pnpm.

**Spec:** `docs/superpowers/specs/2026-05-25-ep06-slice-a-student-playback-design.md`.

---

## File Structure

**Created files:**

- `libs/shared-data-models/src/lib/lesson-view.ts` — `LessonView` response interface.
- `libs/api-courses/src/lib/learn/learn.controller.ts`
- `libs/api-courses/src/lib/learn/learn.controller.spec.ts`
- `libs/api-courses/src/lib/learn/learn.service.ts`
- `libs/api-courses/src/lib/learn/learn.service.spec.ts`
- `libs/api-courses/src/lib/learn/guards/lesson-enrollment-or-owner.guard.ts`
- `libs/api-courses/src/lib/learn/guards/lesson-enrollment-or-owner.guard.spec.ts`
- `libs/api-courses/src/lib/learn/types/lesson-scoped-request.ts`
- `libs/api-courses/src/lib/learn/errors/learn-error.codes.ts`
- `libs/api-courses/src/lib/learn/errors/learn.exception.ts`
- `libs/api-courses/src/lib/learn/errors/learn.exception.spec.ts`
- `libs/web-learn/` — new Nx Angular library (generated; full structure below).
- `apps/api-e2e/src/learn.e2e-spec.ts`
- `apps/web-e2e/src/learn.e2e-spec.ts`

**Modified files:**

- `libs/shared-data-models/src/index.ts` — re-export `lesson-view`.
- `libs/shared-data-models/src/lib/catalog.ts` — widen `CatalogModuleOutline.lessons[]` from `{ title }` to `{ id: LessonId; title: string }`.
- `libs/api-courses/src/lib/catalog/catalog.service.ts` — include `l.id` in the lesson mapping (one line in `getCourseDetail`).
- `libs/api-courses/src/lib/catalog/catalog.service.spec.ts` — update fixture assertions to expect `id`.
- `libs/api-courses/src/lib/courses.module.ts` — register `LearnController`, `LearnService`, `LessonEnrollmentOrOwnerGuard`.
- `libs/api-courses/src/index.ts` — export `LearnController` symbol if other apps need it (typically not, but check the existing pattern for `EnrollmentController`).
- `libs/web-video/src/lib/player/video-player.component.ts` — add `fatalError = output<void>()` if missing; wire `VideoPlayerService.onFatalError` to it.
- `libs/web-video/src/lib/player/video-player.component.spec.ts` — assert the output fires on fatal error.
- `libs/web-video/src/index.ts` — re-export `VideoPlayerComponent` if not already exported.
- `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.ts` — add `firstLessonHref` and `canStartLearning` computed signals; render the Start Learning CTA.
- `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.html` — Start Learning button + "No lessons yet" disabled state.
- `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.spec.ts` — six new test cases.
- `apps/web/src/app/app.routes.ts` — spread `learnRoutes`.
- `apps/api-e2e/src/playback.e2e-spec.ts` — un-fixme the EP-06 widening test (line ~128); add two sibling cases.
- `README.md` — endpoint table row, EP-06 Slice A bullet in the status callout, `web-learn` row in the library table.
- `docs/USER_GUIDE.md` — student lesson playback section.
- `docs/quality/spec-drift-report.md` — mark UC-06-01 as Built.

**No changes:** `nx.json`, `pnpm-workspace.yaml`, `firebase.json`, `firestore.indexes.json`, `firestore.rules`, any environment template, `libs/web-enrollment/*`.

---

## Task 1: Add `LessonView` response type to `shared-data-models`

**Files:**
- Create: `libs/shared-data-models/src/lib/lesson-view.ts`
- Modify: `libs/shared-data-models/src/index.ts`

- [ ] **Step 1: Write the file**

Create `libs/shared-data-models/src/lib/lesson-view.ts`:

```ts
import type { CourseId, LessonId, ModuleId, VideoId } from './common';
import type { CourseStatus } from './course';
import type { VideoState } from './video';

/**
 * Response shape of GET /api/learn/courses/:cid/lessons/:lid.
 * The page composes the manifest URL itself; videoId/videoState are both
 * null when the lesson has no video uploaded yet.
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
    description: string;
    videoId: VideoId | null;
    videoState: VideoState | null;
  };
}
```

- [ ] **Step 2: Re-export from the package index**

Edit `libs/shared-data-models/src/index.ts` — add a line in alphabetical order with the other lib re-exports:

```ts
export * from './lib/lesson-view';
```

- [ ] **Step 3: Type-check the lib**

Run: `pnpm nx typecheck shared-data-models`

Expected: Passes. If `CourseStatus` is not exported from `./course`, inspect `libs/shared-data-models/src/lib/course.ts` and adjust the import — it is the discriminated-union type the `Course.status` field uses (`'DRAFT' | 'PUBLISHED' | 'ARCHIVED'`).

- [ ] **Step 4: Commit**

```bash
git add libs/shared-data-models/src/lib/lesson-view.ts libs/shared-data-models/src/index.ts
git commit -m "feat(shared-data-models): add LessonView response type for EP-06"
```

---

## Task 2: Widen `CatalogModuleOutline.lessons[]` to include `id`

The Start Learning button needs lesson IDs to build the `/learn/:cid/:lid` href. The public catalog payload currently exposes only titles. This task adds `id` to the per-lesson shape; lessons remain ordered by `Lesson.order` per the existing repository contract.

**Files:**
- Modify: `libs/shared-data-models/src/lib/catalog.ts`
- Modify: `libs/api-courses/src/lib/catalog/catalog.service.ts`
- Modify: `libs/api-courses/src/lib/catalog/catalog.service.spec.ts`

- [ ] **Step 1: Update the failing test for the catalog service**

Open `libs/api-courses/src/lib/catalog/catalog.service.spec.ts` and find the test(s) covering `getCourseDetail` and the outline shape. Add or extend a test asserting lesson IDs:

```ts
it('exposes lesson IDs on the outline so /learn can link to them', async () => {
  // Seed a course with one module and two lessons via the existing test fixture
  // helpers used by this spec; reuse whatever `seedPublishedCourse` (or similar)
  // helper is already present at the top of the file.
  const { courseId, lessonIds } = await seedPublishedCourseWithLessons(repo, {
    instructorId,
    moduleTitle: 'M',
    lessons: [{ title: 'L1' }, { title: 'L2' }],
  });

  const detail = await service.getCourseDetail(courseId);

  expect(detail.modules[0].lessons).toEqual([
    { id: lessonIds[0], title: 'L1' },
    { id: lessonIds[1], title: 'L2' },
  ]);
});
```

(If the file does not already have a `seedPublishedCourseWithLessons`-style helper, add one alongside the existing fixtures — match the pattern there.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test api-courses -- -t "exposes lesson IDs"`

Expected: FAIL — the returned lessons array contains `{ title: 'L1' }` without `id`.

- [ ] **Step 3: Widen the shared type**

Edit `libs/shared-data-models/src/lib/catalog.ts`. Change `CatalogModuleOutline`:

```ts
import type { CourseId, ISODateString, LessonId } from './common';
// ...
export interface CatalogModuleOutline {
  title: string;
  lessons: { id: LessonId; title: string }[];
}
```

(Add `LessonId` to the existing import from `./common` if not already present.)

- [ ] **Step 4: Widen the mapper**

Edit `libs/api-courses/src/lib/catalog/catalog.service.ts`, replacing the lesson mapping in `getCourseDetail`:

```ts
lessons: (await this.repo.listLessonsByModule(cid, m.id)).map((l) => ({
  id: l.id,
  title: l.title,
})),
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm nx test api-courses -- -t "exposes lesson IDs"`

Expected: PASS.

- [ ] **Step 6: Verify the rest of the catalog spec still passes**

Run: `pnpm nx test api-courses -t catalog`

Expected: All catalog tests pass.

- [ ] **Step 7: Type-check downstream consumers**

Run: `pnpm nx typecheck web-catalog && pnpm nx typecheck web && pnpm nx typecheck api`

Expected: All pass. (No code in `web-catalog` should rely on `lesson` being only `{ title }`; the widening is additive.)

- [ ] **Step 8: Commit**

```bash
git add libs/shared-data-models/src/lib/catalog.ts libs/api-courses/src/lib/catalog/catalog.service.ts libs/api-courses/src/lib/catalog/catalog.service.spec.ts
git commit -m "feat(catalog): include lesson IDs in CatalogModuleOutline"
```

---

## Task 3: Add the `learn/` error envelope

**Files:**
- Create: `libs/api-courses/src/lib/learn/errors/learn-error.codes.ts`
- Create: `libs/api-courses/src/lib/learn/errors/learn.exception.ts`
- Create: `libs/api-courses/src/lib/learn/errors/learn.exception.spec.ts`

- [ ] **Step 1: Write the codes file**

Create `libs/api-courses/src/lib/learn/errors/learn-error.codes.ts`:

```ts
export const LEARN_ERROR_CODES = ['LESSON_NOT_FOUND', 'NOT_LESSON_OWNER'] as const;
export type LearnErrorCode = (typeof LEARN_ERROR_CODES)[number];
```

- [ ] **Step 2: Write the failing spec for the exception classes**

Create `libs/api-courses/src/lib/learn/errors/learn.exception.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { LessonNotFoundException, NotLessonOwnerException } from './learn.exception';

describe('Learn exceptions', () => {
  it('LessonNotFoundException carries code LESSON_NOT_FOUND and status 404', () => {
    const err = new LessonNotFoundException();
    expect(err.code).toBe('LESSON_NOT_FOUND');
    expect(err.status).toBe(404);
  });

  it('NotLessonOwnerException carries code NOT_LESSON_OWNER and status 403', () => {
    const err = new NotLessonOwnerException();
    expect(err.code).toBe('NOT_LESSON_OWNER');
    expect(err.status).toBe(403);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm nx test api-courses -- -t "Learn exceptions"`

Expected: FAIL — module `./learn.exception` not found.

- [ ] **Step 4: Implement the exception classes**

Create `libs/api-courses/src/lib/learn/errors/learn.exception.ts`, mirroring `video.exception.ts`:

```ts
import type { LearnErrorCode } from './learn-error.codes';

export class LearnException extends Error {
  constructor(
    public readonly code: LearnErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'LearnException';
  }
}

export class LessonNotFoundException extends LearnException {
  constructor() {
    super('LESSON_NOT_FOUND', 'Lesson not found.', 404);
  }
}

export class NotLessonOwnerException extends LearnException {
  constructor() {
    super('NOT_LESSON_OWNER', 'You do not have access to this lesson.', 403);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm nx test api-courses -- -t "Learn exceptions"`

Expected: PASS.

- [ ] **Step 6: Check the exception filter handles the new class**

Open `libs/api-courses/src/lib/errors/` (find the `CoursesExceptionFilter` file — it's the established filter for the lib). Confirm it matches by **class instance** (e.g. `err instanceof CourseException || err instanceof VideoException`) rather than by string name. Per the recent refactor (`12f7f07 refactor(api): narrow @Catch() decorators, drop string-name exception matching`), it should. Add `LearnException` to the union of caught classes:

```ts
// Inside the filter's @Catch() decorator or its instanceof checks:
@Catch(CourseException, VideoException, MaterialException, LearnException)
```

(Adjust to the actual decorator/check shape in the file — search for `VideoException` to find the spot.)

- [ ] **Step 7: Run the filter's spec to confirm the union still works**

Run: `pnpm nx test api-courses -- -t "ExceptionFilter"` (or whatever describe block the filter spec uses; grep `describe(` in the filter spec).

Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add libs/api-courses/src/lib/learn/ libs/api-courses/src/lib/errors/
git commit -m "feat(api-courses): add learn error envelope (LESSON_NOT_FOUND, NOT_LESSON_OWNER)"
```

---

## Task 4: Add the `LessonScopedRequest` request type

**Files:**
- Create: `libs/api-courses/src/lib/learn/types/lesson-scoped-request.ts`

- [ ] **Step 1: Write the type**

Create the file:

```ts
import type { Request } from 'express';

import type { Course, Lesson } from '@learnwren/shared-data-models';

import type { AuthenticatedRequest } from '../../types/authenticated-request';
// ↑ adjust path if the AuthenticatedRequest type lives elsewhere in the lib;
// check libs/api-auth for the canonical export and use that import path instead
// if api-courses re-imports it.

export interface LessonScopedRequest extends AuthenticatedRequest {
  course: Course;
  lesson: Lesson;
}
```

If `AuthenticatedRequest` is exported from `@learnwren/api-auth`, import it from there instead. Search the codebase: `grep -rn "AuthenticatedRequest" libs/api-courses/src` for the existing pattern (e.g., `VideoScopedRequest` uses the same idiom).

- [ ] **Step 2: Type-check**

Run: `pnpm nx typecheck api-courses`

Expected: Passes.

- [ ] **Step 3: Commit**

```bash
git add libs/api-courses/src/lib/learn/types/
git commit -m "chore(api-courses): add LessonScopedRequest type"
```

---

## Task 5: `LessonEnrollmentOrOwnerGuard` — owner branch

Build the guard one branch at a time, TDD. Start with the owner-allow path.

**Files:**
- Create: `libs/api-courses/src/lib/learn/guards/lesson-enrollment-or-owner.guard.ts`
- Create: `libs/api-courses/src/lib/learn/guards/lesson-enrollment-or-owner.guard.spec.ts`

- [ ] **Step 1: Write the failing test — owner allowed for PUBLISHED course**

Create `libs/api-courses/src/lib/learn/guards/lesson-enrollment-or-owner.guard.spec.ts`. Match the structure of `libs/api-courses/src/lib/video/playback/enrollment-or-owner.guard.spec.ts` — open that file first to see how it constructs the guard with the fake firestore and a fake `ExecutionContext`.

```ts
import { describe, expect, it } from 'vitest';

import type { CourseId, LessonId, UserId } from '@learnwren/shared-data-models';

import { FakeFirestore } from '../../testing/fake-firestore';
import { CoursesRepository } from '../../courses.repository';
import { EnrollmentRepository } from '../../enrollment/enrollment.repository';
import { LessonEnrollmentOrOwnerGuard } from './lesson-enrollment-or-owner.guard';
import { LessonNotFoundException, NotLessonOwnerException } from '../errors/learn.exception';

function makeCtx(uid: string | undefined, cid: string, lid: string) {
  const req: any = { user: uid ? { uid } : undefined, params: { cid, lid } };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as any;
}

describe('LessonEnrollmentOrOwnerGuard', () => {
  it('allows the owner of a PUBLISHED course', async () => {
    const fs = new FakeFirestore();
    const courses = new CoursesRepository(fs as any);
    const enrol = new EnrollmentRepository(fs as any);
    const cid = 'c1' as CourseId;
    const lid = 'l1' as LessonId;
    const owner = 'owner-uid' as UserId;

    await seedCourse(fs, { id: cid, instructorId: owner, status: 'PUBLISHED' });
    await seedLesson(fs, { id: lid, courseId: cid, moduleId: 'm1', order: 0 });

    const guard = new LessonEnrollmentOrOwnerGuard(courses, enrol);
    await expect(guard.canActivate(makeCtx(owner, cid, lid))).resolves.toBe(true);
  });
});
```

(Replicate `seedCourse` / `seedLesson` helpers from the existing playback guard spec — match its idiom exactly so the next steps reuse the same shape.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test api-courses -- -t "LessonEnrollmentOrOwnerGuard"`

Expected: FAIL — `LessonEnrollmentOrOwnerGuard` does not exist.

- [ ] **Step 3: Implement the guard (owner branch only)**

Create `libs/api-courses/src/lib/learn/guards/lesson-enrollment-or-owner.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { CourseId, LessonId } from '@learnwren/shared-data-models';

import { CoursesRepository } from '../../courses.repository';
import { EnrollmentRepository } from '../../enrollment/enrollment.repository';
import { LessonNotFoundException, NotLessonOwnerException } from '../errors/learn.exception';
import type { LessonScopedRequest } from '../types/lesson-scoped-request';

/**
 * Gates GET /api/learn/courses/:cid/lessons/:lid. Allows the course owner
 * regardless of course.status; allows enrolled students only while the
 * course is PUBLISHED. Mirrors EnrollmentOrOwnerGuard but is course-scoped
 * via cid + lid rather than video-scoped via vid.
 */
@Injectable()
export class LessonEnrollmentOrOwnerGuard implements CanActivate {
  constructor(
    private readonly courses: CoursesRepository,
    private readonly enrollment: EnrollmentRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<LessonScopedRequest>();
    const cid = req.params?.['cid'] as CourseId | undefined;
    const lid = req.params?.['lid'] as LessonId | undefined;
    if (!cid || !lid) throw new LessonNotFoundException();

    const course = await this.courses.getCourse(cid);
    if (!course) throw new LessonNotFoundException();

    const lesson = await this.courses.getLesson(lid);
    if (!lesson || lesson.courseId !== cid) {
      throw new LessonNotFoundException();
    }

    // Owners get access regardless of course.status — they need preview
    // capability while a course is DRAFT or before re-publish.
    if (course.instructorId === req.user?.uid) {
      req.course = course;
      req.lesson = lesson;
      return true;
    }

    throw new NotLessonOwnerException();
  }
}
```

If `CoursesRepository.getLesson` does not exist yet, check `libs/api-courses/src/lib/courses.repository.ts` for the existing read helpers. Lessons may be exposed via `listLessonsByModule` only. If `getLesson(lid)` is absent, add it:

```ts
// In libs/api-courses/src/lib/courses.repository.ts:
async getLesson(lid: LessonId): Promise<Lesson | null> {
  const doc = await this.fs.collection('lessons').doc(lid).get();
  return (doc.exists ? (doc.data() as Lesson) : null);
}
```

(Match the existing repo's pattern — if lessons live as subcollections under modules, use a `collectionGroup` query; if they are a top-level collection, the above works.) Adjust the call in the guard accordingly.

- [ ] **Step 4: Verify the test passes**

Run: `pnpm nx test api-courses -- -t "LessonEnrollmentOrOwnerGuard"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/learn/guards/ libs/api-courses/src/lib/courses.repository.ts
git commit -m "feat(api-courses): add LessonEnrollmentOrOwnerGuard owner-allow branch"
```

---

## Task 6: `LessonEnrollmentOrOwnerGuard` — enrolled student branches

Add the enrolled-allow + status-gate + deny cases.

**Files:**
- Modify: `libs/api-courses/src/lib/learn/guards/lesson-enrollment-or-owner.guard.ts`
- Modify: `libs/api-courses/src/lib/learn/guards/lesson-enrollment-or-owner.guard.spec.ts`

- [ ] **Step 1: Write the additional failing tests**

Append to the spec file:

```ts
it('allows an enrolled student on a PUBLISHED course', async () => {
  // seed PUBLISHED course + lesson + active enrolment for the student
  // assert canActivate resolves true
});

it('denies an enrolled student on a DRAFT course', async () => {
  // seed DRAFT course + lesson + active enrolment for the student
  // assert canActivate throws NotLessonOwnerException
});

it('denies an enrolled student on an ARCHIVED course', async () => {
  // seed ARCHIVED course + lesson + active enrolment for the student
  // assert canActivate throws NotLessonOwnerException
});

it('denies a non-enrolled non-owner', async () => {
  // seed PUBLISHED course + lesson + no enrolment for the student
  // assert canActivate throws NotLessonOwnerException
});

it('denies a withdrawn enrolment', async () => {
  // seed PUBLISHED course + lesson + WITHDRAWN enrolment
  // assert canActivate throws NotLessonOwnerException
});

it('throws LessonNotFoundException when the course is missing', async () => {
  // seed lesson only (no course doc); assert throws LessonNotFoundException
});

it('throws LessonNotFoundException when the lesson is missing', async () => {
  // seed course only; assert throws LessonNotFoundException
});

it('throws LessonNotFoundException when the lesson belongs to a different course', async () => {
  // seed course A + course B + lesson with lesson.courseId = B; call guard with cid=A
  // assert throws LessonNotFoundException
});

it('throws LessonNotFoundException when cid or lid is missing from params', async () => {
  // call guard with params: { cid: undefined, lid: undefined }
  // assert throws LessonNotFoundException
});
```

Fill in each test body following the seed helpers and ctx builder from Task 5. The `EnrollmentRepository.isEnrolled(uid, cid)` API is documented in `libs/api-courses/src/lib/enrollment/enrollment.repository.ts` — use it directly; do not duplicate enrolment seeding logic — seed the enrolment doc the way the playback guard spec does.

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm nx test api-courses -- -t "LessonEnrollmentOrOwnerGuard"`

Expected: Several FAIL (the enrolled-allow paths and the "lesson belongs to a different course" path).

- [ ] **Step 3: Extend the guard to cover the enrolled branch**

Edit `libs/api-courses/src/lib/learn/guards/lesson-enrollment-or-owner.guard.ts`. Insert before the `throw new NotLessonOwnerException()`:

```ts
// Enrolled students need the course to still be PUBLISHED. Once an
// instructor unpublishes or archives, enrolment-based access is revoked
// at the API boundary — consistent with EnrollmentOrOwnerGuard.
if (req.user && (await this.enrollment.isEnrolled(req.user.uid, cid))) {
  if (course.status === 'PUBLISHED') {
    req.course = course;
    req.lesson = lesson;
    return true;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm nx test api-courses -- -t "LessonEnrollmentOrOwnerGuard"`

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/learn/guards/
git commit -m "feat(api-courses): LessonEnrollmentOrOwnerGuard — enrolled-student branch"
```

---

## Task 7: `LearnService` — pure mapper from guard-attached entities to `LessonView`

**Files:**
- Create: `libs/api-courses/src/lib/learn/learn.service.ts`
- Create: `libs/api-courses/src/lib/learn/learn.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `libs/api-courses/src/lib/learn/learn.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import type { Course, Lesson, Video } from '@learnwren/shared-data-models';

import { FakeFirestore } from '../testing/fake-firestore';
import { VideoRepository } from '../video/video.repository';
import { LearnService } from './learn.service';

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: 'c1' as any,
    title: 'Course One',
    status: 'PUBLISHED',
    // ...fill in the remaining required fields, mirroring whatever helper
    // the existing api-courses specs use; check enrollment.service.spec.ts
    ...overrides,
  } as Course;
}

function makeLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'l1' as any,
    moduleId: 'm1' as any,
    title: 'Lesson One',
    description: 'desc',
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z' as any,
    updatedAt: '2026-01-01T00:00:00.000Z' as any,
    ...overrides,
  } as Lesson;
}

describe('LearnService.getLessonView', () => {
  it('maps a lesson with a READY video to the LessonView shape', async () => {
    const fs = new FakeFirestore();
    const videos = new VideoRepository(fs as any);
    await fs.collection('videos').doc('v1').set({
      id: 'v1',
      state: 'READY',
      // ...minimum fields the VideoRepository.getVideo expects
    });

    const service = new LearnService(videos);
    const view = await service.getLessonView(
      makeCourse({ id: 'c1' as any, title: 'Course One', status: 'PUBLISHED' }),
      makeLesson({ id: 'l1' as any, moduleId: 'm1' as any, title: 'L', description: 'D', videoId: 'v1' as any }),
    );

    expect(view).toEqual({
      course: { id: 'c1', title: 'Course One', status: 'PUBLISHED' },
      lesson: {
        id: 'l1',
        moduleId: 'm1',
        title: 'L',
        description: 'D',
        videoId: 'v1',
        videoState: 'READY',
      },
    });
  });

  it('returns videoId: null and videoState: null when the lesson has no video', async () => {
    const fs = new FakeFirestore();
    const videos = new VideoRepository(fs as any);
    const service = new LearnService(videos);

    const view = await service.getLessonView(
      makeCourse(),
      makeLesson({ videoId: undefined }),
    );

    expect(view.lesson.videoId).toBeNull();
    expect(view.lesson.videoState).toBeNull();
  });

  it('returns videoState: null when the video document is missing', async () => {
    const fs = new FakeFirestore();
    const videos = new VideoRepository(fs as any);
    const service = new LearnService(videos);

    const view = await service.getLessonView(
      makeCourse(),
      makeLesson({ videoId: 'orphan' as any }),
    );

    expect(view.lesson.videoId).toBe('orphan');
    expect(view.lesson.videoState).toBeNull();
  });

  it('returns videoState TRANSCODING for an in-flight video', async () => {
    const fs = new FakeFirestore();
    const videos = new VideoRepository(fs as any);
    await fs.collection('videos').doc('v2').set({ id: 'v2', state: 'TRANSCODING' });

    const service = new LearnService(videos);
    const view = await service.getLessonView(
      makeCourse(),
      makeLesson({ videoId: 'v2' as any }),
    );

    expect(view.lesson.videoState).toBe('TRANSCODING');
  });

  it('lesson.description falls back to empty string when undefined on the entity', async () => {
    const fs = new FakeFirestore();
    const videos = new VideoRepository(fs as any);
    const service = new LearnService(videos);
    const view = await service.getLessonView(makeCourse(), makeLesson({ description: undefined }));
    expect(view.lesson.description).toBe('');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm nx test api-courses -- -t "LearnService"`

Expected: FAIL — module `./learn.service` not found.

- [ ] **Step 3: Implement the service**

Create `libs/api-courses/src/lib/learn/learn.service.ts`:

```ts
import { Injectable } from '@nestjs/common';

import type { Course, Lesson, LessonView } from '@learnwren/shared-data-models';

import { VideoRepository } from '../video/video.repository';

@Injectable()
export class LearnService {
  constructor(private readonly videos: VideoRepository) {}

  async getLessonView(course: Course, lesson: Lesson): Promise<LessonView> {
    let videoState: LessonView['lesson']['videoState'] = null;
    if (lesson.videoId) {
      const video = await this.videos.getVideo(lesson.videoId);
      videoState = video?.state ?? null;
    }

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
    };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm nx test api-courses -- -t "LearnService"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/learn/learn.service.ts libs/api-courses/src/lib/learn/learn.service.spec.ts
git commit -m "feat(api-courses): add LearnService — LessonView projection"
```

---

## Task 8: `LearnController` — controller + module wiring

**Files:**
- Create: `libs/api-courses/src/lib/learn/learn.controller.ts`
- Create: `libs/api-courses/src/lib/learn/learn.controller.spec.ts`
- Modify: `libs/api-courses/src/lib/courses.module.ts`

- [ ] **Step 1: Write the failing controller test**

Create `libs/api-courses/src/lib/learn/learn.controller.spec.ts`. Mirror the structure of `libs/api-courses/src/lib/enrollment/enrollment.controller.spec.ts` — open it to see the established pattern (uses `Test.createTestingModule`, attaches the cookie session, drives the controller through HTTP):

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { describe, expect, it } from 'vitest';

// Reuse the same module-under-test bootstrap helpers as enrollment.controller.spec.ts
// (e.g. buildTestModule, signInAs, seedPublishedCourseWithLesson).

describe('LearnController', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('200 returns the LessonView for an enrolled student on a PUBLISHED course', async () => {
    const { cid, lid, cookie } = await arrangeEnrolledStudent(app);
    const res = await request(app.getHttpServer())
      .get(`/api/learn/courses/${cid}/lessons/${lid}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(res.body).toMatchObject({
      course: { id: cid, status: 'PUBLISHED' },
      lesson: { id: lid, videoState: 'READY' },
    });
  });

  it('401 when no session cookie is present', async () => {
    await request(app.getHttpServer())
      .get('/api/learn/courses/anything/lessons/anything')
      .expect(401);
  });

  it('403 NOT_LESSON_OWNER for an authenticated unenrolled student', async () => {
    const { cid, lid, cookie } = await arrangeUnenrolledStudent(app);
    await request(app.getHttpServer())
      .get(`/api/learn/courses/${cid}/lessons/${lid}`)
      .set('Cookie', cookie)
      .expect(403)
      .expect((r) => expect(r.body.error.code).toBe('NOT_LESSON_OWNER'));
  });

  it('404 LESSON_NOT_FOUND when the lesson belongs to a different course', async () => {
    const { cidA, cidB, lidB, cookie } = await arrangeCrossCourseLesson(app);
    await request(app.getHttpServer())
      .get(`/api/learn/courses/${cidA}/lessons/${lidB}`)
      .set('Cookie', cookie)
      .expect(404)
      .expect((r) => expect(r.body.error.code).toBe('LESSON_NOT_FOUND'));
  });
});
```

(Replace the `arrange*` helper names with whatever idiom the enrollment controller spec uses; do not invent a new test bootstrap.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test api-courses -- -t "LearnController"`

Expected: FAIL — module `./learn.controller` not found.

- [ ] **Step 3: Implement the controller**

Create `libs/api-courses/src/lib/learn/learn.controller.ts`:

```ts
import { Controller, Get, Req, UseGuards } from '@nestjs/common';

import type { LessonView } from '@learnwren/shared-data-models';

import { FirebaseSessionGuard } from '@learnwren/api-auth';

import { LearnService } from './learn.service';
import { LessonEnrollmentOrOwnerGuard } from './guards/lesson-enrollment-or-owner.guard';
import type { LessonScopedRequest } from './types/lesson-scoped-request';

@Controller('learn')
@UseGuards(FirebaseSessionGuard, LessonEnrollmentOrOwnerGuard)
export class LearnController {
  constructor(private readonly service: LearnService) {}

  @Get('courses/:cid/lessons/:lid')
  async getLesson(@Req() req: LessonScopedRequest): Promise<LessonView> {
    return this.service.getLessonView(req.course, req.lesson);
  }
}
```

(The exact import path for `FirebaseSessionGuard` is `@learnwren/api-auth` per the existing wiring — verify with `grep -rn "FirebaseSessionGuard" libs/api-courses/src` if uncertain.)

- [ ] **Step 4: Wire into `CoursesModule`**

Edit `libs/api-courses/src/lib/courses.module.ts`. Add:

```ts
import { LearnController } from './learn/learn.controller';
import { LearnService } from './learn/learn.service';
import { LessonEnrollmentOrOwnerGuard } from './learn/guards/lesson-enrollment-or-owner.guard';
```

Add `LearnController` to the `controllers` array, and `LearnService` + `LessonEnrollmentOrOwnerGuard` to `providers`.

- [ ] **Step 5: Run the controller test to verify it passes**

Run: `pnpm nx test api-courses -- -t "LearnController"`

Expected: PASS.

- [ ] **Step 6: Run the whole api-courses spec**

Run: `pnpm nx test api-courses`

Expected: All pass.

- [ ] **Step 7: Build the api app to confirm no DI wiring regression**

Run: `pnpm nx build api`

Expected: Builds clean.

- [ ] **Step 8: Commit**

```bash
git add libs/api-courses/src/lib/learn/learn.controller.ts libs/api-courses/src/lib/learn/learn.controller.spec.ts libs/api-courses/src/lib/courses.module.ts
git commit -m "feat(api-courses): add LearnController — GET /api/learn/courses/:cid/lessons/:lid"
```

---

## Task 9: api-e2e for the `/learn` endpoint

**Files:**
- Create: `apps/api-e2e/src/learn.e2e-spec.ts`

- [ ] **Step 1: Bootstrap the spec by copying the structure of `enrollment.e2e-spec.ts`**

Open `apps/api-e2e/src/enrollment.e2e-spec.ts` and replicate its header (admin init, helper imports, seed helpers). Create `apps/api-e2e/src/learn.e2e-spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

import {
  API_BASE,
  initAdmin,
  registerAndPromoteInstructor,
  registerStudent,
} from './_helpers/auth';

initAdmin();

async function seedCourse(args: {
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  instructorId: string;
}): Promise<string> {
  // copy the seedCourse pattern from enrollment.e2e-spec.ts;
  // do NOT seed enrollmentCount logic here — it is not relevant to /learn
}

async function seedLesson(args: {
  courseId: string;
  moduleId: string;
  videoState?: 'READY' | 'TRANSCODING';
}): Promise<{ lessonId: string; videoId: string | null }> {
  // seed a module doc, a lesson doc, and (if videoState given) a video doc;
  // return their IDs. Match the existing seed helpers used by playback.e2e-spec.ts.
}

async function seedEnrollment(args: {
  userId: string;
  courseId: string;
  status: 'ACTIVE' | 'WITHDRAWN';
}): Promise<void> {
  // copy from enrollment.e2e-spec.ts; the composite ID is `${uid}__${cid}`
}
```

- [ ] **Step 2: Write each scenario as a Playwright test**

Add the following tests after the helpers — each is independent (no shared mutable state):

```ts
test('200 for an enrolled student on a PUBLISHED course', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor();
  const cid = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const { lessonId } = await seedLesson({ courseId: cid, moduleId: 'm1', videoState: 'READY' });
  const student = await registerStudent({ verified: true });
  await seedEnrollment({ userId: student.uid, courseId: cid, status: 'ACTIVE' });

  const res = await request.get(`${API_BASE}/learn/courses/${cid}/lessons/${lessonId}`, {
    headers: { Cookie: student.sessionCookie },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.course.id).toBe(cid);
  expect(body.lesson.id).toBe(lessonId);
  expect(body.lesson.videoState).toBe('READY');
});

test('403 NOT_LESSON_OWNER for an unenrolled student', async ({ request }) => {
  // seed PUBLISHED + lesson + student (no enrolment), call endpoint, assert 403
});

test('200 for the owner of a DRAFT course', async ({ request }) => {
  // seed DRAFT + lesson + instructor cookie, assert 200
});

test('403 NOT_LESSON_OWNER for an enrolled student on a DRAFT course', async ({ request }) => {
  // seed DRAFT + lesson + active enrolment, assert 403
});

test('401 unauthenticated', async ({ request }) => {
  const res = await request.get(`${API_BASE}/learn/courses/c/lessons/l`);
  expect(res.status()).toBe(401);
});

test('404 LESSON_NOT_FOUND when the lesson belongs to a different course', async ({ request }) => {
  // seed two courses A and B, seed a lesson under B; call /learn/courses/A/lessons/{lidB}; assert 404
});

test('404 LESSON_NOT_FOUND for a missing lesson id', async ({ request }) => {
  // seed PUBLISHED + active enrolment; call /learn/courses/{cid}/lessons/does-not-exist; assert 404
});

test('404 LESSON_NOT_FOUND for a missing course id', async ({ request }) => {
  // call /learn/courses/does-not-exist/lessons/anything with any auth; assert 404
});
```

Fill each test body following the patterns from `enrollment.e2e-spec.ts`. Each test should clean up via the existing teardown idiom (or be self-contained with unique IDs as `seedCourse` already does).

- [ ] **Step 3: Run the e2e suite**

Run (with `pnpm emulators` and `pnpm start:api` already running): `pnpm nx e2e api-e2e -- -g "learn"`

Expected: All learn tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api-e2e/src/learn.e2e-spec.ts
git commit -m "test(api-e2e): cover /api/learn/courses/:cid/lessons/:lid"
```

---

## Task 10: Un-fixme the EP-06 widening test in `playback.e2e-spec.ts`

**Files:**
- Modify: `apps/api-e2e/src/playback.e2e-spec.ts`

- [ ] **Step 1: Read the existing fixme'd test**

Open `apps/api-e2e/src/playback.e2e-spec.ts` and locate the block at the line containing `test.fixme('403 NOT_VIDEO_OWNER for a student (EP-06 widens this branch)'`. Read both the test and the seed helpers near it.

- [ ] **Step 2: Replace the fixme with the positive assertion**

Change:

```ts
test.fixme('403 NOT_VIDEO_OWNER for a student (EP-06 widens this branch)', async ({ request }) => {
  // ... existing body asserting 403
});
```

to:

```ts
test('200 OK for an enrolled student on a PUBLISHED course', async ({ request }) => {
  // Setup: instructor + PUBLISHED course + READY video; second user is a verified
  // student who enrols via POST /api/enrollments (do not seed the doc directly —
  // exercise the real endpoint to keep the test end-to-end).
  const instructor = await registerAndPromoteInstructor();
  const cid = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const { videoId } = await seedLessonWithReadyVideo({ courseId: cid });
  const student = await registerStudent({ verified: true });

  const enrol = await request.post(`${API_BASE}/enrollments`, {
    headers: { Cookie: student.sessionCookie },
    data: { courseId: cid },
  });
  expect(enrol.status()).toBe(201);

  const res = await request.get(`${API_BASE}/playback/manifest/${videoId}`, {
    headers: { Cookie: student.sessionCookie },
  });
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toMatch(/#EXTM3U/);
});
```

- [ ] **Step 3: Add the unpublish-revocation sibling test**

Append:

```ts
test('403 NOT_VIDEO_OWNER for an enrolled student after the course is unpublished', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor();
  const cid = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const { videoId } = await seedLessonWithReadyVideo({ courseId: cid });
  const student = await registerStudent({ verified: true });
  await request.post(`${API_BASE}/enrollments`, {
    headers: { Cookie: student.sessionCookie },
    data: { courseId: cid },
  });

  const unpublish = await request.post(`${API_BASE}/courses/${cid}/unpublish`, {
    headers: { Cookie: instructor.sessionCookie },
  });
  expect(unpublish.status()).toBe(200);

  const res = await request.get(`${API_BASE}/playback/manifest/${videoId}`, {
    headers: { Cookie: student.sessionCookie },
  });
  expect(res.status()).toBe(403);
});
```

- [ ] **Step 4: Add the unenrol-revocation sibling test**

Append:

```ts
test('403 NOT_VIDEO_OWNER for a student after they unenrol', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor();
  const cid = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const { videoId } = await seedLessonWithReadyVideo({ courseId: cid });
  const student = await registerStudent({ verified: true });
  await request.post(`${API_BASE}/enrollments`, {
    headers: { Cookie: student.sessionCookie },
    data: { courseId: cid },
  });
  await request.delete(`${API_BASE}/enrollments/${cid}`, {
    headers: { Cookie: student.sessionCookie },
  });

  const res = await request.get(`${API_BASE}/playback/manifest/${videoId}`, {
    headers: { Cookie: student.sessionCookie },
  });
  expect(res.status()).toBe(403);
});
```

(If `seedLessonWithReadyVideo` does not exist in this file, find the closest existing helper that seeds a READY video and reuse it; do not invent a new pipeline.)

- [ ] **Step 5: Run the suite to confirm the new tests pass and nothing else broke**

Run: `pnpm nx e2e api-e2e -- -g "playback"`

Expected: All previously-passing playback tests still pass; the three new tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api-e2e/src/playback.e2e-spec.ts
git commit -m "test(api-e2e): un-quarantine EP-06 playback widening test; add revocation siblings"
```

---

## Task 11: Add `fatalError` output to `VideoPlayerComponent`

The lesson page needs a way to react to player fatal errors. The existing `VideoPlayerService` already surfaces `onFatalError`; the component must propagate it.

**Files:**
- Modify: `libs/web-video/src/lib/player/video-player.component.ts`
- Modify: `libs/web-video/src/lib/player/video-player.component.spec.ts`
- Modify (maybe): `libs/web-video/src/index.ts`

- [ ] **Step 1: Inspect the current component**

Open `libs/web-video/src/lib/player/video-player.component.ts`. Note (a) whether an `output()` named `fatalError` (or `onFatalError`) already exists; (b) how the component wires `VideoPlayerService.attach(..., { onFatalError })`.

- [ ] **Step 2: Add or confirm the output**

If no `fatalError` output exists, add it:

```ts
import { output } from '@angular/core';
// ...
readonly fatalError = output<void>();
```

In the place where `VideoPlayerService.attach` is called, ensure the `onFatalError` callback emits the output:

```ts
this.svc.attach(el, this.manifestUrl(), {
  onFatalError: () => this.fatalError.emit(),
});
```

If a comparable output already exists under a different name, **do not rename it** — match the existing API and adjust Task 13's page component to call the existing name.

- [ ] **Step 3: Extend the component spec**

Open `libs/web-video/src/lib/player/video-player.component.spec.ts` and add:

```ts
it('emits fatalError when the player service reports a fatal error', () => {
  // Mount the component with a stub VideoPlayerService whose attach() invokes
  // its options.onFatalError synchronously. Subscribe to component.fatalError
  // and assert the emission count is 1.
});
```

Implement the test body following the existing stub idiom in the file.

- [ ] **Step 4: Run the spec to verify the new test passes**

Run: `pnpm nx test web-video -- -t "fatalError"`

Expected: PASS.

- [ ] **Step 5: Confirm the component is exported**

Open `libs/web-video/src/index.ts`. Ensure `VideoPlayerComponent` is exported. If not, add:

```ts
export { VideoPlayerComponent } from './lib/player/video-player.component';
```

- [ ] **Step 6: Run the full web-video spec to confirm no regression**

Run: `pnpm nx test web-video`

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add libs/web-video/
git commit -m "feat(web-video): add fatalError output to VideoPlayerComponent"
```

---

## Task 12: Generate the `web-learn` library

**Files:**
- Generated by Nx: `libs/web-learn/**`

- [ ] **Step 1: Run the Nx generator**

Run:

```bash
pnpm nx g @nx/angular:library web-learn \
  --directory=libs/web-learn \
  --standalone \
  --skipModule \
  --buildable=false \
  --tags=scope:web,type:feature \
  --unitTestRunner=vitest \
  --linter=eslint \
  --no-interactive
```

(Adjust flags to match what `web-enrollment` was generated with — check `libs/web-enrollment/project.json` to confirm the exact tags and the unit test runner used in this workspace.)

Expected: Creates `libs/web-learn/` with `project.json`, `tsconfig*.json`, `src/index.ts`, `src/lib/` (empty or with placeholder files), and updates `tsconfig.base.json` to add the path alias `@learnwren/web-learn`.

- [ ] **Step 2: Verify the path alias was added**

Run: `grep -n "web-learn" tsconfig.base.json`

Expected: An entry like `"@learnwren/web-learn": ["libs/web-learn/src/index.ts"]`.

- [ ] **Step 3: Remove the generator-placeholder component if any**

Generators sometimes scaffold a sample component. Delete any `libs/web-learn/src/lib/web-learn.component.*` files and clear `libs/web-learn/src/index.ts` to an empty re-export hub:

```ts
// libs/web-learn/src/index.ts
export {};
```

- [ ] **Step 4: Confirm the lib builds and lints clean as an empty shell**

Run: `pnpm nx typecheck web-learn && pnpm nx lint web-learn`

Expected: Both pass.

- [ ] **Step 5: Commit**

```bash
git add libs/web-learn/ tsconfig.base.json pnpm-lock.yaml package.json
git commit -m "chore(web-learn): scaffold new Angular standalone library"
```

(The `pnpm-lock.yaml` / `package.json` only change if the generator updated them; otherwise omit.)

---

## Task 13: `LearnService` in `web-learn` (signal-based fetcher)

**Files:**
- Create: `libs/web-learn/src/lib/learn.service.ts`
- Create: `libs/web-learn/src/lib/learn.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `libs/web-learn/src/lib/learn.service.spec.ts`. Match the structure of `libs/web-enrollment/src/lib/enrollment.service.spec.ts` — open that file first so the imports, `HttpTestingController` setup, and signal-assertion idioms are identical:

```ts
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';

import type { CourseId, LessonId, LessonView } from '@learnwren/shared-data-models';

import { LearnService } from './learn.service';

const cid = 'c1' as CourseId;
const lid = 'l1' as LessonId;

function viewFixture(): LessonView {
  return {
    course: { id: cid, title: 'C', status: 'PUBLISHED' },
    lesson: {
      id: lid,
      moduleId: 'm1' as any,
      title: 'L',
      description: 'D',
      videoId: 'v1' as any,
      videoState: 'READY',
    },
  };
}

describe('LearnService', () => {
  let svc: LearnService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LearnService, provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(LearnService);
    http = TestBed.inject(HttpTestingController);
  });

  it('starts in the idle state', () => {
    expect(svc.lessonView()).toEqual({ kind: 'idle' });
  });

  it('transitions to loading then ok on a 200', () => {
    svc.load(cid, lid);
    expect(svc.lessonView()).toEqual({ kind: 'loading' });
    const req = http.expectOne(`/api/learn/courses/${cid}/lessons/${lid}`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush(viewFixture());
    expect(svc.lessonView()).toEqual({ kind: 'ok', value: viewFixture() });
  });

  it('maps a 403 to the not-enrolled error state', () => {
    svc.load(cid, lid);
    http.expectOne(() => true).flush({ error: { code: 'NOT_LESSON_OWNER' } }, { status: 403, statusText: 'Forbidden' });
    expect(svc.lessonView()).toEqual({ kind: 'error', reason: 'not-enrolled' });
  });

  it('maps a 404 to the not-found error state', () => {
    svc.load(cid, lid);
    http.expectOne(() => true).flush({ error: { code: 'LESSON_NOT_FOUND' } }, { status: 404, statusText: 'Not Found' });
    expect(svc.lessonView()).toEqual({ kind: 'error', reason: 'not-found' });
  });

  it('maps a 500 to the generic error state', () => {
    svc.load(cid, lid);
    http.expectOne(() => true).flush({}, { status: 500, statusText: 'Server Error' });
    expect(svc.lessonView()).toEqual({ kind: 'error', reason: 'other' });
  });

  it('a subsequent load resets the state to loading before the response arrives', () => {
    svc.load(cid, lid);
    http.expectOne(() => true).flush(viewFixture());
    expect(svc.lessonView()).toEqual({ kind: 'ok', value: viewFixture() });

    svc.load(cid, lid);
    expect(svc.lessonView()).toEqual({ kind: 'loading' });
    http.expectOne(() => true).flush(viewFixture());
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm nx test web-learn`

Expected: FAIL — `LearnService` not found.

- [ ] **Step 3: Implement the service**

Create `libs/web-learn/src/lib/learn.service.ts`:

```ts
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';

import type { CourseId, LessonId, LessonView } from '@learnwren/shared-data-models';

export type LearnErrorReason = 'not-enrolled' | 'not-found' | 'other';

export type RemoteLessonView =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; value: LessonView }
  | { kind: 'error'; reason: LearnErrorReason };

@Injectable({ providedIn: 'root' })
export class LearnService {
  private readonly http = inject(HttpClient);
  private readonly state = signal<RemoteLessonView>({ kind: 'idle' });
  readonly lessonView = this.state.asReadonly();

  load(courseId: CourseId, lessonId: LessonId): void {
    this.state.set({ kind: 'loading' });
    this.http
      .get<LessonView>(`/api/learn/courses/${courseId}/lessons/${lessonId}`, {
        withCredentials: true,
      })
      .subscribe({
        next: (value) => this.state.set({ kind: 'ok', value }),
        error: (err: HttpErrorResponse) => {
          const reason: LearnErrorReason =
            err.status === 403 ? 'not-enrolled' : err.status === 404 ? 'not-found' : 'other';
          this.state.set({ kind: 'error', reason });
        },
      });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm nx test web-learn`

Expected: All pass.

- [ ] **Step 5: Re-export from the package**

Edit `libs/web-learn/src/index.ts`:

```ts
export { LearnService } from './lib/learn.service';
export type { RemoteLessonView, LearnErrorReason } from './lib/learn.service';
```

- [ ] **Step 6: Commit**

```bash
git add libs/web-learn/src/lib/learn.service.ts libs/web-learn/src/lib/learn.service.spec.ts libs/web-learn/src/index.ts
git commit -m "feat(web-learn): add signal-based LearnService"
```

---

## Task 14: `LessonPlayerPageComponent` — page component

**Files:**
- Create: `libs/web-learn/src/lib/lesson-player-page.component.ts`
- Create: `libs/web-learn/src/lib/lesson-player-page.component.html`
- Create: `libs/web-learn/src/lib/lesson-player-page.component.spec.ts`

- [ ] **Step 1: Write the failing component spec**

Open `libs/web-enrollment/src/lib/course-enrollment-panel/course-enrollment-panel.component.spec.ts` for the established TestBed-with-signals idiom. Create `libs/web-learn/src/lib/lesson-player-page.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, beforeEach } from 'vitest';

import type { LessonView } from '@learnwren/shared-data-models';

import { LearnService } from './learn.service';
import { LessonPlayerPageComponent } from './lesson-player-page.component';

function readyView(overrides: Partial<LessonView['lesson']> = {}): LessonView {
  return {
    course: { id: 'c1' as any, title: 'Course', status: 'PUBLISHED' },
    lesson: {
      id: 'l1' as any,
      moduleId: 'm1' as any,
      title: 'Lesson One',
      description: 'Lesson description',
      videoId: 'v1' as any,
      videoState: 'READY',
      ...overrides,
    },
  };
}

class FakeLearnService {
  state = signal<RemoteLessonView>({ kind: 'idle' });
  lessonView = this.state.asReadonly();
  load = vi.fn((cid: any, lid: any) => {
    // tests set the state directly to drive the component
  });
}

describe('LessonPlayerPageComponent', () => {
  let fake: FakeLearnService;

  beforeEach(() => {
    fake = new FakeLearnService();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: LearnService, useValue: fake },
      ],
    });
  });

  it('renders a loading skeleton when the service is loading', () => {
    fake.state.set({ kind: 'loading' });
    const fixture = TestBed.createComponent(LessonPlayerPageComponent);
    fixture.componentRef.setInput('courseId', 'c1');
    fixture.componentRef.setInput('lessonId', 'l1');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="lesson-skeleton"]')).toBeTruthy();
  });

  it('renders the player with the correct manifest URL when the video is READY', () => {
    fake.state.set({ kind: 'ok', value: readyView() });
    const fixture = TestBed.createComponent(LessonPlayerPageComponent);
    fixture.componentRef.setInput('courseId', 'c1');
    fixture.componentRef.setInput('lessonId', 'l1');
    fixture.detectChanges();
    const player = fixture.nativeElement.querySelector('lw-video-player');
    expect(player).toBeTruthy();
    expect(player.getAttribute('ng-reflect-manifest-url') ?? player.manifestUrl).toBe('/api/playback/manifest/v1');
  });

  it('renders the "still being processed" panel when videoState !== READY', () => {
    fake.state.set({ kind: 'ok', value: readyView({ videoState: 'TRANSCODING' }) });
    const fixture = TestBed.createComponent(LessonPlayerPageComponent);
    fixture.componentRef.setInput('courseId', 'c1');
    fixture.componentRef.setInput('lessonId', 'l1');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('still being processed');
    expect(fixture.nativeElement.querySelector('lw-video-player')).toBeFalsy();
  });

  it('renders the "still being processed" panel when videoId is null', () => {
    fake.state.set({ kind: 'ok', value: readyView({ videoId: null, videoState: null }) });
    const fixture = TestBed.createComponent(LessonPlayerPageComponent);
    fixture.componentRef.setInput('courseId', 'c1');
    fixture.componentRef.setInput('lessonId', 'l1');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('still being processed');
  });

  it('renders the not-enrolled panel on a 403', () => {
    fake.state.set({ kind: 'error', reason: 'not-enrolled' });
    const fixture = TestBed.createComponent(LessonPlayerPageComponent);
    fixture.componentRef.setInput('courseId', 'c1');
    fixture.componentRef.setInput('lessonId', 'l1');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("not enrolled");
    const back = fixture.nativeElement.querySelector('a[data-testid="back-to-course"]');
    expect(back?.getAttribute('href') ?? back?.routerLink).toContain('/catalog/c1');
  });

  it('renders the not-found panel on a 404', () => {
    fake.state.set({ kind: 'error', reason: 'not-found' });
    const fixture = TestBed.createComponent(LessonPlayerPageComponent);
    fixture.componentRef.setInput('courseId', 'c1');
    fixture.componentRef.setInput('lessonId', 'l1');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Lesson not available');
  });

  it('swaps the player for a fatal-error panel when fatalError fires', () => {
    fake.state.set({ kind: 'ok', value: readyView() });
    const fixture = TestBed.createComponent(LessonPlayerPageComponent);
    fixture.componentRef.setInput('courseId', 'c1');
    fixture.componentRef.setInput('lessonId', 'l1');
    fixture.detectChanges();

    const player = fixture.debugElement.query((n) => n.name === 'lw-video-player');
    player.triggerEventHandler('fatalError', undefined);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('lw-video-player')).toBeFalsy();
    expect(fixture.nativeElement.textContent).toContain('Unable to play video');
  });

  it('calls load() on init with the route-bound inputs', () => {
    const fixture = TestBed.createComponent(LessonPlayerPageComponent);
    fixture.componentRef.setInput('courseId', 'c1');
    fixture.componentRef.setInput('lessonId', 'l1');
    fixture.detectChanges();
    expect(fake.load).toHaveBeenCalledWith('c1', 'l1');
  });
});
```

(Adjust the `manifest-url` reading idiom to whatever the `web-video` test specs use — `ng-reflect-*` attributes appear when the binding is via property-binding; signal-input bindings show up via DOM attribute or via debugElement properties. Mirror an existing component spec that consumes `VideoPlayerComponent`.)

- [ ] **Step 2: Run the spec to see it fail**

Run: `pnpm nx test web-learn -- -t "LessonPlayerPageComponent"`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `libs/web-learn/src/lib/lesson-player-page.component.html`:

```html
@if (state(); as s) {
  @switch (s.kind) {
    @case ('loading') {
      <div data-testid="lesson-skeleton" class="animate-pulse">
        <div class="h-8 w-1/2 bg-gray-200 rounded mb-4"></div>
        <div class="aspect-video w-full bg-gray-200 rounded"></div>
      </div>
    }

    @case ('error') {
      @if (s.reason === 'not-enrolled') {
        <div class="rounded border p-6">
          <h1 class="text-xl font-semibold">You're not enrolled in this course</h1>
          <p class="mt-2 text-sm text-gray-600">Enroll to start watching lessons.</p>
          <a data-testid="back-to-course" class="mt-4 inline-block underline"
             [routerLink]="['/catalog', courseId()]">← Back to course</a>
        </div>
      } @else if (s.reason === 'not-found') {
        <div class="rounded border p-6">
          <h1 class="text-xl font-semibold">Lesson not available</h1>
          <p class="mt-2 text-sm text-gray-600">This lesson could not be found.</p>
          <a data-testid="back-to-course" class="mt-4 inline-block underline"
             [routerLink]="['/catalog', courseId()]">← Back to course</a>
        </div>
      } @else {
        <div class="rounded border p-6">
          <h1 class="text-xl font-semibold">Something went wrong</h1>
          <button class="mt-4 underline" (click)="retry()">Retry</button>
        </div>
      }
    }

    @case ('ok') {
      <article class="space-y-4">
        <h1 class="text-2xl font-semibold">{{ s.value.lesson.title }}</h1>
        <p class="text-sm text-gray-700">{{ s.value.lesson.description }}</p>

        @if (playerFatal()) {
          <div class="rounded border p-6 bg-red-50">
            Unable to play video. Please try again later.
          </div>
        } @else if (manifestUrl(); as url) {
          <lw-video-player [manifestUrl]="url" (fatalError)="onFatalError()" />
        } @else {
          <div class="rounded border p-6 bg-amber-50">
            This lesson's video is still being processed. Please check back later.
          </div>
        }

        <a data-testid="back-to-course" class="inline-block underline"
           [routerLink]="['/catalog', courseId()]">← Back to course</a>
      </article>
    }
  }
}
```

Create `libs/web-learn/src/lib/lesson-player-page.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { CourseId, LessonId } from '@learnwren/shared-data-models';

import { VideoPlayerComponent } from '@learnwren/web-video';

import { LearnService } from './learn.service';

@Component({
  selector: 'lw-lesson-player-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, VideoPlayerComponent],
  templateUrl: './lesson-player-page.component.html',
})
export class LessonPlayerPageComponent implements OnInit {
  private readonly learn = inject(LearnService);

  readonly courseId = input.required<CourseId>();
  readonly lessonId = input.required<LessonId>();

  readonly state = this.learn.lessonView;
  readonly playerFatal = signal(false);

  readonly manifestUrl = computed(() => {
    const s = this.state();
    if (s.kind !== 'ok') return null;
    const v = s.value.lesson;
    return v.videoId && v.videoState === 'READY' ? `/api/playback/manifest/${v.videoId}` : null;
  });

  ngOnInit(): void {
    this.learn.load(this.courseId(), this.lessonId());
  }

  retry(): void {
    this.playerFatal.set(false);
    this.learn.load(this.courseId(), this.lessonId());
  }

  onFatalError(): void {
    this.playerFatal.set(true);
  }
}
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `pnpm nx test web-learn -- -t "LessonPlayerPageComponent"`

Expected: All pass.

- [ ] **Step 5: Confirm lint and typecheck**

Run: `pnpm nx lint web-learn && pnpm nx typecheck web-learn`

Expected: Pass.

- [ ] **Step 6: Commit**

```bash
git add libs/web-learn/src/lib/
git commit -m "feat(web-learn): add LessonPlayerPageComponent"
```

---

## Task 15: `learn.routes.ts` and wire into the app

**Files:**
- Create: `libs/web-learn/src/lib/learn.routes.ts`
- Modify: `libs/web-learn/src/index.ts`
- Modify: `apps/web/src/app/app.routes.ts`

- [ ] **Step 1: Write the routes file**

Create `libs/web-learn/src/lib/learn.routes.ts`:

```ts
import type { Route } from '@angular/router';

import { authGuard } from '@learnwren/web-auth';

export const learnRoutes: Route[] = [
  {
    path: 'learn/:courseId/:lessonId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./lesson-player-page.component').then((m) => m.LessonPlayerPageComponent),
  },
];
```

- [ ] **Step 2: Export from the package**

Edit `libs/web-learn/src/index.ts`:

```ts
export { learnRoutes } from './lib/learn.routes';
export { LearnService } from './lib/learn.service';
export type { RemoteLessonView, LearnErrorReason } from './lib/learn.service';
```

- [ ] **Step 3: Spread into the app router**

Edit `apps/web/src/app/app.routes.ts`. Add the import:

```ts
import { learnRoutes } from '@learnwren/web-learn';
```

And spread the array alongside `catalogRoutes` and `coursesRoutes`:

```ts
...catalogRoutes,
...coursesRoutes,
...learnRoutes,
```

- [ ] **Step 4: Type-check and build the app**

Run: `pnpm nx typecheck web && pnpm nx build web`

Expected: Both pass.

- [ ] **Step 5: Commit**

```bash
git add libs/web-learn/src/ apps/web/src/app/app.routes.ts
git commit -m "feat(web-learn): wire /learn/:courseId/:lessonId route into the SPA"
```

---

## Task 16: Start Learning button on `CourseDetailPageComponent`

**Files:**
- Modify: `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.ts`
- Modify: `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.html`
- Modify: `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.spec.ts`

(File paths above use the conventional Angular component file naming; if the existing component lives in a slightly different path, adapt accordingly — `grep -rn "CourseDetailPageComponent" libs/web-catalog/src` to locate it.)

- [ ] **Step 1: Add the failing tests**

Open the spec file. Add the following cases (preserving existing tests):

```ts
it('shows Start Learning for an enrolled student linking to the first lesson by order', () => {
  // Render the component with:
  //   course() = a course whose modules[0].lessons = [{ id: 'L_FIRST', title: 'L1' }, { id: 'L2', title: 'L2' }]
  //   enrollmentStatus() = { enrollment: { status: 'ACTIVE', ... }, isOwner: false }
  // Assert: an anchor with data-testid="start-learning" exists and its routerLink equals
  // ['/learn', course.id, 'L_FIRST'] (or its href contains /learn/{cid}/L_FIRST).
});

it('shows Start Learning for the owner', () => {
  // enrollmentStatus = { enrollment: null, isOwner: true }
});

it('hides Start Learning for a guest (enrollmentStatus is null)', () => {
  // No status loaded; assert the start-learning anchor is absent.
});

it('hides Start Learning for an unenrolled authenticated student', () => {
  // enrollmentStatus = { enrollment: null, isOwner: false }
});

it('shows the "No lessons yet" disabled state for an enrolled student on a course with no lessons', () => {
  // course().modules = [] (or modules with empty lessons arrays)
  // enrollmentStatus = { enrollment: { status: 'ACTIVE', ... }, isOwner: false }
  // Assert: anchor is absent; element with data-testid="no-lessons" present.
});

it('uses modules[0].lessons[0] as the first lesson (backend already sorts by order)', () => {
  // Sanity test — the catalog response is sorted, so the FE just takes index 0.
});
```

Fill the bodies following the existing component spec idiom (TestBed.createComponent + signal stub inputs).

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm nx test web-catalog -- -t "Start Learning|No lessons"`

Expected: FAIL — neither the button nor the empty-state element renders.

- [ ] **Step 3: Add the computed signals**

Edit the component class. Add (inside the class body):

```ts
readonly firstLessonHref = computed<readonly [string, string, string] | null>(() => {
  const c = this.course();
  const lid = c?.modules?.[0]?.lessons?.[0]?.id;
  return c && lid ? (['/learn', c.id, lid] as const) : null;
});

readonly canStartLearning = computed<boolean>(() => {
  const status = this.enrollmentStatus();
  return Boolean(this.firstLessonHref()) &&
    (status?.isOwner === true || status?.enrollment?.status === 'ACTIVE');
});

readonly showNoLessons = computed<boolean>(() => {
  if (this.firstLessonHref()) return false;
  const status = this.enrollmentStatus();
  return Boolean(status?.isOwner) || status?.enrollment?.status === 'ACTIVE';
});
```

(Use the signal names that already exist for `course` and `enrollmentStatus` in the component — they should match the spec inputs. If the names differ, adapt the computeds.)

Make sure `computed` is imported from `@angular/core` if not already.

- [ ] **Step 4: Add the button to the template**

Edit `course-detail-page.component.html`. Locate the area where the enrolment panel is rendered. Insert directly above or below it:

```html
@if (canStartLearning()) {
  <a data-testid="start-learning"
     class="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-white"
     [routerLink]="firstLessonHref()">
    Start Learning
  </a>
} @else if (showNoLessons()) {
  <span data-testid="no-lessons" class="inline-block text-sm text-gray-500" aria-disabled="true">
    No lessons yet
  </span>
}
```

Add `RouterLink` to the component's `imports` array if not already present.

- [ ] **Step 5: Run the failing tests**

Run: `pnpm nx test web-catalog -- -t "Start Learning|No lessons"`

Expected: All pass.

- [ ] **Step 6: Run the entire web-catalog spec to confirm no regression**

Run: `pnpm nx test web-catalog`

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add libs/web-catalog/
git commit -m "feat(web-catalog): add Start Learning CTA to course detail page"
```

---

## Task 17: web-e2e for the lesson page

**Files:**
- Create: `apps/web-e2e/src/learn.e2e-spec.ts`

- [ ] **Step 1: Bootstrap from `enrollment.e2e-spec.ts`**

Open `apps/web-e2e/src/enrollment.e2e-spec.ts` (or `catalog.e2e-spec.ts`) and replicate the seed + login helpers. Create `apps/web-e2e/src/learn.e2e-spec.ts`:

```ts
import { expect, test } from '@playwright/test';

// reuse the helpers your other web-e2e specs use to seed an instructor,
// register/verify a student, and seed a PUBLISHED course with one module + one
// lesson backed by a READY video. Do not invent new helpers.

test('enrolled student can Start Learning from the course detail page', async ({ page }) => {
  const { courseId, lessonId } = await seedPublishedCourseWithReadyLesson();
  await registerAndVerifyStudent(page);

  await page.goto(`/catalog/${courseId}`);
  await page.getByRole('button', { name: 'Enroll' }).click();
  await page.getByRole('link', { name: 'Start Learning' }).click();

  await expect(page).toHaveURL(`/learn/${courseId}/${lessonId}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/.+/); // lesson title is rendered
  await expect(page.locator('lw-video-player video')).toBeVisible();
});

test('unauthenticated visit to /learn/:cid/:lid redirects to /login with redirect param', async ({ page }) => {
  await page.goto('/learn/some-course/some-lesson');
  await expect(page).toHaveURL(/\/login\?redirect=/);
});
```

- [ ] **Step 2: Run the e2e suite**

Run (with `pnpm emulators` and `pnpm start` running): `pnpm nx e2e web-e2e -- -g "learn"`

Expected: Both tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web-e2e/src/learn.e2e-spec.ts
git commit -m "test(web-e2e): cover Start Learning happy path and unauth redirect"
```

---

## Task 18: Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/USER_GUIDE.md`
- Modify: `docs/quality/spec-drift-report.md`

- [ ] **Step 1: README.md — extend the status callout and tables**

Open `README.md`. Find the `> [!NOTE] PROJECT STATUS: ACTIVE DEVELOPMENT` block. Add a new bullet after the EP-05 line:

```markdown
> - **EP-06 Slice A: Student lesson playback** — enrolled students (and the course owner) can navigate from the course detail page via **Start Learning** to `/learn/:cid/:lid` and watch the lesson video in the existing hls.js player. Mark Complete, Resume, and the course outline are deferred to subsequent EP-06 slices.
```

Add `web-learn` to the libs section of the layout tree and the project table — copy the entry style used for `web-enrollment`.

Add a new endpoint section after the EP-05 Slice B table:

```markdown
The API endpoints exposed by EP-06 Slice A (lesson playback for enrolled students):

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/learn/courses/:cid/lessons/:lid` | The caller's lesson view (course + lesson + video state); 403 unless owner or active enrollee on a PUBLISHED course. |
```

- [ ] **Step 2: USER_GUIDE.md — add a "Watch a lesson" section**

Open `docs/USER_GUIDE.md`. Find where EP-05 is documented and add an EP-06 Slice A section directly after it:

```markdown
## Watching a lesson as an enrolled student (EP-06 Slice A)

Once a student has enrolled in a PUBLISHED course, the course detail page (`/catalog/:cid`) shows a **Start Learning** button. Clicking it navigates to `/learn/:cid/:lid` for the first lesson of the first module — the page renders the lesson title, description, and the AES-128 HLS player (hls.js on Chrome/Firefox, native HLS on Safari/iOS).

The course's instructor sees the same Start Learning button on their own course (the playback gate allows them through for previewing).

Edge cases:
- A lesson whose video is still transcoding shows a "still being processed" panel in place of the player.
- A fatal player error (manifest 403 from a course unpublished mid-session, key fetch failure) swaps the player out for "Unable to play video. Please try again later."
- A logged-out visitor opening `/learn/:cid/:lid` directly is redirected to `/login` and bounced back after sign-in.
- A logged-in student who is not enrolled sees a "not enrolled" panel with a link back to the course detail page (defensive — Start Learning only shows to enrolled callers).

Deferred to later EP-06 slices: marking lessons complete, progress tracking, the "Continue Learning" / resume button, and the collapsible course outline panel.
```

- [ ] **Step 3: spec-drift-report.md — mark UC-06-01 as built**

Open `docs/quality/spec-drift-report.md`. In the EP-06 section, change the body:

From:
> **Drift: Deferred — entirely unbuilt.**

To:
> **Drift: Partially built (2026-05-25).** UC-06-01 (Watch a Lesson Video) ships as the minimal "player only" page — see `docs/superpowers/specs/2026-05-25-ep06-slice-a-student-playback-design.md`. The three remaining UCs are still deferred.

Remove the two "Low" drift bullets about `EnrollmentOrOwnerGuard` and `MaterialAccessGuard` carrying `TODO(EP-06)` — those markers were resolved in EP-05 Slice B and the report is stale on that point. (Verify by grepping for `TODO(EP-06)` in the codebase; the spec-drift report and `playback.e2e-spec.ts:128` were the last references, both addressed by this slice.)

In the "Unbuilt use cases" line, remove UC-06-01 and keep the other three.

- [ ] **Step 4: Verify docs build (if there's a docs target)**

Run: `pnpm nx graph --file=tmp/graph.json && echo "docs sanity check done"`

(The repo doesn't have a docs-build target; this is just a smoke check that the workspace still resolves.)

- [ ] **Step 5: Commit**

```bash
git add README.md docs/USER_GUIDE.md docs/quality/spec-drift-report.md
git commit -m "docs(ep06): document Slice A — student lesson playback"
```

---

## Task 19: Final integration pass

**Files:**
- None modified — verification only.

- [ ] **Step 1: Run lint across the affected projects**

Run: `pnpm affected --target=lint`

Expected: Clean.

- [ ] **Step 2: Run typecheck**

Run: `pnpm affected --target=typecheck`

Expected: Clean.

- [ ] **Step 3: Run the unit test suite**

Run: `pnpm affected --target=test`

Expected: All pass. If `web-video` regressions appear from the new `fatalError` output, check the owner editor's usage — it should ignore the new output by default (Angular outputs without listeners are fine).

- [ ] **Step 4: Build the apps**

Run: `pnpm nx build api && pnpm nx build web`

Expected: Both succeed.

- [ ] **Step 5: Run the full e2e suite**

Ensure `pnpm emulators` is running. In a separate terminal: `pnpm e2e`.

Expected: All Playwright suites pass, including the new `learn.e2e-spec.ts` files and the modified `playback.e2e-spec.ts`.

- [ ] **Step 6: Smoke-test in the browser**

With `pnpm emulators` and `pnpm start` running:

1. Promote a user to instructor (`pnpm tools:promote-to-instructor <email>`).
2. As the instructor, create a course, add a module + lesson, upload a video, wait for it to become READY, publish.
3. Sign out, register a fresh student, verify, sign in.
4. Visit `/catalog/:cid`, click Enroll, click Start Learning.
5. Confirm the lesson page loads, the player renders, video plays.
6. Test the negative path: sign out, visit `/learn/:cid/:lid` directly → redirected to `/login?redirect=...`.

- [ ] **Step 7: Final commit / merge to main**

Per the user's branch isolation preference (memory: `feedback_branch_isolation.md`), this branch lands on `main` via a local `--no-ff` merge from the working branch:

```bash
git checkout main
git merge --no-ff <slice-branch-name> -m "Merge EP-06 Slice A: student lesson playback"
```

Expected: Clean merge. No push; the user will push when ready.

---

## Self-Review (post-write)

**Spec coverage:**
- Goal bullets 1–11 from the spec each have a covering task:
  - Start Learning → Task 16. First-lesson resolution → Task 16 (and Task 2 for the data shape).
  - Owner can preview → Task 5 (owner branch) + Task 9 (e2e).
  - Direct URL → Task 15 (route) + Task 17 (e2e).
  - Authenticated but not enrolled → Task 13/14 + Task 9.
  - Not authenticated → Task 15 (authGuard) + Task 17.
  - Lesson missing / wrong course → Task 5/6 + Task 9.
  - Video not READY → Task 7 + Task 14.
  - Fatal player error → Task 11 + Task 14.
  - Un-fixme the playback test → Task 10.
  - Quality gates → Task 19.
- Non-goals are honored — no LessonProgress writes, no outline, no materials list, no captions.
- `CatalogModuleOutline` widening is concrete (Task 2) — the spec's verification step resolved to a real change because the existing payload exposes titles only.

**Placeholder scan:**
- No "TBD" / "TODO" / "implement later" / generic "add error handling" patterns. Every code step has actual code. Test bodies that delegate to "follow the existing pattern in file X" point at a real existing file in the codebase, not a fictional reference.

**Type consistency:**
- `LessonView` is defined in Task 1 and used unchanged in Tasks 7, 8, 13, 14.
- `RemoteLessonView` discriminated union is defined in Task 13 and consumed in Task 14 (via `state()` switch).
- `LearnService.lessonView` is a `Signal<RemoteLessonView>` in both Task 13 (definition) and Task 14 (consumer).
- `LessonEnrollmentOrOwnerGuard(courses, enrollment)` — constructor signature matches across Tasks 5 / 6 / 8.
- `firstLessonHref` returns `readonly [string, string, string] | null` in Task 16 and the template binds it via `[routerLink]` — Angular accepts arrays of route segments as routerLink commands.

No gaps found. Plan is ready for execution.
