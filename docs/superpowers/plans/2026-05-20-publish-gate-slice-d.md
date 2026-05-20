# Course Publish Gate (EP-03 Slice D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close US-02-04 / UC-02-04 by letting an instructor publish, unpublish, archive, and restore a course. Publish is gated server-side on a per-lesson eligibility rule: every module has ≥ 1 lesson, every lesson has a `Video` in state `READY`. Eligible failures are returned as a structured `PublishBlockReason[]` so the editor renders a per-lesson checklist; the publish-bar surfaces transitions and confirms the destructive ones.

**Architecture:** New `publish/` submodule under `libs/api-courses/src/lib/` — pure `composeReasons` rewriter + `PublishService` IO seam + extended `VideoServiceLike` runtime forwardRef seam (no new Nx edge). Five new routes added to the existing `CoursesController` (`GET /api/courses/:cid/publish-eligibility` + `POST /api/courses/:cid/{publish,unpublish,archive,restore}`). New `publish/` submodule under `libs/web-courses/src/lib/` — sticky `<lib-course-publish-bar>` + collapsible `<lib-publish-eligibility-panel>` + signal-based `PublishEligibilityService` with 500 ms debounce. One-line `(stateChanged)` `@Output` added to `VideoStateBadgeComponent` (slice B surface) so the editor can refresh eligibility when a video reaches `READY`. No new Firestore indexes, no rules changes, no env vars, no new libraries.

**Tech Stack:** NestJS 11, Angular 21.2, `firebase-admin` 13.8 (transactions via `runTransaction`), Vitest 4.1, Stryker 9.6, Playwright Test. The existing `forwardRef(() => require('@learnwren/api-video').VideoService)` seam established by slice A is reused (and widened by one method) — no new Nx project-graph edges.

**Foundation specs:**
- `docs/superpowers/specs/2026-05-20-publish-gate-slice-d-design.md` (this slice — authoritative)
- `docs/superpowers/specs/2026-05-12-course-authoring-design.md` (EP-02 — exception filter, `CourseOwnerGuard`, editor page)
- `docs/superpowers/specs/2026-05-13-video-upload-slice-a-design.md` (slice A — `VideoServiceLike` seam)
- `docs/superpowers/specs/2026-05-13-video-transcoding-slice-b-design.md` (slice B — `VideoStateBadgeComponent`, `VideoStatePollingService`)
- `docs/superpowers/specs/2026-05-14-video-playback-slice-c-design.md` (slice C — `LessonItem` render switch, `VideoPlayerComponent`)

**Repo conventions to follow:**
- Conventional Commits (`feat(api-courses):`, `feat(web-courses):`, `feat(web-video):`, `chore(quality):`, `test(api-e2e):`, `test(web-e2e):`, `docs(specs):`, `docs(readme):`, `fix(...)`)
- Branded ID types from `@learnwren/shared-data-models`; ISO date strings on the wire
- DI tokens from `@learnwren/api-firebase` (`FIRESTORE`, etc.)
- Domain exceptions extend `CoursesException`; flow through `CoursesExceptionFilter`
- `CoursesModule` already imports `forwardRef(() => require('@learnwren/api-video').VideoModule)` — register new providers and exports here
- After every task: targeted `pnpm nx test <project>` must pass; commit a fully-green increment
- Stryker `stryker.api-courses.config.mjs` globs `libs/api-courses/src/lib/**/*.ts` — new `publish/` files are mutated automatically; do not touch the config
- Don't reintroduce vendor brand names; keep the DRAFT banner on this spec & this plan until approved

**Pre-flight check** (run before Task 1):

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
git status                                                   # must be clean
git checkout -b ep-03-slice-d-publish-gate
```

---

## Task 1: Add `publishedAt` and `archivedAt` to the `Course` type

**Files:**
- Modify: `libs/shared-data-models/src/lib/course.ts`
- Modify: `libs/shared-data-models/src/lib/course.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `libs/shared-data-models/src/lib/course.spec.ts`:

```ts
describe('Course — slice D fields', () => {
  it('accepts a course with publishedAt set', () => {
    const c: Course = {
      id: 'c1' as CourseId,
      title: 'T',
      description: 'D',
      instructorId: 'u1' as UserId,
      status: 'PUBLISHED',
      publishedAt: '2026-05-20T10:00:00.000Z' as ISODateString,
      createdAt: '2026-05-20T09:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-20T10:00:00.000Z' as ISODateString,
    };
    expect(c.publishedAt).toBe('2026-05-20T10:00:00.000Z');
  });

  it('accepts a course with archivedAt set', () => {
    const c: Course = {
      id: 'c2' as CourseId,
      title: 'T',
      description: 'D',
      instructorId: 'u1' as UserId,
      status: 'ARCHIVED',
      archivedAt: '2026-05-20T11:00:00.000Z' as ISODateString,
      createdAt: '2026-05-20T09:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-20T11:00:00.000Z' as ISODateString,
    };
    expect(c.archivedAt).toBe('2026-05-20T11:00:00.000Z');
  });

  it('accepts a course with neither field (legacy / pre-slice-D)', () => {
    const c: Course = {
      id: 'c3' as CourseId,
      title: 'T',
      description: 'D',
      instructorId: 'u1' as UserId,
      status: 'DRAFT',
      createdAt: '2026-05-20T09:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-20T09:00:00.000Z' as ISODateString,
    };
    expect(c.publishedAt).toBeUndefined();
    expect(c.archivedAt).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test, expect compile failure**

```bash
pnpm nx test shared-data-models
```

Expected: TypeScript errors like `Object literal may only specify known properties, and 'publishedAt' does not exist in type 'Course'`.

- [ ] **Step 3: Add the two optional fields**

Modify `libs/shared-data-models/src/lib/course.ts` so the `Course` interface becomes:

```ts
export interface Course {
  id: CourseId;
  title: string;
  description: string;
  longDescription?: string;
  category?: CourseCategory;
  difficulty?: CourseDifficulty;
  instructorId: UserId;
  status: CourseStatus;
  publishedAt?: ISODateString;        // slice D — last DRAFT→PUBLISHED transition timestamp; preserved across unpublish + archive
  archivedAt?: ISODateString;         // slice D — set on archive; cleared on restore
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test shared-data-models
```

Expected: all green.

- [ ] **Step 5: Typecheck the workspace**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add libs/shared-data-models/src/lib/course.ts libs/shared-data-models/src/lib/course.spec.ts
git commit -m "feat(shared-data-models): add publishedAt + archivedAt to Course (slice D)"
```

---

## Task 2: Add `PublishBlockReason` + `PublishEligibility` types

**Files:**
- Create: `libs/shared-data-models/src/lib/publish.ts`
- Create: `libs/shared-data-models/src/lib/publish.spec.ts`
- Modify: `libs/shared-data-models/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/shared-data-models/src/lib/publish.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { CourseId, LessonId, ModuleId, VideoId } from './common';
import type { PublishBlockReason, PublishEligibility } from './publish';

describe('PublishBlockReason', () => {
  it('discriminates COURSE_HAS_NO_MODULES', () => {
    const r: PublishBlockReason = { kind: 'COURSE_HAS_NO_MODULES' };
    expect(r.kind).toBe('COURSE_HAS_NO_MODULES');
  });

  it('discriminates MODULE_HAS_NO_LESSONS', () => {
    const r: PublishBlockReason = {
      kind: 'MODULE_HAS_NO_LESSONS',
      moduleId: 'm1' as ModuleId,
      moduleTitle: 'Module One',
      moduleOrder: 0,
    };
    expect(r.kind).toBe('MODULE_HAS_NO_LESSONS');
  });

  it('discriminates LESSON_HAS_NO_VIDEO', () => {
    const r: PublishBlockReason = {
      kind: 'LESSON_HAS_NO_VIDEO',
      moduleId: 'm1' as ModuleId,
      moduleTitle: 'M',
      moduleOrder: 0,
      lessonId: 'l1' as LessonId,
      lessonTitle: 'L',
      lessonOrder: 0,
    };
    expect(r.kind).toBe('LESSON_HAS_NO_VIDEO');
  });

  it('discriminates LESSON_VIDEO_NOT_READY with currentState', () => {
    const r: PublishBlockReason = {
      kind: 'LESSON_VIDEO_NOT_READY',
      moduleId: 'm1' as ModuleId,
      moduleTitle: 'M',
      moduleOrder: 0,
      lessonId: 'l1' as LessonId,
      lessonTitle: 'L',
      lessonOrder: 0,
      currentState: 'TRANSCODING',
    };
    expect(r.currentState).toBe('TRANSCODING');
  });
});

describe('PublishEligibility', () => {
  it('accepts the eligible: true variant with empty reasons', () => {
    const e: PublishEligibility = { eligible: true, reasons: [] };
    expect(e.eligible).toBe(true);
    expect(e.reasons).toEqual([]);
  });

  it('accepts the eligible: false variant with reasons', () => {
    const e: PublishEligibility = {
      eligible: false,
      reasons: [{ kind: 'COURSE_HAS_NO_MODULES' }],
    };
    expect(e.eligible).toBe(false);
    expect(e.reasons).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

```bash
pnpm nx test shared-data-models
```

Expected: `Cannot find module './publish'`.

- [ ] **Step 3: Create the types**

Create `libs/shared-data-models/src/lib/publish.ts`:

```ts
import type { LessonId, ModuleId } from './common';
import type { VideoState } from './video';

export type PublishBlockReason =
  | { kind: 'COURSE_HAS_NO_MODULES' }
  | {
      kind: 'MODULE_HAS_NO_LESSONS';
      moduleId: ModuleId;
      moduleTitle: string;
      moduleOrder: number;
    }
  | {
      kind: 'LESSON_HAS_NO_VIDEO';
      moduleId: ModuleId;
      moduleTitle: string;
      moduleOrder: number;
      lessonId: LessonId;
      lessonTitle: string;
      lessonOrder: number;
    }
  | {
      kind: 'LESSON_VIDEO_NOT_READY';
      moduleId: ModuleId;
      moduleTitle: string;
      moduleOrder: number;
      lessonId: LessonId;
      lessonTitle: string;
      lessonOrder: number;
      currentState: Exclude<VideoState, 'READY'>;
    };

export type PublishEligibility =
  | { eligible: true; reasons: [] }
  | { eligible: false; reasons: PublishBlockReason[] };
```

- [ ] **Step 4: Export from the barrel**

Modify `libs/shared-data-models/src/index.ts` to append:

```ts
export * from './lib/publish';
```

- [ ] **Step 5: Run tests, expect pass**

```bash
pnpm nx test shared-data-models
pnpm typecheck
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add libs/shared-data-models/src/lib/publish.ts libs/shared-data-models/src/lib/publish.spec.ts libs/shared-data-models/src/index.ts
git commit -m "feat(shared-data-models): add PublishBlockReason + PublishEligibility (slice D)"
```

---

## Task 3: Add slice D error codes and exception classes

**Files:**
- Modify: `libs/api-courses/src/lib/errors/courses-error.codes.ts`
- Modify: `libs/api-courses/src/lib/errors/courses.exception.ts`
- Modify: `libs/api-courses/src/lib/errors/courses.exception.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `libs/api-courses/src/lib/errors/courses.exception.spec.ts`:

```ts
import {
  CourseArchivedException,
  InvalidTransitionException,
  PublishNotEligibleException,
} from './courses.exception';
import type { PublishBlockReason } from '@learnwren/shared-data-models';

describe('slice D exceptions', () => {
  it('InvalidTransitionException carries currentState + requested as details and is HTTP 409', () => {
    const e = new InvalidTransitionException('PUBLISHED', 'PUBLISHED');
    expect(e.code).toBe('INVALID_TRANSITION');
    expect(e.status).toBe(409);
    expect(e.details).toEqual({ currentState: 'PUBLISHED', requested: 'PUBLISHED' });
  });

  it('PublishNotEligibleException carries reasons[] as details and is HTTP 409', () => {
    const reasons: PublishBlockReason[] = [{ kind: 'COURSE_HAS_NO_MODULES' }];
    const e = new PublishNotEligibleException(reasons);
    expect(e.code).toBe('PUBLISH_NOT_ELIGIBLE');
    expect(e.status).toBe(409);
    expect(e.details).toEqual({ reasons });
  });

  it('CourseArchivedException is HTTP 409 with code COURSE_ARCHIVED', () => {
    const e = new CourseArchivedException();
    expect(e.code).toBe('COURSE_ARCHIVED');
    expect(e.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm nx test api-courses
```

Expected: import errors for the three new exception classes.

- [ ] **Step 3: Add the new error codes**

Modify `libs/api-courses/src/lib/errors/courses-error.codes.ts`:

```ts
export type CoursesErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_COURSE_OWNER'
  | 'COURSE_NOT_FOUND'
  | 'MODULE_NOT_FOUND'
  | 'LESSON_NOT_FOUND'
  | 'STALE_REORDER'
  | 'INVALID_TRANSITION'
  | 'PUBLISH_NOT_ELIGIBLE'
  | 'COURSE_ARCHIVED'
  | 'INTERNAL';
```

- [ ] **Step 4: Add the exception classes**

Append to `libs/api-courses/src/lib/errors/courses.exception.ts`:

```ts
import type { CourseStatus, PublishBlockReason } from '@learnwren/shared-data-models';

export class InvalidTransitionException extends CoursesException {
  constructor(currentState: CourseStatus, requested: CourseStatus) {
    super(
      'INVALID_TRANSITION',
      `Cannot transition from ${currentState} to ${requested}.`,
      409,
      { currentState, requested },
    );
  }
}

export class PublishNotEligibleException extends CoursesException {
  constructor(reasons: PublishBlockReason[]) {
    super(
      'PUBLISH_NOT_ELIGIBLE',
      'Course does not meet publish requirements.',
      409,
      { reasons },
    );
  }
}

export class CourseArchivedException extends CoursesException {
  constructor() {
    super('COURSE_ARCHIVED', 'Cannot check publish eligibility on an archived course.', 409);
  }
}
```

Note: keep the existing `import type` line for `CoursesErrorCode` at the top of the file untouched; add the new import line below it.

- [ ] **Step 5: Run tests, expect pass**

```bash
pnpm nx test api-courses
pnpm typecheck
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add libs/api-courses/src/lib/errors/
git commit -m "feat(api-courses): add slice D error codes + exception classes"
```

---

## Task 4: Extend `CoursesRepository` with transaction-aware helpers

**Files:**
- Modify: `libs/api-courses/src/lib/courses.repository.ts`

- [ ] **Step 1: Read the existing repository surface**

Open `libs/api-courses/src/lib/courses.repository.ts` and identify the existing methods (`getCourse`, `appendModule`, `listModulesByCourse`, `listLessonsByModule`, `updateCourse`). The new helpers reuse the same Firestore handle and document paths.

- [ ] **Step 2: Add transaction-aware reads + status writer**

Append the following methods to the `CoursesRepository` class (place them at the bottom of the class, after the existing `updateCourse` and lesson helpers):

```ts
  // ────────────────────────── Slice D (publish gate) ──────────────────────────

  /**
   * Read a course inside a transaction. Throws CourseNotFoundException if absent.
   * Used by publish/unpublish/archive/restore for atomic source-state checks.
   */
  async getCourseInTxn(
    t: adminFirestore.Transaction,
    cid: CourseId,
  ): Promise<Course> {
    const ref = this.firestore.collection(COURSES).doc(cid);
    const snap = await t.get(ref);
    if (!snap.exists) {
      throw new CourseNotFoundException();
    }
    return snap.data() as Course;
  }

  /**
   * List a course's modules inside a transaction, ordered by `order` ASC.
   * Used by the publish transaction to keep eligibility atomic with status writes.
   */
  async listModulesByCourseInTxn(
    t: adminFirestore.Transaction,
    cid: CourseId,
  ): Promise<Module[]> {
    const query = this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .orderBy('order', 'asc');
    const snap = await t.get(query);
    return snap.docs.map((d) => d.data() as Module);
  }

  /**
   * List a module's lessons inside a transaction, ordered by `order` ASC.
   */
  async listLessonsByModuleInTxn(
    t: adminFirestore.Transaction,
    cid: CourseId,
    mid: ModuleId,
  ): Promise<Lesson[]> {
    const query = this.firestore
      .collection(COURSES)
      .doc(cid)
      .collection('modules')
      .doc(mid)
      .collection('lessons')
      .orderBy('order', 'asc');
    const snap = await t.get(query);
    return snap.docs.map((d) => d.data() as Lesson);
  }

  /**
   * Write a status transition inside a transaction. Sets updatedAt; merges any
   * additional patch (publishedAt, archivedAt). Pass `archivedAt: null` to clear.
   * The repository does NOT enforce state-machine rules; the caller does.
   */
  async updateStatusInTxn(
    t: adminFirestore.Transaction,
    cid: CourseId,
    status: CourseStatus,
    patch: { publishedAt?: ISODateString; archivedAt?: ISODateString | null } = {},
  ): Promise<Course> {
    const ref = this.firestore.collection(COURSES).doc(cid);
    const now = nowIso();
    const update: Record<string, unknown> = { status, updatedAt: now };
    if (patch.publishedAt !== undefined) update.publishedAt = patch.publishedAt;
    if (patch.archivedAt === null) {
      update.archivedAt = adminFirestore.FieldValue.delete();
    } else if (patch.archivedAt !== undefined) {
      update.archivedAt = patch.archivedAt;
    }
    t.update(ref, update);
    // Compose the post-write doc for the controller's response (caller is inside
    // the txn, so a tx.get afterwards would race with the pending write).
    const before = await this.getCourseInTxn(t, cid);
    return {
      ...before,
      status,
      updatedAt: now,
      ...(patch.publishedAt !== undefined ? { publishedAt: patch.publishedAt } : {}),
      ...(patch.archivedAt === null
        ? {}
        : patch.archivedAt !== undefined
          ? { archivedAt: patch.archivedAt }
          : {}),
    } as Course;
  }
```

Add `CourseStatus` to the imports at the top of the file:

```ts
import type {
  Course,
  CourseId,
  CourseStatus,
  ISODateString,
  Lesson,
  LessonId,
  Module,
  ModuleId,
  UserId,
} from '@learnwren/shared-data-models';
```

Add the import for the exception class near the existing imports:

```ts
import { CourseNotFoundException } from './errors/courses.exception';
```

And the admin-firestore `FieldValue` namespace import — confirm `firestore as adminFirestore` is already imported at the top (it is). The `FieldValue.delete()` call uses that namespace.

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 4: Run existing repository-level tests**

```bash
pnpm nx test api-courses
```

Expected: all existing tests still green. The new methods are unverified — they're exercised by `PublishService` unit tests (later tasks) and api-e2e.

The `CoursesRepository` is in the Stryker `mutate` exclusion list (it's a thin adapter), so no new spec is needed; api-e2e validates the new methods end-to-end.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/courses.repository.ts
git commit -m "feat(api-courses): add txn-aware repo helpers for publish gate (slice D)"
```

---

## Task 5: Add the pure `composeReasons` function (TDD-driven)

**Files:**
- Create: `libs/api-courses/src/lib/publish/publish-eligibility.ts`
- Create: `libs/api-courses/src/lib/publish/publish-eligibility.spec.ts`

- [ ] **Step 1: Write the failing tests (every ordering branch)**

Create `libs/api-courses/src/lib/publish/publish-eligibility.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type {
  CourseId,
  ISODateString,
  Lesson,
  LessonId,
  Module,
  ModuleId,
  UserId,
  VideoId,
  VideoState,
} from '@learnwren/shared-data-models';

import { composeReasons } from './publish-eligibility';

const COURSE = 'c1' as CourseId;
const NOW = '2026-05-20T10:00:00.000Z' as ISODateString;

function makeModule(id: string, title: string, order: number): Module {
  return {
    id: id as ModuleId,
    courseId: COURSE,
    title,
    order,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeLesson(
  id: string,
  title: string,
  order: number,
  moduleId: string,
  videoId?: string,
): Lesson {
  return {
    id: id as LessonId,
    moduleId: moduleId as ModuleId,
    title,
    order,
    ...(videoId ? { videoId: videoId as VideoId } : {}),
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('composeReasons', () => {
  it('returns COURSE_HAS_NO_MODULES (alone) for an empty course', () => {
    const r = composeReasons([], [], new Map());
    expect(r).toEqual({
      eligible: false,
      reasons: [{ kind: 'COURSE_HAS_NO_MODULES' }],
    });
  });

  it('returns MODULE_HAS_NO_LESSONS for a module with zero lessons', () => {
    const m = makeModule('m1', 'M1', 0);
    const r = composeReasons([m], [[]], new Map());
    expect(r).toEqual({
      eligible: false,
      reasons: [{ kind: 'MODULE_HAS_NO_LESSONS', moduleId: 'm1', moduleTitle: 'M1', moduleOrder: 0 }],
    });
  });

  it('returns LESSON_HAS_NO_VIDEO when lesson.videoId is undefined', () => {
    const m = makeModule('m1', 'M1', 0);
    const l = makeLesson('l1', 'L1', 0, 'm1');
    const r = composeReasons([m], [[l]], new Map());
    expect(r.eligible).toBe(false);
    expect(r.reasons).toEqual([
      {
        kind: 'LESSON_HAS_NO_VIDEO',
        moduleId: 'm1', moduleTitle: 'M1', moduleOrder: 0,
        lessonId: 'l1', lessonTitle: 'L1', lessonOrder: 0,
      },
    ]);
  });

  it('returns LESSON_HAS_NO_VIDEO when videoId is set but video doc is missing (orphan fold)', () => {
    const m = makeModule('m1', 'M1', 0);
    const l = makeLesson('l1', 'L1', 0, 'm1', 'v-orphan');
    const r = composeReasons([m], [[l]], new Map()); // empty map → orphan
    expect(r.eligible).toBe(false);
    expect(r.reasons[0].kind).toBe('LESSON_HAS_NO_VIDEO');
  });

  it.each<[VideoState]>([
    ['PENDING_UPLOAD'],
    ['UPLOADING'],
    ['UPLOADED'],
    ['TRANSCODING'],
    ['FAILED'],
  ])('returns LESSON_VIDEO_NOT_READY for state %s', (state) => {
    const m = makeModule('m1', 'M1', 0);
    const l = makeLesson('l1', 'L1', 0, 'm1', 'v1');
    const r = composeReasons([m], [[l]], new Map([['v1' as VideoId, state]]));
    expect(r.eligible).toBe(false);
    expect(r.reasons).toEqual([
      {
        kind: 'LESSON_VIDEO_NOT_READY',
        moduleId: 'm1', moduleTitle: 'M1', moduleOrder: 0,
        lessonId: 'l1', lessonTitle: 'L1', lessonOrder: 0,
        currentState: state,
      },
    ]);
  });

  it('returns eligible:true with no reasons when every lesson has a READY video', () => {
    const m = makeModule('m1', 'M1', 0);
    const l = makeLesson('l1', 'L1', 0, 'm1', 'v1');
    const r = composeReasons([m], [[l]], new Map([['v1' as VideoId, 'READY']]));
    expect(r).toEqual({ eligible: true, reasons: [] });
  });

  it('orders reasons by moduleOrder ASC, then lessonOrder ASC', () => {
    const mA = makeModule('mA', 'Alpha', 0);
    const mB = makeModule('mB', 'Beta',  1);
    const mC = makeModule('mC', 'Gamma', 2);
    const lA1 = makeLesson('lA1', 'A1', 0, 'mA');                // no video
    const lA2 = makeLesson('lA2', 'A2', 1, 'mA', 'vA2');         // TRANSCODING
    const lC1 = makeLesson('lC1', 'C1', 0, 'mC', 'vC1');         // READY (no reason)
    const videoStates = new Map<VideoId, VideoState>([
      ['vA2' as VideoId, 'TRANSCODING'],
      ['vC1' as VideoId, 'READY'],
    ]);
    const r = composeReasons([mA, mB, mC], [[lA1, lA2], [], [lC1]], videoStates);
    expect(r.eligible).toBe(false);
    expect(r.reasons.map((x) => x.kind)).toEqual([
      'LESSON_HAS_NO_VIDEO',         // mA / lA1 — first by module + first by lesson order
      'LESSON_VIDEO_NOT_READY',      // mA / lA2 — second by lesson order
      'MODULE_HAS_NO_LESSONS',       // mB
                                      // mC has only READY lessons → no reason
    ]);
  });

  it('emits at most one reason per lesson — orphan takes precedence over not-ready', () => {
    const m = makeModule('m1', 'M1', 0);
    const l = makeLesson('l1', 'L1', 0, 'm1', 'v-orphan');
    // Even if some other map entry could conflict, only one reason fires per lesson:
    const r = composeReasons([m], [[l]], new Map());
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0].kind).toBe('LESSON_HAS_NO_VIDEO');
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm nx test api-courses
```

Expected: `Cannot find module './publish-eligibility'`.

- [ ] **Step 3: Implement the pure function**

Create `libs/api-courses/src/lib/publish/publish-eligibility.ts`:

```ts
import type {
  Lesson,
  Module,
  PublishBlockReason,
  PublishEligibility,
  VideoId,
  VideoState,
} from '@learnwren/shared-data-models';

export function composeReasons(
  modules: Module[],
  lessonsByModule: Lesson[][],
  videoStateById: Map<VideoId, VideoState>,
): PublishEligibility {
  if (modules.length === 0) {
    return {
      eligible: false,
      reasons: [{ kind: 'COURSE_HAS_NO_MODULES' }],
    };
  }

  const reasons: PublishBlockReason[] = [];

  for (let i = 0; i < modules.length; i++) {
    const m = modules[i];
    const lessons = lessonsByModule[i] ?? [];
    const moduleCtx = { moduleId: m.id, moduleTitle: m.title, moduleOrder: m.order };

    if (lessons.length === 0) {
      reasons.push({ kind: 'MODULE_HAS_NO_LESSONS', ...moduleCtx });
      continue;
    }

    for (const l of lessons) {
      const lessonCtx = {
        ...moduleCtx,
        lessonId: l.id,
        lessonTitle: l.title,
        lessonOrder: l.order,
      };
      if (!l.videoId) {
        reasons.push({ kind: 'LESSON_HAS_NO_VIDEO', ...lessonCtx });
        continue;
      }
      const state = videoStateById.get(l.videoId);
      if (state === undefined) {
        // Orphan: lesson.videoId set but Video doc missing → fold into LESSON_HAS_NO_VIDEO
        reasons.push({ kind: 'LESSON_HAS_NO_VIDEO', ...lessonCtx });
        continue;
      }
      if (state !== 'READY') {
        reasons.push({
          kind: 'LESSON_VIDEO_NOT_READY',
          ...lessonCtx,
          currentState: state as Exclude<VideoState, 'READY'>,
        });
      }
    }
  }

  if (reasons.length === 0) {
    return { eligible: true, reasons: [] };
  }
  return { eligible: false, reasons };
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test api-courses
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/publish/publish-eligibility.ts libs/api-courses/src/lib/publish/publish-eligibility.spec.ts
git commit -m "feat(api-courses): pure composeReasons for publish eligibility (slice D)"
```

---

## Task 6: Widen `VideoServiceLike` with `getVideo`

**Files:**
- Modify: `libs/api-courses/src/lib/courses.service.ts` (interface only — no behaviour change)

- [ ] **Step 1: Extend the interface**

Open `libs/api-courses/src/lib/courses.service.ts` and replace the existing `interface VideoServiceLike` block with:

```ts
// Minimal structural interface for the VideoService dependency.
// Using a local interface instead of importing the concrete class avoids the
// TypeScript composite project reference cycle (api-courses ↔ api-video).
// The DI token is provided via forwardRef(() => require(API_VIDEO_PKG).VideoService).
interface VideoServiceLike {
  deleteForLesson(lessonId: string): Promise<void>;
  // Slice D: read a Video by id; throws VideoNotFoundException when absent.
  // Used by PublishService to fold orphan lesson.videoId references into
  // LESSON_HAS_NO_VIDEO reasons.
  getVideo(vid: import('@learnwren/shared-data-models').VideoId): Promise<
    import('@learnwren/shared-data-models').Video
  >;
}
```

The inline `import('...')` types avoid pulling new top-level imports into this file (which would risk widening the project graph).

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: zero errors. `VideoService.getVideo` already exists in `libs/api-video/src/lib/video.service.ts` (slice A), so the runtime contract is satisfied.

- [ ] **Step 3: Re-run repository-level tests (should be untouched)**

```bash
pnpm nx test api-courses
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add libs/api-courses/src/lib/courses.service.ts
git commit -m "feat(api-courses): widen VideoServiceLike with getVideo (slice D)"
```

---

## Task 7: `PublishService.computeEligibility` (preview IO seam)

**Files:**
- Create: `libs/api-courses/src/lib/publish/publish.service.ts`
- Create: `libs/api-courses/src/lib/publish/publish.service.spec.ts`

- [ ] **Step 1: Write the failing tests for computeEligibility**

Create `libs/api-courses/src/lib/publish/publish.service.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Course,
  CourseId,
  ISODateString,
  Lesson,
  LessonId,
  Module,
  ModuleId,
  UserId,
  Video,
  VideoId,
} from '@learnwren/shared-data-models';

import { PublishService } from './publish.service';

const COURSE = 'c1' as CourseId;
const INSTR = 'u1' as UserId;
const NOW = '2026-05-20T10:00:00.000Z' as ISODateString;

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: COURSE,
    title: 'T',
    description: 'D',
    instructorId: INSTR,
    status: 'DRAFT',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeModule(id: string, order: number): Module {
  return {
    id: id as ModuleId,
    courseId: COURSE,
    title: id.toUpperCase(),
    order,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeLesson(id: string, mid: string, order: number, vid?: string): Lesson {
  return {
    id: id as LessonId,
    moduleId: mid as ModuleId,
    title: id.toUpperCase(),
    order,
    ...(vid ? { videoId: vid as VideoId } : {}),
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeVideo(id: string, state: Video['state']): Video {
  return {
    id: id as VideoId,
    ownerInstructorId: INSTR,
    courseId: COURSE,
    lessonId: 'l-irrelevant' as LessonId,
    state,
    source: { bucket: 'src', path: 'p' },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

interface RepoFake {
  getCourse: ReturnType<typeof vi.fn>;
  listModulesByCourse: ReturnType<typeof vi.fn>;
  listLessonsByModule: ReturnType<typeof vi.fn>;
  // (transaction helpers are not exercised by computeEligibility — see publish tests)
}

interface VideoSvcFake {
  getVideo: ReturnType<typeof vi.fn>;
  deleteForLesson: ReturnType<typeof vi.fn>;
}

let repo: RepoFake;
let videoSvc: VideoSvcFake;
let service: PublishService;

beforeEach(() => {
  repo = {
    getCourse: vi.fn(),
    listModulesByCourse: vi.fn(),
    listLessonsByModule: vi.fn(),
  };
  videoSvc = {
    getVideo: vi.fn(),
    deleteForLesson: vi.fn(),
  };
  // The Firestore handle is not used by computeEligibility; pass undefined-cast.
  service = new PublishService(repo as never, videoSvc as never, undefined as never);
});

describe('PublishService.computeEligibility', () => {
  it('returns COURSE_HAS_NO_MODULES for a course with no modules', async () => {
    repo.getCourse.mockResolvedValue(makeCourse());
    repo.listModulesByCourse.mockResolvedValue([]);
    const r = await service.computeEligibility(COURSE);
    expect(r).toEqual({ eligible: false, reasons: [{ kind: 'COURSE_HAS_NO_MODULES' }] });
    expect(videoSvc.getVideo).not.toHaveBeenCalled();
  });

  it('returns eligible:true when every lesson has a READY video', async () => {
    repo.getCourse.mockResolvedValue(makeCourse());
    repo.listModulesByCourse.mockResolvedValue([makeModule('m1', 0)]);
    repo.listLessonsByModule.mockResolvedValue([makeLesson('l1', 'm1', 0, 'v1')]);
    videoSvc.getVideo.mockResolvedValue(makeVideo('v1', 'READY'));
    const r = await service.computeEligibility(COURSE);
    expect(r).toEqual({ eligible: true, reasons: [] });
  });

  it('folds VideoNotFoundException into LESSON_HAS_NO_VIDEO (orphan)', async () => {
    repo.getCourse.mockResolvedValue(makeCourse());
    repo.listModulesByCourse.mockResolvedValue([makeModule('m1', 0)]);
    repo.listLessonsByModule.mockResolvedValue([makeLesson('l1', 'm1', 0, 'v-orphan')]);
    // Simulate VideoService throwing — PublishService catches and folds:
    const err = new Error('Video not found.');
    err.name = 'VideoNotFoundException';
    videoSvc.getVideo.mockRejectedValue(err);
    const r = await service.computeEligibility(COURSE);
    expect(r.eligible).toBe(false);
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0]).toMatchObject({ kind: 'LESSON_HAS_NO_VIDEO', lessonId: 'l1' });
  });

  it('deduplicates videoId reads across lessons', async () => {
    repo.getCourse.mockResolvedValue(makeCourse());
    repo.listModulesByCourse.mockResolvedValue([makeModule('m1', 0)]);
    // Same videoId reused on two lessons (unusual but possible if a future feature allows it):
    repo.listLessonsByModule.mockResolvedValue([
      makeLesson('l1', 'm1', 0, 'v-shared'),
      makeLesson('l2', 'm1', 1, 'v-shared'),
    ]);
    videoSvc.getVideo.mockResolvedValue(makeVideo('v-shared', 'READY'));
    await service.computeEligibility(COURSE);
    expect(videoSvc.getVideo).toHaveBeenCalledTimes(1);
  });

  it('throws CourseArchivedException when status === ARCHIVED', async () => {
    repo.getCourse.mockResolvedValue(makeCourse({ status: 'ARCHIVED' }));
    await expect(service.computeEligibility(COURSE)).rejects.toMatchObject({
      code: 'COURSE_ARCHIVED',
      status: 409,
    });
  });

  it('throws CourseNotFoundException when the course is absent', async () => {
    repo.getCourse.mockResolvedValue(null);
    await expect(service.computeEligibility(COURSE)).rejects.toMatchObject({
      code: 'COURSE_NOT_FOUND',
      status: 404,
    });
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm nx test api-courses
```

Expected: `Cannot find module './publish.service'`.

- [ ] **Step 3: Implement `PublishService.computeEligibility`**

Create `libs/api-courses/src/lib/publish/publish.service.ts`:

```ts
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import type { firestore as adminFirestore } from 'firebase-admin';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type {
  Course,
  CourseId,
  ISODateString,
  PublishEligibility,
  Video,
  VideoId,
  VideoState,
} from '@learnwren/shared-data-models';

import { CoursesRepository } from '../courses.repository';
import {
  CourseArchivedException,
  CourseNotFoundException,
  InvalidTransitionException,
  PublishNotEligibleException,
} from '../errors/courses.exception';
import { composeReasons } from './publish-eligibility';

// Same disguised require pattern as courses.service.ts to keep the api-courses
// → api-video edge out of the Nx project graph.
interface VideoServiceLike {
  getVideo(vid: VideoId): Promise<Video>;
}

const API_VIDEO_PKG = ['@learnwren', 'api-video'].join('/');

function nowIso(): ISODateString {
  return new Date().toISOString() as ISODateString;
}

function isVideoNotFound(e: unknown): boolean {
  // Avoid a static import of VideoNotFoundException to keep the project graph
  // unchanged. Match by error name (Nest exception classes set this).
  return e instanceof Error && (e.name === 'VideoNotFoundException' || /not found/i.test(e.message));
}

@Injectable()
export class PublishService {
  constructor(
    private readonly repo: CoursesRepository,
    @Inject(forwardRef(() => require(API_VIDEO_PKG).VideoService))
    private readonly videoSvc: VideoServiceLike,
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
  ) {}

  async computeEligibility(cid: CourseId): Promise<PublishEligibility> {
    const course = await this.repo.getCourse(cid);
    if (!course) throw new CourseNotFoundException();
    if (course.status === 'ARCHIVED') throw new CourseArchivedException();

    const modules = await this.repo.listModulesByCourse(cid);
    const lessonsByModule = await Promise.all(
      modules.map((m) => this.repo.listLessonsByModule(cid, m.id)),
    );
    const allLessons = lessonsByModule.flat();
    const uniqueVideoIds = [
      ...new Set(allLessons.map((l) => l.videoId).filter((v): v is VideoId => Boolean(v))),
    ];
    const videos = await Promise.all(
      uniqueVideoIds.map((vid) =>
        this.videoSvc.getVideo(vid).catch((e) => {
          if (isVideoNotFound(e)) return null;
          throw e;
        }),
      ),
    );
    const videoStateById = new Map<VideoId, VideoState>(
      videos.filter((v): v is Video => v !== null).map((v) => [v.id, v.state]),
    );

    return composeReasons(modules, lessonsByModule, videoStateById);
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test api-courses
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/publish/publish.service.ts libs/api-courses/src/lib/publish/publish.service.spec.ts
git commit -m "feat(api-courses): PublishService.computeEligibility (slice D)"
```

---

## Task 8: `PublishService.publish` — atomic transition + revalidation

**Files:**
- Modify: `libs/api-courses/src/lib/publish/publish.service.ts`
- Modify: `libs/api-courses/src/lib/publish/publish.service.spec.ts`

- [ ] **Step 1: Add publish tests**

Append to `publish.service.spec.ts`:

```ts
function makeFirestoreFake(opts: {
  course: Course;
  modules: Module[];
  lessonsByModule: Lesson[][];
  // Each call to runTransaction will commit any updates and return the inner result.
  // Tracked writes are captured so tests can assert against them.
}) {
  const writes: Array<{ path: string; update: Record<string, unknown> }> = [];
  const tx = {
    get: vi.fn(async (refOrQuery: unknown): Promise<unknown> => {
      if ((refOrQuery as { path?: string }).path?.startsWith('courses/') &&
          !(refOrQuery as { path?: string }).path?.includes('/modules')) {
        return { exists: true, data: () => opts.course };
      }
      // module query
      if ((refOrQuery as { _queryOptions?: { collectionId?: string } })._queryOptions?.collectionId === 'modules') {
        return { docs: opts.modules.map((m) => ({ data: () => m })) };
      }
      // lesson query
      const mid = (refOrQuery as { _queryOptions?: { parentPath?: string } })._queryOptions?.parentPath?.split('/').pop();
      const idx = opts.modules.findIndex((m) => m.id === mid);
      return { docs: (opts.lessonsByModule[idx] ?? []).map((l) => ({ data: () => l })) };
    }),
    update: vi.fn((ref: { path: string }, update: Record<string, unknown>) => {
      writes.push({ path: ref.path, update });
    }),
  };
  return {
    runTransaction: vi.fn(async <T>(cb: (t: typeof tx) => Promise<T>): Promise<T> => cb(tx)),
    writes,
    tx,
  } as const;
}

describe('PublishService.publish', () => {
  it('publishes a DRAFT course when eligible, setting publishedAt', async () => {
    repo.getCourse.mockResolvedValue(makeCourse({ status: 'DRAFT' }));
    // Repo's transactional helpers — wire them directly:
    (repo as never as Record<string, unknown>).getCourseInTxn = vi.fn().mockResolvedValue(makeCourse({ status: 'DRAFT' }));
    (repo as never as Record<string, unknown>).listModulesByCourseInTxn = vi.fn().mockResolvedValue([makeModule('m1', 0)]);
    (repo as never as Record<string, unknown>).listLessonsByModuleInTxn = vi.fn().mockResolvedValue([makeLesson('l1', 'm1', 0, 'v1')]);
    (repo as never as Record<string, unknown>).updateStatusInTxn = vi.fn().mockImplementation(
      async (_t, _cid, status, patch) => makeCourse({ status, ...patch }),
    );
    videoSvc.getVideo.mockResolvedValue(makeVideo('v1', 'READY'));
    // Firestore handle is the third constructor arg — supply a runTransaction stub:
    const fakeFs = { runTransaction: vi.fn(async (cb: (t: unknown) => unknown) => cb({})) };
    service = new PublishService(repo as never, videoSvc as never, fakeFs as never);

    const updated = await service.publish(COURSE);
    expect(updated.status).toBe('PUBLISHED');
    expect(updated.publishedAt).toBeDefined();
    expect((repo as never as Record<string, ReturnType<typeof vi.fn>>).updateStatusInTxn).toHaveBeenCalledWith(
      expect.anything(),
      COURSE,
      'PUBLISHED',
      expect.objectContaining({ publishedAt: expect.any(String) }),
    );
  });

  it('throws InvalidTransitionException when source state is not DRAFT', async () => {
    (repo as never as Record<string, unknown>).getCourseInTxn = vi.fn().mockResolvedValue(makeCourse({ status: 'PUBLISHED' }));
    const fakeFs = { runTransaction: vi.fn(async (cb: (t: unknown) => unknown) => cb({})) };
    service = new PublishService(repo as never, videoSvc as never, fakeFs as never);
    await expect(service.publish(COURSE)).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
      details: { currentState: 'PUBLISHED', requested: 'PUBLISHED' },
    });
  });

  it('throws PublishNotEligibleException with reasons when revalidation fails', async () => {
    (repo as never as Record<string, unknown>).getCourseInTxn = vi.fn().mockResolvedValue(makeCourse({ status: 'DRAFT' }));
    (repo as never as Record<string, unknown>).listModulesByCourseInTxn = vi.fn().mockResolvedValue([]);
    const fakeFs = { runTransaction: vi.fn(async (cb: (t: unknown) => unknown) => cb({})) };
    service = new PublishService(repo as never, videoSvc as never, fakeFs as never);
    await expect(service.publish(COURSE)).rejects.toMatchObject({
      code: 'PUBLISH_NOT_ELIGIBLE',
      details: { reasons: [{ kind: 'COURSE_HAS_NO_MODULES' }] },
    });
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm nx test api-courses
```

Expected: `service.publish is not a function`.

- [ ] **Step 3: Implement publish**

Append to `PublishService` in `publish.service.ts`:

```ts
  async publish(cid: CourseId): Promise<Course> {
    return this.firestore.runTransaction(async (t) => {
      const course = await this.repo.getCourseInTxn(t, cid);
      if (course.status !== 'DRAFT') {
        throw new InvalidTransitionException(course.status, 'PUBLISHED');
      }
      const eligibility = await this.computeEligibilityInTxn(t, cid);
      if (!eligibility.eligible) {
        throw new PublishNotEligibleException(eligibility.reasons);
      }
      return this.repo.updateStatusInTxn(t, cid, 'PUBLISHED', {
        publishedAt: nowIso(),
      });
    });
  }

  /**
   * Same shape as computeEligibility but threads `tx` through module + lesson
   * reads. Video reads remain non-transactional — see slice D design spec §5.4
   * for the rationale (the runtime forwardRef seam can't carry a Firestore tx).
   */
  private async computeEligibilityInTxn(
    t: adminFirestore.Transaction,
    cid: CourseId,
  ): Promise<PublishEligibility> {
    const modules = await this.repo.listModulesByCourseInTxn(t, cid);
    const lessonsByModule = await Promise.all(
      modules.map((m) => this.repo.listLessonsByModuleInTxn(t, cid, m.id)),
    );
    const allLessons = lessonsByModule.flat();
    const uniqueVideoIds = [
      ...new Set(allLessons.map((l) => l.videoId).filter((v): v is VideoId => Boolean(v))),
    ];
    const videos = await Promise.all(
      uniqueVideoIds.map((vid) =>
        this.videoSvc.getVideo(vid).catch((e) => {
          if (isVideoNotFound(e)) return null;
          throw e;
        }),
      ),
    );
    const videoStateById = new Map<VideoId, VideoState>(
      videos.filter((v): v is Video => v !== null).map((v) => [v.id, v.state]),
    );
    return composeReasons(modules, lessonsByModule, videoStateById);
  }
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test api-courses
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/publish/publish.service.ts libs/api-courses/src/lib/publish/publish.service.spec.ts
git commit -m "feat(api-courses): PublishService.publish atomic transition (slice D)"
```

---

## Task 9: `PublishService.unpublish` / `archive` / `restore`

**Files:**
- Modify: `libs/api-courses/src/lib/publish/publish.service.ts`
- Modify: `libs/api-courses/src/lib/publish/publish.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `publish.service.spec.ts`:

```ts
describe('PublishService.unpublish', () => {
  it('transitions PUBLISHED → DRAFT, preserves publishedAt', async () => {
    const published = makeCourse({ status: 'PUBLISHED', publishedAt: '2026-05-19T00:00:00.000Z' as ISODateString });
    (repo as never as Record<string, unknown>).getCourseInTxn = vi.fn().mockResolvedValue(published);
    (repo as never as Record<string, unknown>).updateStatusInTxn = vi.fn().mockImplementation(
      async (_t, _cid, status) => ({ ...published, status }),
    );
    const fakeFs = { runTransaction: vi.fn(async (cb: (t: unknown) => unknown) => cb({})) };
    service = new PublishService(repo as never, videoSvc as never, fakeFs as never);

    const updated = await service.unpublish(COURSE);
    expect(updated.status).toBe('DRAFT');
    // updateStatusInTxn called WITHOUT publishedAt patch — it's preserved on the doc:
    expect((repo as never as Record<string, ReturnType<typeof vi.fn>>).updateStatusInTxn)
      .toHaveBeenCalledWith(expect.anything(), COURSE, 'DRAFT', {});
  });

  it('throws InvalidTransitionException when source is not PUBLISHED', async () => {
    (repo as never as Record<string, unknown>).getCourseInTxn = vi.fn().mockResolvedValue(makeCourse({ status: 'DRAFT' }));
    const fakeFs = { runTransaction: vi.fn(async (cb: (t: unknown) => unknown) => cb({})) };
    service = new PublishService(repo as never, videoSvc as never, fakeFs as never);
    await expect(service.unpublish(COURSE)).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
      details: { currentState: 'DRAFT', requested: 'DRAFT' },
    });
  });
});

describe('PublishService.archive', () => {
  it.each<['DRAFT' | 'PUBLISHED']>([['DRAFT'], ['PUBLISHED']])('archives a %s course, sets archivedAt', async (from) => {
    (repo as never as Record<string, unknown>).getCourseInTxn = vi.fn().mockResolvedValue(makeCourse({ status: from }));
    (repo as never as Record<string, unknown>).updateStatusInTxn = vi.fn().mockImplementation(
      async (_t, _cid, status, patch) => ({ ...makeCourse({ status }), ...patch }),
    );
    const fakeFs = { runTransaction: vi.fn(async (cb: (t: unknown) => unknown) => cb({})) };
    service = new PublishService(repo as never, videoSvc as never, fakeFs as never);

    const updated = await service.archive(COURSE);
    expect(updated.status).toBe('ARCHIVED');
    expect(updated.archivedAt).toBeDefined();
    expect((repo as never as Record<string, ReturnType<typeof vi.fn>>).updateStatusInTxn)
      .toHaveBeenCalledWith(expect.anything(), COURSE, 'ARCHIVED', expect.objectContaining({ archivedAt: expect.any(String) }));
  });

  it('throws InvalidTransitionException when already ARCHIVED', async () => {
    (repo as never as Record<string, unknown>).getCourseInTxn = vi.fn().mockResolvedValue(makeCourse({ status: 'ARCHIVED' }));
    const fakeFs = { runTransaction: vi.fn(async (cb: (t: unknown) => unknown) => cb({})) };
    service = new PublishService(repo as never, videoSvc as never, fakeFs as never);
    await expect(service.archive(COURSE)).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
      details: { currentState: 'ARCHIVED', requested: 'ARCHIVED' },
    });
  });
});

describe('PublishService.restore', () => {
  it('transitions ARCHIVED → DRAFT, clears archivedAt', async () => {
    (repo as never as Record<string, unknown>).getCourseInTxn = vi.fn().mockResolvedValue(
      makeCourse({ status: 'ARCHIVED', archivedAt: '2026-05-18T00:00:00.000Z' as ISODateString }),
    );
    (repo as never as Record<string, unknown>).updateStatusInTxn = vi.fn().mockImplementation(
      async (_t, _cid, status) => makeCourse({ status }),
    );
    const fakeFs = { runTransaction: vi.fn(async (cb: (t: unknown) => unknown) => cb({})) };
    service = new PublishService(repo as never, videoSvc as never, fakeFs as never);

    const updated = await service.restore(COURSE);
    expect(updated.status).toBe('DRAFT');
    expect((repo as never as Record<string, ReturnType<typeof vi.fn>>).updateStatusInTxn)
      .toHaveBeenCalledWith(expect.anything(), COURSE, 'DRAFT', { archivedAt: null });
  });

  it('throws InvalidTransitionException when source is not ARCHIVED', async () => {
    (repo as never as Record<string, unknown>).getCourseInTxn = vi.fn().mockResolvedValue(makeCourse({ status: 'DRAFT' }));
    const fakeFs = { runTransaction: vi.fn(async (cb: (t: unknown) => unknown) => cb({})) };
    service = new PublishService(repo as never, videoSvc as never, fakeFs as never);
    await expect(service.restore(COURSE)).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
      details: { currentState: 'DRAFT', requested: 'DRAFT' },
    });
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm nx test api-courses
```

Expected: `service.unpublish is not a function` (or similar).

- [ ] **Step 3: Implement the three methods**

Append to `PublishService` (after `publish`, before `computeEligibilityInTxn`):

```ts
  async unpublish(cid: CourseId): Promise<Course> {
    return this.firestore.runTransaction(async (t) => {
      const course = await this.repo.getCourseInTxn(t, cid);
      if (course.status !== 'PUBLISHED') {
        throw new InvalidTransitionException(course.status, 'DRAFT');
      }
      return this.repo.updateStatusInTxn(t, cid, 'DRAFT', {});
    });
  }

  async archive(cid: CourseId): Promise<Course> {
    return this.firestore.runTransaction(async (t) => {
      const course = await this.repo.getCourseInTxn(t, cid);
      if (course.status !== 'DRAFT' && course.status !== 'PUBLISHED') {
        throw new InvalidTransitionException(course.status, 'ARCHIVED');
      }
      return this.repo.updateStatusInTxn(t, cid, 'ARCHIVED', {
        archivedAt: nowIso(),
      });
    });
  }

  async restore(cid: CourseId): Promise<Course> {
    return this.firestore.runTransaction(async (t) => {
      const course = await this.repo.getCourseInTxn(t, cid);
      if (course.status !== 'ARCHIVED') {
        throw new InvalidTransitionException(course.status, 'DRAFT');
      }
      return this.repo.updateStatusInTxn(t, cid, 'DRAFT', { archivedAt: null });
    });
  }
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test api-courses
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/publish/publish.service.ts libs/api-courses/src/lib/publish/publish.service.spec.ts
git commit -m "feat(api-courses): PublishService unpublish/archive/restore (slice D)"
```

---

## Task 10: Register `PublishService` in `CoursesModule`

**Files:**
- Modify: `libs/api-courses/src/lib/courses.module.ts`

- [ ] **Step 1: Add the provider**

Modify `libs/api-courses/src/lib/courses.module.ts` to import `PublishService` and add it to the `providers` array:

```ts
import { PublishService } from './publish/publish.service';

@Module({
  imports: [AuthModule, forwardRef(() => require(API_VIDEO_PKG).VideoModule)],
  controllers: [CoursesController],
  providers: [
    CoursesService,
    CoursesRepository,
    CoursesExceptionFilter,
    CourseOwnerGuard,
    PublishService,                    // NEW (slice D)
  ],
  exports: [CoursesRepository, CourseOwnerGuard],
})
export class CoursesModule {}
```

- [ ] **Step 2: Typecheck and run tests**

```bash
pnpm typecheck
pnpm nx test api-courses
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add libs/api-courses/src/lib/courses.module.ts
git commit -m "feat(api-courses): wire PublishService in CoursesModule (slice D)"
```

---

## Task 11: Add controller routes (preview + 4 transitions)

**Files:**
- Modify: `libs/api-courses/src/lib/courses.controller.ts`
- Modify: `libs/api-courses/src/lib/courses.controller.spec.ts`

- [ ] **Step 1: Extend the existing TestingModule with a `PublishService` mock**

`libs/api-courses/src/lib/courses.controller.spec.ts` already uses `Test.createTestingModule({ providers: [...] })`. Adding `PublishService` as a required constructor arg in Task 11 step 3 will break the existing test if no provider is supplied. Edit the `providers` array near line 57 to add a stub immediately after the `CoursesService` provider:

```ts
{
  provide: CoursesService, useValue: service,
},
{
  provide: PublishService,
  useValue: {
    computeEligibility: vi.fn(),
    publish: vi.fn(),
    unpublish: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
  },
},
```

Add the import at the top of the file alongside the existing imports:

```ts
import { PublishService } from './publish/publish.service';
```

- [ ] **Step 2: Append the new slice-D route tests**

In the same file, after the existing `describe` block(s), append:

```ts
describe('CoursesController — slice D routes', () => {
  let controller: CoursesController;
  let publishSvc: {
    computeEligibility: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
    unpublish: ReturnType<typeof vi.fn>;
    archive: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    publishSvc = {
      computeEligibility: vi.fn(),
      publish: vi.fn(),
      unpublish: vi.fn(),
      archive: vi.fn(),
      restore: vi.fn(),
    };
    controller = new CoursesController({} as never, publishSvc as never);
  });

  it('GET /publish-eligibility returns the service result', async () => {
    const out = { eligible: true, reasons: [] };
    publishSvc.computeEligibility.mockResolvedValue(out);
    const r = await controller.getPublishEligibility('c1' as CourseId);
    expect(r).toBe(out);
    expect(publishSvc.computeEligibility).toHaveBeenCalledWith('c1');
  });

  it('POST /publish returns updated course', async () => {
    const updated = { id: 'c1', status: 'PUBLISHED' } as Course;
    publishSvc.publish.mockResolvedValue(updated);
    const r = await controller.publishCourse('c1' as CourseId);
    expect(r).toBe(updated);
    expect(publishSvc.publish).toHaveBeenCalledWith('c1');
  });

  it('POST /unpublish returns updated course', async () => {
    const updated = { id: 'c1', status: 'DRAFT' } as Course;
    publishSvc.unpublish.mockResolvedValue(updated);
    expect(await controller.unpublishCourse('c1' as CourseId)).toBe(updated);
  });

  it('POST /archive returns updated course', async () => {
    const updated = { id: 'c1', status: 'ARCHIVED' } as Course;
    publishSvc.archive.mockResolvedValue(updated);
    expect(await controller.archiveCourse('c1' as CourseId)).toBe(updated);
  });

  it('POST /restore returns updated course', async () => {
    const updated = { id: 'c1', status: 'DRAFT' } as Course;
    publishSvc.restore.mockResolvedValue(updated);
    expect(await controller.restoreCourse('c1' as CourseId)).toBe(updated);
  });
});
```

If any of `Course` or `CourseId` are not already imported, add them to the existing `@learnwren/shared-data-models` import block at the top of the file.

- [ ] **Step 3: Run, expect failure**

```bash
pnpm nx test api-courses
```

Expected: `controller.getPublishEligibility is not a function` and / or the constructor signature mismatch.

- [ ] **Step 4: Wire the controller**

Modify `libs/api-courses/src/lib/courses.controller.ts`:

(a) Import `PublishService` and `PublishEligibility` near the existing imports:

```ts
import type { Course, CourseId, Lesson, LessonId, Module, ModuleId, PublishEligibility } from '@learnwren/shared-data-models';
// ...
import { PublishService } from './publish/publish.service';
```

(b) Update the constructor:

```ts
constructor(
  private readonly service: CoursesService,
  private readonly publishSvc: PublishService,
) {}
```

(c) Add the five routes. Place them at the bottom of the controller class, just before the closing brace:

```ts
  // ────────────────────────── Slice D — publish gate ──────────────────────────

  @Get(':cid/publish-eligibility')
  @UseGuards(CourseOwnerGuard)
  async getPublishEligibility(@Param('cid') cid: CourseId): Promise<PublishEligibility> {
    return this.publishSvc.computeEligibility(cid);
  }

  @Post(':cid/publish')
  @UseGuards(CourseOwnerGuard)
  async publishCourse(@Param('cid') cid: CourseId): Promise<Course> {
    return this.publishSvc.publish(cid);
  }

  @Post(':cid/unpublish')
  @UseGuards(CourseOwnerGuard)
  async unpublishCourse(@Param('cid') cid: CourseId): Promise<Course> {
    return this.publishSvc.unpublish(cid);
  }

  @Post(':cid/archive')
  @UseGuards(CourseOwnerGuard)
  async archiveCourse(@Param('cid') cid: CourseId): Promise<Course> {
    return this.publishSvc.archive(cid);
  }

  @Post(':cid/restore')
  @UseGuards(CourseOwnerGuard)
  async restoreCourse(@Param('cid') cid: CourseId): Promise<Course> {
    return this.publishSvc.restore(cid);
  }
```

- [ ] **Step 5: Run tests, expect pass**

```bash
pnpm nx test api-courses
pnpm typecheck
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add libs/api-courses/src/lib/courses.controller.ts libs/api-courses/src/lib/courses.controller.spec.ts
git commit -m "feat(api-courses): publish gate controller routes (slice D)"
```

---

## Task 12: API e2e — happy path through to publish

**Files:**
- Create: `apps/api-e2e/src/publish.e2e-spec.ts`

- [ ] **Step 1: Inspect the existing helpers**

```bash
ls apps/api-e2e/src/_helpers/
```

Look for the helpers slice C uses to register, promote to instructor, create a course/module/lesson, upload a small video, and fake-transcoder-complete. Reuse them in this new spec.

- [ ] **Step 2: Write the happy-path test**

Create `apps/api-e2e/src/publish.e2e-spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  request,
  registerInstructor,
  promoteToInstructor,
  createCourse,
  createModule,
  createLesson,
  uploadSmallVideo,
  fakeTranscoderComplete,
} from './_helpers';

describe('Course publish gate — happy path', () => {
  it('publishes a fully-prepared course and round-trips through unpublish/archive/restore', async () => {
    // Setup: instructor + course with one module + one lesson + READY video
    const { sessionCookie, uid } = await registerInstructor();
    await promoteToInstructor(uid);
    const cid = await createCourse(sessionCookie, { title: 'Welding 101', description: 'Intro' });
    const mid = await createModule(sessionCookie, cid, { title: 'Safety' });
    const lid = await createLesson(sessionCookie, cid, mid, { title: 'PPE' });
    const vid = await uploadSmallVideo(sessionCookie, cid, mid, lid);
    await fakeTranscoderComplete(vid);

    // Eligibility now returns eligible: true, reasons: []
    const eligibilityRes = await request
      .get(`/api/courses/${cid}/publish-eligibility`)
      .set('Cookie', sessionCookie);
    expect(eligibilityRes.status).toBe(200);
    expect(eligibilityRes.body).toEqual({ eligible: true, reasons: [] });

    // Publish
    const publishRes = await request
      .post(`/api/courses/${cid}/publish`)
      .set('Cookie', sessionCookie);
    expect(publishRes.status).toBe(200);
    expect(publishRes.body.status).toBe('PUBLISHED');
    expect(publishRes.body.publishedAt).toBeDefined();
    const firstPublishedAt = publishRes.body.publishedAt;

    // Unpublish (publishedAt preserved)
    const unpublishRes = await request
      .post(`/api/courses/${cid}/unpublish`)
      .set('Cookie', sessionCookie);
    expect(unpublishRes.status).toBe(200);
    expect(unpublishRes.body.status).toBe('DRAFT');
    expect(unpublishRes.body.publishedAt).toBe(firstPublishedAt);

    // Archive (from DRAFT) — sets archivedAt
    const archiveRes = await request
      .post(`/api/courses/${cid}/archive`)
      .set('Cookie', sessionCookie);
    expect(archiveRes.status).toBe(200);
    expect(archiveRes.body.status).toBe('ARCHIVED');
    expect(archiveRes.body.archivedAt).toBeDefined();

    // Restore (back to DRAFT) — archivedAt cleared
    const restoreRes = await request
      .post(`/api/courses/${cid}/restore`)
      .set('Cookie', sessionCookie);
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.status).toBe('DRAFT');
    expect(restoreRes.body.archivedAt).toBeUndefined();
  });
});
```

If any helper name differs in the actual `_helpers/` index (likely some do — slice C used names like `seedInstructor`, etc.), adjust the import names to match.

- [ ] **Step 3: Run, expect pass**

```bash
pnpm nx e2e api-e2e --testPathPattern=publish.e2e-spec
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add apps/api-e2e/src/publish.e2e-spec.ts
git commit -m "test(api-e2e): publish gate happy path + round-trip (slice D)"
```

---

## Task 13: API e2e — eligibility failure branches

**Files:**
- Modify: `apps/api-e2e/src/publish.e2e-spec.ts`

- [ ] **Step 1: Append the four eligibility branches**

Append to `apps/api-e2e/src/publish.e2e-spec.ts`:

```ts
describe('Course publish gate — eligibility branches', () => {
  it('COURSE_HAS_NO_MODULES — empty course', async () => {
    const { sessionCookie, uid } = await registerInstructor();
    await promoteToInstructor(uid);
    const cid = await createCourse(sessionCookie, { title: 'T', description: 'D' });
    const res = await request
      .get(`/api/courses/${cid}/publish-eligibility`)
      .set('Cookie', sessionCookie);
    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(false);
    expect(res.body.reasons).toEqual([{ kind: 'COURSE_HAS_NO_MODULES' }]);
  });

  it('MODULE_HAS_NO_LESSONS — module exists but no lessons', async () => {
    const { sessionCookie, uid } = await registerInstructor();
    await promoteToInstructor(uid);
    const cid = await createCourse(sessionCookie, { title: 'T', description: 'D' });
    const mid = await createModule(sessionCookie, cid, { title: 'Empty' });
    const res = await request
      .get(`/api/courses/${cid}/publish-eligibility`)
      .set('Cookie', sessionCookie);
    expect(res.body.reasons).toEqual([
      { kind: 'MODULE_HAS_NO_LESSONS', moduleId: mid, moduleTitle: 'Empty', moduleOrder: 0 },
    ]);
  });

  it('LESSON_HAS_NO_VIDEO — lesson without videoId', async () => {
    const { sessionCookie, uid } = await registerInstructor();
    await promoteToInstructor(uid);
    const cid = await createCourse(sessionCookie, { title: 'T', description: 'D' });
    const mid = await createModule(sessionCookie, cid, { title: 'M' });
    const lid = await createLesson(sessionCookie, cid, mid, { title: 'L' });
    const res = await request
      .get(`/api/courses/${cid}/publish-eligibility`)
      .set('Cookie', sessionCookie);
    expect(res.body.reasons).toEqual([
      {
        kind: 'LESSON_HAS_NO_VIDEO',
        moduleId: mid, moduleTitle: 'M', moduleOrder: 0,
        lessonId: lid, lessonTitle: 'L', lessonOrder: 0,
      },
    ]);
  });

  it('LESSON_VIDEO_NOT_READY — upload completes but transcoder has not', async () => {
    const { sessionCookie, uid } = await registerInstructor();
    await promoteToInstructor(uid);
    const cid = await createCourse(sessionCookie, { title: 'T', description: 'D' });
    const mid = await createModule(sessionCookie, cid, { title: 'M' });
    const lid = await createLesson(sessionCookie, cid, mid, { title: 'L' });
    await uploadSmallVideo(sessionCookie, cid, mid, lid);
    // Deliberately skip fakeTranscoderComplete → Video.state === 'TRANSCODING'
    const res = await request
      .get(`/api/courses/${cid}/publish-eligibility`)
      .set('Cookie', sessionCookie);
    expect(res.body.reasons[0]).toMatchObject({
      kind: 'LESSON_VIDEO_NOT_READY',
      currentState: 'TRANSCODING',
    });
  });
});
```

- [ ] **Step 2: Run, expect pass**

```bash
pnpm nx e2e api-e2e --testPathPattern=publish.e2e-spec
```

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add apps/api-e2e/src/publish.e2e-spec.ts
git commit -m "test(api-e2e): publish gate eligibility branches (slice D)"
```

---

## Task 14: API e2e — negative paths + concurrency

**Files:**
- Modify: `apps/api-e2e/src/publish.e2e-spec.ts`

- [ ] **Step 1: Append the negative-path block**

Append to `apps/api-e2e/src/publish.e2e-spec.ts`:

```ts
describe('Course publish gate — auth + state-machine errors', () => {
  it('401 when no session cookie', async () => {
    const res = await request.get(`/api/courses/c-fake/publish-eligibility`);
    expect(res.status).toBe(401);
  });

  it('403 NOT_COURSE_OWNER when another instructor calls', async () => {
    const owner = await registerInstructor();
    await promoteToInstructor(owner.uid);
    const cid = await createCourse(owner.sessionCookie, { title: 'T', description: 'D' });

    const other = await registerInstructor();
    await promoteToInstructor(other.uid);

    const res = await request
      .get(`/api/courses/${cid}/publish-eligibility`)
      .set('Cookie', other.sessionCookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_COURSE_OWNER');
  });

  it('404 COURSE_NOT_FOUND for unknown :cid', async () => {
    const { sessionCookie } = await registerInstructor();
    const res = await request
      .get(`/api/courses/does-not-exist/publish-eligibility`)
      .set('Cookie', sessionCookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('COURSE_NOT_FOUND');
  });

  it('409 COURSE_ARCHIVED on eligibility preview of an archived course', async () => {
    const { sessionCookie, uid } = await registerInstructor();
    await promoteToInstructor(uid);
    const cid = await createCourse(sessionCookie, { title: 'T', description: 'D' });
    await request.post(`/api/courses/${cid}/archive`).set('Cookie', sessionCookie);

    const res = await request
      .get(`/api/courses/${cid}/publish-eligibility`)
      .set('Cookie', sessionCookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('COURSE_ARCHIVED');
  });

  it('409 INVALID_TRANSITION when publishing an already-PUBLISHED course', async () => {
    const { sessionCookie, uid } = await registerInstructor();
    await promoteToInstructor(uid);
    const cid = await createCourse(sessionCookie, { title: 'T', description: 'D' });
    const mid = await createModule(sessionCookie, cid, { title: 'M' });
    const lid = await createLesson(sessionCookie, cid, mid, { title: 'L' });
    const vid = await uploadSmallVideo(sessionCookie, cid, mid, lid);
    await fakeTranscoderComplete(vid);
    await request.post(`/api/courses/${cid}/publish`).set('Cookie', sessionCookie);

    const res = await request.post(`/api/courses/${cid}/publish`).set('Cookie', sessionCookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect(res.body.error.details).toEqual({ currentState: 'PUBLISHED', requested: 'PUBLISHED' });
  });

  it('409 INVALID_TRANSITION when unpublishing a DRAFT course', async () => {
    const { sessionCookie, uid } = await registerInstructor();
    await promoteToInstructor(uid);
    const cid = await createCourse(sessionCookie, { title: 'T', description: 'D' });
    const res = await request.post(`/api/courses/${cid}/unpublish`).set('Cookie', sessionCookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('409 INVALID_TRANSITION when restoring a DRAFT course', async () => {
    const { sessionCookie, uid } = await registerInstructor();
    await promoteToInstructor(uid);
    const cid = await createCourse(sessionCookie, { title: 'T', description: 'D' });
    const res = await request.post(`/api/courses/${cid}/restore`).set('Cookie', sessionCookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('409 PUBLISH_NOT_ELIGIBLE when publishing a DRAFT with no modules', async () => {
    const { sessionCookie, uid } = await registerInstructor();
    await promoteToInstructor(uid);
    const cid = await createCourse(sessionCookie, { title: 'T', description: 'D' });
    const res = await request.post(`/api/courses/${cid}/publish`).set('Cookie', sessionCookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PUBLISH_NOT_ELIGIBLE');
    expect(res.body.error.details.reasons).toEqual([{ kind: 'COURSE_HAS_NO_MODULES' }]);
  });

  it('serializes concurrent publish calls — one 200, one 409', async () => {
    const { sessionCookie, uid } = await registerInstructor();
    await promoteToInstructor(uid);
    const cid = await createCourse(sessionCookie, { title: 'T', description: 'D' });
    const mid = await createModule(sessionCookie, cid, { title: 'M' });
    const lid = await createLesson(sessionCookie, cid, mid, { title: 'L' });
    const vid = await uploadSmallVideo(sessionCookie, cid, mid, lid);
    await fakeTranscoderComplete(vid);

    const [r1, r2] = await Promise.all([
      request.post(`/api/courses/${cid}/publish`).set('Cookie', sessionCookie),
      request.post(`/api/courses/${cid}/publish`).set('Cookie', sessionCookie),
    ]);
    const codes = [r1.status, r2.status].sort();
    expect(codes).toEqual([200, 409]);
    const losing = r1.status === 409 ? r1 : r2;
    expect(losing.body.error.code).toBe('INVALID_TRANSITION');
  });
});
```

- [ ] **Step 2: Run, expect pass**

```bash
pnpm nx e2e api-e2e --testPathPattern=publish.e2e-spec
```

Expected: green. The auth-flake memory note applies — re-run on flake, do not chase repeated failures into the publish gate.

- [ ] **Step 3: Commit**

```bash
git add apps/api-e2e/src/publish.e2e-spec.ts
git commit -m "test(api-e2e): publish gate negative paths + concurrency (slice D)"
```

---

## Task 15: Add `(stateChanged)` `@Output` to `VideoStateBadgeComponent`

**Files:**
- Modify: `libs/web-video/src/lib/video-state-badge.component.ts`
- Modify: `libs/web-video/src/lib/video-state-badge.component.spec.ts`

- [ ] **Step 1: Open the existing badge component**

```bash
cat libs/web-video/src/lib/video-state-badge.component.ts
```

Identify where the polling subscription resolves the latest state and where it would naturally emit.

- [ ] **Step 2: Write the failing test**

Append to `libs/web-video/src/lib/video-state-badge.component.spec.ts`:

```ts
it('emits stateChanged whenever the polling stream emits a new state', async () => {
  const fixture = TestBed.createComponent(VideoStateBadgeComponent);
  const emissions: string[] = [];
  fixture.componentRef.setInput('video', {
    id: 'v1',
    state: 'TRANSCODING',
  } as never);
  fixture.componentInstance.stateChanged.subscribe((s) => emissions.push(s));
  fixture.detectChanges();
  // (The existing test in this file already drives `subject.next(...)` —
  // mirror that pattern, emitting a READY event after the component subscribes:)
  subject.next({ state: 'READY' });
  await fixture.whenStable();
  expect(emissions).toContain('READY');
});
```

If the existing test file uses a different pattern for the polling subject, mirror that pattern instead. The intent is: when the polling stream emits a new `VideoState`, `(stateChanged)` fires.

- [ ] **Step 3: Run, expect failure**

```bash
pnpm nx test web-video
```

Expected: `stateChanged is not defined` or similar.

- [ ] **Step 4: Add the `@Output`**

Modify `libs/web-video/src/lib/video-state-badge.component.ts`:

(a) Add the import:

```ts
import { Component, EventEmitter, inject, Input, OnDestroy, OnInit, Output } from '@angular/core';
```

(b) Add the output on the component class:

```ts
@Output() stateChanged = new EventEmitter<VideoState>();
```

(c) Inside the polling subscription's `next` callback (where the local `state` signal is updated), emit:

```ts
this.stateChanged.emit(s.state);
```

The exact line position depends on the existing subscription block; locate the spot where the latest state is assigned and add the emit alongside it.

- [ ] **Step 5: Run tests, expect pass**

```bash
pnpm nx test web-video
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add libs/web-video/src/lib/video-state-badge.component.ts libs/web-video/src/lib/video-state-badge.component.spec.ts
git commit -m "feat(web-video): expose (stateChanged) output on badge (slice D plug-point)"
```

---

## Task 16: Forward `(videoStateChanged)` through `LessonItemComponent`

**Files:**
- Modify: `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.ts`
- Modify: `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.html`

- [ ] **Step 1: Inspect the existing lesson-item template**

```bash
cat libs/web-courses/src/lib/components/lesson-item/lesson-item.component.html
```

- [ ] **Step 2: Add the new `@Output` on the TS class**

In `lesson-item.component.ts`, near the existing outputs (likely `(uploaded)`, `(deleted)`, etc.):

```ts
@Output() videoStateChanged = new EventEmitter<VideoState>();
```

(Add `EventEmitter`, `Output`, and `VideoState` to the imports if not already present.)

- [ ] **Step 3: Wire the badge's `(stateChanged)` to the new output in the template**

In `lesson-item.component.html`, locate the line `<lib-video-state-badge [video]="v" />` and rewrite as:

```html
<lib-video-state-badge [video]="v" (stateChanged)="videoStateChanged.emit($event)" />
```

- [ ] **Step 4: Run the existing lesson-item tests**

```bash
pnpm nx test web-courses
```

Expected: all green. No new test required for this thin pass-through — the editor-page integration test (Task 22 web e2e) covers the end-to-end refresh trigger.

- [ ] **Step 5: Commit**

```bash
git add libs/web-courses/src/lib/components/lesson-item/lesson-item.component.ts libs/web-courses/src/lib/components/lesson-item/lesson-item.component.html
git commit -m "feat(web-courses): forward videoStateChanged through LessonItem (slice D)"
```

---

## Task 17: HTTP client wrappers for the 5 new endpoints

**Files:**
- Modify: `libs/web-courses/src/lib/courses.service.ts`
- Modify: `libs/web-courses/src/lib/courses.service.spec.ts`

- [ ] **Step 1: Inspect the existing CoursesService**

```bash
grep -n "getCourse\|createCourse\|HttpClient" libs/web-courses/src/lib/courses.service.ts | head
```

This is the Angular HttpClient wrapper.

- [ ] **Step 2: Write the failing tests**

Append to `libs/web-courses/src/lib/courses.service.spec.ts`:

```ts
describe('CoursesService — slice D HTTP wrappers', () => {
  let svc: CoursesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), CoursesService],
    });
    svc = TestBed.inject(CoursesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('getPublishEligibility hits GET /api/courses/:cid/publish-eligibility', () => {
    const body = { eligible: true, reasons: [] };
    svc.getPublishEligibility('c1' as never).subscribe((r) => expect(r).toEqual(body));
    const req = httpMock.expectOne('/api/courses/c1/publish-eligibility');
    expect(req.request.method).toBe('GET');
    req.flush(body);
  });

  it.each([
    ['publish', 'publishCourse'],
    ['unpublish', 'unpublishCourse'],
    ['archive', 'archiveCourse'],
    ['restore', 'restoreCourse'],
  ] as const)('%s hits POST /api/courses/:cid/%s', (verb, method) => {
    const body = { id: 'c1', status: 'PUBLISHED' };
    (svc[method] as (cid: never) => Observable<unknown>)('c1' as never).subscribe((r) => expect(r).toEqual(body));
    const req = httpMock.expectOne(`/api/courses/c1/${verb}`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBe(null);
    req.flush(body);
  });

  afterEach(() => httpMock.verify());
});
```

Add `import type { Observable } from 'rxjs';` if needed.

- [ ] **Step 3: Run, expect failure**

```bash
pnpm nx test web-courses
```

Expected: methods do not exist.

- [ ] **Step 4: Add the wrappers**

Append to `libs/web-courses/src/lib/courses.service.ts` (inside the `CoursesService` class, at the bottom):

```ts
  // ────────────────────────── Slice D — publish gate ──────────────────────────

  getPublishEligibility(cid: CourseId): Observable<PublishEligibility> {
    return this.http.get<PublishEligibility>(`/api/courses/${cid}/publish-eligibility`);
  }

  publishCourse(cid: CourseId): Observable<Course> {
    return this.http.post<Course>(`/api/courses/${cid}/publish`, null);
  }

  unpublishCourse(cid: CourseId): Observable<Course> {
    return this.http.post<Course>(`/api/courses/${cid}/unpublish`, null);
  }

  archiveCourse(cid: CourseId): Observable<Course> {
    return this.http.post<Course>(`/api/courses/${cid}/archive`, null);
  }

  restoreCourse(cid: CourseId): Observable<Course> {
    return this.http.post<Course>(`/api/courses/${cid}/restore`, null);
  }
```

Add `PublishEligibility` to the existing `@learnwren/shared-data-models` import block.

- [ ] **Step 5: Run tests, expect pass**

```bash
pnpm nx test web-courses
pnpm typecheck
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add libs/web-courses/src/lib/courses.service.ts libs/web-courses/src/lib/courses.service.spec.ts
git commit -m "feat(web-courses): HTTP wrappers for publish gate routes (slice D)"
```

---

## Task 18: `PublishEligibilityService` (signal store with 500 ms debounce)

**Files:**
- Create: `libs/web-courses/src/lib/publish/publish-eligibility.service.ts`
- Create: `libs/web-courses/src/lib/publish/publish-eligibility.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `libs/web-courses/src/lib/publish/publish-eligibility.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CourseId } from '@learnwren/shared-data-models';

import { CoursesService } from '../courses.service';
import { PublishEligibilityService } from './publish-eligibility.service';

describe('PublishEligibilityService', () => {
  let svc: PublishEligibilityService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), CoursesService, PublishEligibilityService],
    });
    svc = TestBed.inject(PublishEligibilityService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('initial signals are null / false / null', () => {
    expect(svc.eligibility()).toBeNull();
    expect(svc.loading()).toBe(false);
    expect(svc.lastError()).toBeNull();
  });

  it('refresh fetches and stores eligibility on success', async () => {
    svc.bindToCourse('c1' as CourseId);
    svc.refresh();
    await vi.advanceTimersByTimeAsync(500);                  // debounce
    const req = httpMock.expectOne('/api/courses/c1/publish-eligibility');
    req.flush({ eligible: true, reasons: [] });
    expect(svc.eligibility()).toEqual({ eligible: true, reasons: [] });
    expect(svc.loading()).toBe(false);
    expect(svc.lastError()).toBeNull();
  });

  it('debounces rapid refresh calls into a single network request', async () => {
    vi.useFakeTimers();
    svc.bindToCourse('c1' as CourseId);
    svc.refresh(); svc.refresh(); svc.refresh();
    await vi.advanceTimersByTimeAsync(500);
    httpMock.expectOne('/api/courses/c1/publish-eligibility').flush({ eligible: true, reasons: [] });
    httpMock.verify();                                       // no extra requests
    vi.useRealTimers();
  });

  it('captures errors into lastError and treats eligibility as null', async () => {
    svc.bindToCourse('c1' as CourseId);
    svc.refresh();
    await vi.advanceTimersByTimeAsync(500);
    httpMock.expectOne('/api/courses/c1/publish-eligibility').flush(
      { error: { code: 'INTERNAL', message: 'boom' } },
      { status: 500, statusText: 'Server Error' },
    );
    expect(svc.eligibility()).toBeNull();
    expect(svc.lastError()).toMatch(/check publish status/i);
  });

  it('accepts a pre-set eligibility (used after 409 PUBLISH_NOT_ELIGIBLE)', () => {
    svc.setEligibility({ eligible: false, reasons: [{ kind: 'COURSE_HAS_NO_MODULES' }] });
    expect(svc.eligibility()).toEqual({ eligible: false, reasons: [{ kind: 'COURSE_HAS_NO_MODULES' }] });
  });

  afterEach(() => httpMock.verify());
});
```

Add fake-timers setup at top: `import { beforeEach, ... } from 'vitest';` is already present; before each `await vi.advanceTimersByTimeAsync`, the test must have called `vi.useFakeTimers()`. The first test that calls it sets timers up; subsequent tests should restore real timers in `afterEach` if needed.

- [ ] **Step 2: Run, expect failure**

```bash
pnpm nx test web-courses
```

Expected: module not found.

- [ ] **Step 3: Implement the signal store**

Create `libs/web-courses/src/lib/publish/publish-eligibility.service.ts`:

```ts
import { Injectable, inject, signal } from '@angular/core';
import { Subject, debounceTime } from 'rxjs';

import type { CourseId, PublishEligibility } from '@learnwren/shared-data-models';

import { CoursesService } from '../courses.service';

const DEBOUNCE_MS = 500;

@Injectable({ providedIn: 'root' })
export class PublishEligibilityService {
  private readonly courses = inject(CoursesService);

  private readonly _eligibility = signal<PublishEligibility | null>(null);
  private readonly _loading = signal<boolean>(false);
  private readonly _lastError = signal<string | null>(null);
  private readonly trigger$ = new Subject<void>();
  private cid: CourseId | null = null;

  readonly eligibility = this._eligibility.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly lastError = this._lastError.asReadonly();

  constructor() {
    this.trigger$.pipe(debounceTime(DEBOUNCE_MS)).subscribe(() => this.fetch());
  }

  bindToCourse(cid: CourseId): void {
    this.cid = cid;
    this._eligibility.set(null);
    this._lastError.set(null);
  }

  refresh(): void {
    this.trigger$.next();
  }

  setEligibility(e: PublishEligibility): void {
    this._eligibility.set(e);
    this._lastError.set(null);
  }

  private fetch(): void {
    if (!this.cid) return;
    this._loading.set(true);
    this._lastError.set(null);
    this.courses.getPublishEligibility(this.cid).subscribe({
      next: (e) => {
        this._eligibility.set(e);
        this._loading.set(false);
      },
      error: () => {
        this._lastError.set("Couldn't check publish status — please retry.");
        this._loading.set(false);
      },
    });
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test web-courses
```

Expected: all green. If timing-sensitive tests are flaky locally, the `vi.useFakeTimers()` line may need to be hoisted; see the existing `VideoStatePollingService` spec for the project's pattern.

- [ ] **Step 5: Commit**

```bash
git add libs/web-courses/src/lib/publish/
git commit -m "feat(web-courses): PublishEligibilityService signal store (slice D)"
```

---

## Task 19: `CoursePublishBarComponent` — status pill + primary button + menu

**Files:**
- Create: `libs/web-courses/src/lib/publish/course-publish-bar.component.ts`
- Create: `libs/web-courses/src/lib/publish/course-publish-bar.component.html`
- Create: `libs/web-courses/src/lib/publish/course-publish-bar.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web-courses/src/lib/publish/course-publish-bar.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Course } from '@learnwren/shared-data-models';

import { CoursesService } from '../courses.service';
import { CoursePublishBarComponent } from './course-publish-bar.component';
import { PublishEligibilityService } from './publish-eligibility.service';

const COURSE_DRAFT_BASE: Course = {
  id: 'c1' as never,
  title: 'My Course',
  description: 'D',
  instructorId: 'u1' as never,
  status: 'DRAFT',
  createdAt: '2026-05-20T10:00:00.000Z' as never,
  updatedAt: '2026-05-20T10:00:00.000Z' as never,
};

describe('CoursePublishBarComponent', () => {
  let fixture: ComponentFixture<CoursePublishBarComponent>;
  let coursesSvc: { publishCourse: ReturnType<typeof vi.fn>; unpublishCourse: ReturnType<typeof vi.fn>; archiveCourse: ReturnType<typeof vi.fn>; restoreCourse: ReturnType<typeof vi.fn>; };
  let publishSvc: PublishEligibilityService;

  beforeEach(() => {
    coursesSvc = {
      publishCourse: vi.fn(),
      unpublishCourse: vi.fn(),
      archiveCourse: vi.fn(),
      restoreCourse: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [CoursePublishBarComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CoursesService, useValue: coursesSvc },
      ],
    });
    publishSvc = TestBed.inject(PublishEligibilityService);
    fixture = TestBed.createComponent(CoursePublishBarComponent);
  });

  it('renders DRAFT pill + Publish button (disabled when ineligible)', () => {
    fixture.componentRef.setInput('course', COURSE_DRAFT_BASE);
    publishSvc.setEligibility({ eligible: false, reasons: [{ kind: 'COURSE_HAS_NO_MODULES' }] });
    fixture.detectChanges();
    const pill = fixture.nativeElement.querySelector('[data-testid="publish-bar-pill"]');
    const primary = fixture.nativeElement.querySelector('[data-testid="publish-bar-primary"]');
    expect(pill?.textContent).toContain('DRAFT');
    expect(primary?.textContent).toContain('Publish');
    expect(primary?.hasAttribute('disabled')).toBe(true);
  });

  it('enables Publish when eligibility is { eligible: true, reasons: [] }', () => {
    fixture.componentRef.setInput('course', COURSE_DRAFT_BASE);
    publishSvc.setEligibility({ eligible: true, reasons: [] });
    fixture.detectChanges();
    const primary = fixture.nativeElement.querySelector('[data-testid="publish-bar-primary"]');
    expect(primary?.hasAttribute('disabled')).toBe(false);
  });

  it('renders PUBLISHED pill + Unpublish primary when status is PUBLISHED', () => {
    fixture.componentRef.setInput('course', { ...COURSE_DRAFT_BASE, status: 'PUBLISHED' });
    fixture.detectChanges();
    const pill = fixture.nativeElement.querySelector('[data-testid="publish-bar-pill"]');
    const primary = fixture.nativeElement.querySelector('[data-testid="publish-bar-primary"]');
    expect(pill?.textContent).toContain('PUBLISHED');
    expect(primary?.textContent).toContain('Unpublish');
  });

  it('renders ARCHIVED pill + Restore primary when status is ARCHIVED', () => {
    fixture.componentRef.setInput('course', { ...COURSE_DRAFT_BASE, status: 'ARCHIVED' });
    fixture.detectChanges();
    const pill = fixture.nativeElement.querySelector('[data-testid="publish-bar-pill"]');
    const primary = fixture.nativeElement.querySelector('[data-testid="publish-bar-primary"]');
    expect(pill?.textContent).toContain('ARCHIVED');
    expect(primary?.textContent).toContain('Restore');
  });

  it('clicking Publish calls coursesSvc.publishCourse with the bound cid', async () => {
    fixture.componentRef.setInput('course', COURSE_DRAFT_BASE);
    publishSvc.setEligibility({ eligible: true, reasons: [] });
    coursesSvc.publishCourse.mockReturnValue({ subscribe: ({ next }: { next: (c: Course) => void }) => next({ ...COURSE_DRAFT_BASE, status: 'PUBLISHED' }) });
    fixture.detectChanges();
    const primary = fixture.nativeElement.querySelector('[data-testid="publish-bar-primary"]') as HTMLButtonElement;
    primary.click();
    await fixture.whenStable();
    expect(coursesSvc.publishCourse).toHaveBeenCalledWith('c1');
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm nx test web-courses
```

Expected: module not found.

- [ ] **Step 3: Implement the component**

Create `libs/web-courses/src/lib/publish/course-publish-bar.component.ts`:

```ts
import { CommonModule } from '@angular/common';
import { Component, computed, EventEmitter, Input, Output, inject, signal } from '@angular/core';

import type { Course, CourseStatus } from '@learnwren/shared-data-models';

import { CoursesService } from '../courses.service';
import { PublishEligibilityService } from './publish-eligibility.service';

type PrimaryActionKind = 'publish' | 'unpublish' | 'restore' | null;

@Component({
  selector: 'lib-course-publish-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './course-publish-bar.component.html',
})
export class CoursePublishBarComponent {
  @Input({ required: true }) course!: Course;

  @Output() courseUpdated = new EventEmitter<Course>();
  @Output() requestConfirm = new EventEmitter<'unpublish' | 'archive'>();

  private readonly courses = inject(CoursesService);
  protected readonly publishSvc = inject(PublishEligibilityService);

  protected readonly inFlight = signal<boolean>(false);
  protected readonly genericError = signal<string | null>(null);

  protected readonly status = computed<CourseStatus>(() => this.course.status);
  protected readonly primaryKind = computed<PrimaryActionKind>(() => {
    switch (this.course.status) {
      case 'DRAFT': return 'publish';
      case 'PUBLISHED': return 'unpublish';
      case 'ARCHIVED': return 'restore';
      default: return null;
    }
  });
  protected readonly primaryLabel = computed<string>(() => {
    switch (this.primaryKind()) {
      case 'publish': return 'Publish';
      case 'unpublish': return 'Unpublish…';
      case 'restore': return 'Restore to draft';
      default: return '';
    }
  });
  protected readonly primaryDisabled = computed<boolean>(() => {
    if (this.inFlight()) return true;
    if (this.primaryKind() === 'publish') {
      return this.publishSvc.eligibility()?.eligible !== true;
    }
    return false;
  });
  protected readonly canArchive = computed<boolean>(() =>
    this.course.status === 'DRAFT' || this.course.status === 'PUBLISHED',
  );

  protected onPrimary(): void {
    const kind = this.primaryKind();
    if (!kind) return;
    if (kind === 'unpublish') {
      this.requestConfirm.emit('unpublish');
      return;
    }
    if (kind === 'publish') this.doTransition(() => this.courses.publishCourse(this.course.id));
    if (kind === 'restore') this.doTransition(() => this.courses.restoreCourse(this.course.id));
  }

  protected onArchive(): void {
    this.requestConfirm.emit('archive');
  }

  /** Called by the editor page after the confirmation dialog resolves. */
  runConfirmedTransition(kind: 'unpublish' | 'archive'): void {
    if (kind === 'unpublish') this.doTransition(() => this.courses.unpublishCourse(this.course.id));
    if (kind === 'archive') this.doTransition(() => this.courses.archiveCourse(this.course.id));
  }

  private doTransition(call: () => { subscribe: (h: { next?: (c: Course) => void; error?: (e: unknown) => void }) => void }): void {
    this.inFlight.set(true);
    this.genericError.set(null);
    call().subscribe({
      next: (updated) => {
        this.inFlight.set(false);
        this.courseUpdated.emit(updated);
      },
      error: (e: { error?: { code?: string; details?: { reasons?: unknown[] } } } | unknown) => {
        this.inFlight.set(false);
        const code = (e as { error?: { code?: string } }).error?.code;
        if (code === 'PUBLISH_NOT_ELIGIBLE') {
          const reasons = (e as { error?: { details?: { reasons?: unknown[] } } }).error?.details?.reasons ?? [];
          this.publishSvc.setEligibility({ eligible: false, reasons: reasons as never });
        } else if (code === 'INVALID_TRANSITION') {
          this.genericError.set('The course state changed — please refresh.');
        } else {
          this.genericError.set('Something went wrong — try again.');
        }
      },
    });
  }
}
```

Create `libs/web-courses/src/lib/publish/course-publish-bar.component.html`:

```html
<div class="publish-bar" data-testid="publish-bar">
  <span class="title">{{ course.title }}</span>
  <span
    class="pill pill-{{ status() | lowercase }}"
    data-testid="publish-bar-pill"
  >{{ status() }}</span>

  <button
    type="button"
    class="primary"
    data-testid="publish-bar-primary"
    [disabled]="primaryDisabled()"
    (click)="onPrimary()"
    [attr.title]="primaryKind() === 'publish' && !primaryDisabled() ? null
                  : primaryKind() === 'publish' ? 'Resolve the issues below first'
                  : null"
  >{{ primaryLabel() }}</button>

  @if (canArchive()) {
    <button
      type="button"
      class="secondary"
      data-testid="publish-bar-archive"
      [disabled]="inFlight()"
      (click)="onArchive()"
    >Archive course…</button>
  }

  @if (genericError(); as msg) {
    <div class="banner" role="alert">{{ msg }}</div>
  }
</div>
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test web-courses
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add libs/web-courses/src/lib/publish/course-publish-bar.component.ts libs/web-courses/src/lib/publish/course-publish-bar.component.html libs/web-courses/src/lib/publish/course-publish-bar.component.spec.ts
git commit -m "feat(web-courses): CoursePublishBarComponent (slice D)"
```

---

## Task 20: `PublishEligibilityPanelComponent` — checklist + jump links

**Files:**
- Create: `libs/web-courses/src/lib/publish/publish-eligibility-panel.component.ts`
- Create: `libs/web-courses/src/lib/publish/publish-eligibility-panel.component.html`
- Create: `libs/web-courses/src/lib/publish/publish-eligibility-panel.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web-courses/src/lib/publish/publish-eligibility-panel.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CoursesService } from '../courses.service';
import { PublishEligibilityPanelComponent } from './publish-eligibility-panel.component';
import { PublishEligibilityService } from './publish-eligibility.service';

describe('PublishEligibilityPanelComponent', () => {
  let fixture: ComponentFixture<PublishEligibilityPanelComponent>;
  let publishSvc: PublishEligibilityService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PublishEligibilityPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), CoursesService],
    });
    publishSvc = TestBed.inject(PublishEligibilityService);
    fixture = TestBed.createComponent(PublishEligibilityPanelComponent);
  });

  it('renders the ready state when eligibility.eligible is true', () => {
    publishSvc.setEligibility({ eligible: true, reasons: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Ready to publish');
  });

  it('renders the count + per-reason list when blocked', () => {
    publishSvc.setEligibility({
      eligible: false,
      reasons: [
        { kind: 'MODULE_HAS_NO_LESSONS', moduleId: 'm1' as never, moduleTitle: 'Materials', moduleOrder: 1 },
        { kind: 'LESSON_HAS_NO_VIDEO',
          moduleId: 'm2' as never, moduleTitle: 'Practice', moduleOrder: 2,
          lessonId: 'l1' as never, lessonTitle: 'Setup', lessonOrder: 0 },
      ],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('2 things to fix');
    expect(fixture.nativeElement.textContent).toContain('Materials');
    expect(fixture.nativeElement.textContent).toContain('Setup');
  });

  it('omits jump link for LESSON_VIDEO_NOT_READY with TRANSCODING currentState', () => {
    publishSvc.setEligibility({
      eligible: false,
      reasons: [
        { kind: 'LESSON_VIDEO_NOT_READY',
          moduleId: 'm1' as never, moduleTitle: 'M', moduleOrder: 0,
          lessonId: 'l1' as never, lessonTitle: 'L', lessonOrder: 0,
          currentState: 'TRANSCODING' },
      ],
    });
    fixture.detectChanges();
    const jump = fixture.nativeElement.querySelector('[data-testid="jump-lesson"]');
    expect(jump).toBeNull();
  });

  it('renders jump link for LESSON_VIDEO_NOT_READY with FAILED currentState', () => {
    publishSvc.setEligibility({
      eligible: false,
      reasons: [
        { kind: 'LESSON_VIDEO_NOT_READY',
          moduleId: 'm1' as never, moduleTitle: 'M', moduleOrder: 0,
          lessonId: 'l1' as never, lessonTitle: 'L', lessonOrder: 0,
          currentState: 'FAILED' },
      ],
    });
    fixture.detectChanges();
    const jump = fixture.nativeElement.querySelector('[data-testid="jump-lesson"]');
    expect(jump).not.toBeNull();
  });

  it('shows the inline retry banner when lastError is set', () => {
    (publishSvc as never as { _lastError: { set: (s: string) => void } })._lastError.set('boom');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Couldn't check");
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
pnpm nx test web-courses
```

Expected: module not found.

- [ ] **Step 3: Implement the component**

Create `libs/web-courses/src/lib/publish/publish-eligibility-panel.component.ts`:

```ts
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, computed, inject } from '@angular/core';

import type { LessonId, ModuleId, PublishBlockReason } from '@learnwren/shared-data-models';

import { PublishEligibilityService } from './publish-eligibility.service';

@Component({
  selector: 'lib-publish-eligibility-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './publish-eligibility-panel.component.html',
})
export class PublishEligibilityPanelComponent {
  @Output() jumpToModule = new EventEmitter<ModuleId>();
  @Output() jumpToLesson = new EventEmitter<LessonId>();

  protected readonly publishSvc = inject(PublishEligibilityService);

  protected readonly eligibility = this.publishSvc.eligibility;
  protected readonly lastError = this.publishSvc.lastError;
  protected readonly reasonCount = computed(() => {
    const e = this.eligibility();
    return e && !e.eligible ? e.reasons.length : 0;
  });

  protected isEligible(): boolean {
    return this.eligibility()?.eligible === true;
  }

  protected jumpLinkVisible(r: PublishBlockReason): 'lesson' | 'module' | null {
    if (r.kind === 'MODULE_HAS_NO_LESSONS') return 'module';
    if (r.kind === 'LESSON_HAS_NO_VIDEO') return 'lesson';
    if (r.kind === 'LESSON_VIDEO_NOT_READY' && r.currentState === 'FAILED') return 'lesson';
    return null;
  }

  protected reasonText(r: PublishBlockReason): string {
    switch (r.kind) {
      case 'COURSE_HAS_NO_MODULES':
        return 'Add a module before publishing.';
      case 'MODULE_HAS_NO_LESSONS':
        return `Module "${r.moduleTitle}" has no lessons.`;
      case 'LESSON_HAS_NO_VIDEO':
        return `${r.moduleTitle} › ${r.lessonTitle} — no video uploaded yet.`;
      case 'LESSON_VIDEO_NOT_READY': {
        const txt = r.currentState === 'TRANSCODING'
          ? 'Video is still transcoding. Status will update automatically.'
          : r.currentState === 'UPLOADING' || r.currentState === 'UPLOADED' || r.currentState === 'PENDING_UPLOAD'
            ? 'Video upload is in progress.'
            : 'Video processing failed — re-upload required.';
        return `${r.moduleTitle} › ${r.lessonTitle} — ${txt}`;
      }
    }
  }

  protected onJump(r: PublishBlockReason): void {
    const link = this.jumpLinkVisible(r);
    if (link === 'module' && r.kind === 'MODULE_HAS_NO_LESSONS') this.jumpToModule.emit(r.moduleId);
    if (link === 'lesson' && (r.kind === 'LESSON_HAS_NO_VIDEO' || r.kind === 'LESSON_VIDEO_NOT_READY'))
      this.jumpToLesson.emit(r.lessonId);
  }
}
```

Create `libs/web-courses/src/lib/publish/publish-eligibility-panel.component.html`:

```html
@if (eligibility(); as e) {
  <div class="panel" data-testid="eligibility-panel">
    @if (e.eligible) {
      <div class="panel-header ok">
        <span>✓ Ready to publish</span>
      </div>
    } @else {
      <div class="panel-header blocked">
        <span>ⓘ {{ reasonCount() }} thing{{ reasonCount() === 1 ? '' : 's' }} to fix before publishing</span>
      </div>
      <ul class="reasons">
        @for (r of e.reasons; track $index) {
          <li>
            <span class="reason-text">{{ reasonText(r) }}</span>
            @if (jumpLinkVisible(r) === 'lesson') {
              <button type="button" class="jump" data-testid="jump-lesson" (click)="onJump(r)">Jump to lesson ▸</button>
            }
            @if (jumpLinkVisible(r) === 'module') {
              <button type="button" class="jump" data-testid="jump-module" (click)="onJump(r)">Jump to module ▸</button>
            }
          </li>
        }
      </ul>
    }
    @if (lastError(); as msg) {
      <div class="error-banner" role="alert" data-testid="eligibility-error">
        <span>Couldn't check publish status — {{ msg }}</span>
      </div>
    }
  </div>
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test web-courses
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add libs/web-courses/src/lib/publish/publish-eligibility-panel.component.ts libs/web-courses/src/lib/publish/publish-eligibility-panel.component.html libs/web-courses/src/lib/publish/publish-eligibility-panel.component.spec.ts
git commit -m "feat(web-courses): PublishEligibilityPanelComponent (slice D)"
```

---

## Task 21: Wire publish bar + panel into `CourseEditorPageComponent`

**Files:**
- Modify: `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts`
- Modify: `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.html`

- [ ] **Step 1: Inspect the existing editor page**

```bash
cat libs/web-courses/src/lib/course-editor-page/course-editor-page.component.html | head -40
```

Identify (a) where the course title or top-of-page section renders and (b) where the module list begins. The publish bar lands above the title; the eligibility panel lands below it, above the module list.

- [ ] **Step 2: Update the component class**

In `course-editor-page.component.ts`:

(a) Add imports:

```ts
import { CoursePublishBarComponent } from '../publish/course-publish-bar.component';
import { PublishEligibilityPanelComponent } from '../publish/publish-eligibility-panel.component';
import { PublishEligibilityService } from '../publish/publish-eligibility.service';
import type { Course, LessonId, ModuleId, VideoState } from '@learnwren/shared-data-models';
```

(b) Add to the `@Component.imports` array:

```ts
imports: [
  // ...existing imports...
  CoursePublishBarComponent,
  PublishEligibilityPanelComponent,
],
```

(c) Inject the publish service in the constructor / class field area:

```ts
private readonly publishSvc = inject(PublishEligibilityService);
protected readonly pendingTransitionConfirm = signal<'unpublish' | 'archive' | null>(null);

@ViewChild(CoursePublishBarComponent) protected publishBar?: CoursePublishBarComponent;
```

(Make sure `inject` and `ViewChild` are imported from `@angular/core`.)

(d) On the existing `refresh()` method, after it sets `this.tree.set(...)`, add a `publishSvc.bindToCourse(...)` call (only on the first successful load) and trigger a refresh:

```ts
async refresh(): Promise<void> {
  try {
    const tree = await this.coursesSvc.getCourseTree(this.cid);
    this.tree.set(tree);
    this.publishSvc.bindToCourse(this.cid);
    this.publishSvc.refresh();
  } catch (e) {
    this.error.set('Failed to load course — please refresh.');
  }
}
```

(e) Add the handlers the bar + panel emit to:

```ts
protected onCourseUpdated(updated: Course): void {
  const t = this.tree();
  if (t) this.tree.set({ ...t, course: updated });
  // Republish eligibility panel only when back to DRAFT — for PUBLISHED/ARCHIVED it's hidden anyway.
  if (updated.status === 'DRAFT') this.publishSvc.refresh();
}

protected onRequestConfirm(kind: 'unpublish' | 'archive'): void {
  this.pendingTransitionConfirm.set(kind);
}

protected onConfirmTransition(): void {
  const kind = this.pendingTransitionConfirm();
  if (!kind) return;
  this.publishBar?.runConfirmedTransition(kind);
  this.pendingTransitionConfirm.set(null);
}

protected onCancelTransition(): void {
  this.pendingTransitionConfirm.set(null);
}

protected onVideoStateChanged(_state: VideoState): void {
  this.publishSvc.refresh();
}

protected onJumpToModule(mid: ModuleId): void {
  const el = document.querySelector(`[data-module-id="${mid}"]`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

protected onJumpToLesson(lid: LessonId): void {
  const el = document.querySelector(`[data-lesson-id="${lid}"]`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
```

- [ ] **Step 3: Update the template**

In `course-editor-page.component.html`, at the very top (above the existing title or first card), insert:

```html
@if (tree(); as t) {
  <lib-course-publish-bar
    [course]="t.course"
    (courseUpdated)="onCourseUpdated($event)"
    (requestConfirm)="onRequestConfirm($event)"
  />
  @if (t.course.status === 'DRAFT') {
    <lib-publish-eligibility-panel
      (jumpToModule)="onJumpToModule($event)"
      (jumpToLesson)="onJumpToLesson($event)"
    />
  }
}
```

For each existing `<lib-lesson-item>` invocation in the template, add the `(videoStateChanged)` handler:

```html
<lib-lesson-item
  [lesson]="..."
  ...
  (videoStateChanged)="onVideoStateChanged($event)"
/>
```

Wherever the existing module / lesson cards render, add `data-module-id` / `data-lesson-id` attributes on the appropriate elements so the jump-to handlers can find them:

```html
<div class="module-card" [attr.data-module-id]="m.id">
  ...
  <div class="lesson-row" [attr.data-lesson-id]="l.id">
    ...
  </div>
</div>
```

Append the confirmation dialog at the bottom of the template:

```html
@if (pendingTransitionConfirm(); as kind) {
  <div class="dialog-backdrop" data-testid="confirm-dialog">
    <div class="dialog">
      @if (kind === 'unpublish') {
        <h3>Unpublish "{{ tree()?.course?.title }}"?</h3>
        <p>The course will return to draft. Once a student catalogue exists, the course will no longer be discoverable. Existing enrolled students would retain access.</p>
      }
      @if (kind === 'archive') {
        <h3>Archive "{{ tree()?.course?.title }}"?</h3>
        <p>Archived courses are hidden from the catalogue. You can restore the course to draft at any time.</p>
      }
      <div class="dialog-actions">
        <button type="button" (click)="onCancelTransition()" data-testid="confirm-cancel">Cancel</button>
        <button type="button" (click)="onConfirmTransition()" data-testid="confirm-go">
          {{ kind === 'unpublish' ? 'Unpublish course' : 'Archive course' }}
        </button>
      </div>
    </div>
  </div>
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test web-courses
```

Expected: existing editor tests still green. New behaviour is exercised by web e2e (Task 22).

- [ ] **Step 5: Commit**

```bash
git add libs/web-courses/src/lib/course-editor-page/
git commit -m "feat(web-courses): wire publish bar + panel + confirms into editor (slice D)"
```

---

## Task 22: Web e2e — happy path through publish + unpublish

**Files:**
- Create: `apps/web-e2e/src/publish-gate.spec.ts`

- [ ] **Step 1: Confirm helper signatures in the slice-C web e2e**

```bash
grep -n "registerAndPromoteInstructor\|setupCourseWithLesson\|FIXTURE_MP4" apps/web-e2e/src/videos.spec.ts | head
```

Expected: `registerAndPromoteInstructor()`, `setupCourseWithLesson(page, email, password)`, and a `FIXTURE_MP4` constant pointing at `small-video.mp4`. These are the helpers slice D's tests copy.

- [ ] **Step 2: Write the test file with inline helpers**

Create `apps/web-e2e/src/publish-gate.spec.ts`:

```ts
import * as path from 'path';

import { expect, test, type Page } from '@playwright/test';
import * as admin from 'firebase-admin';

// Shared with apps/web-e2e/src/videos.spec.ts. A future refactor can extract
// these into apps/web-e2e/src/_helpers.ts; intentionally duplicated for now
// so slice D doesn't touch slice-C surface area.
if (admin.apps.length === 0) {
  process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099';
  process.env['FIRESTORE_EMULATOR_HOST'] = '127.0.0.1:8080';
  admin.initializeApp({ projectId: 'demo-learnwren' });
}

const API_BASE = 'http://localhost:3333/api';
const FIXTURE_MP4 = path.join(__dirname, 'fixtures', 'small-video.mp4');

async function registerAndPromoteInstructor(): Promise<{ email: string; password: string }> {
  const email = `pub-e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
  const password = 'Aa1!aaaaaaaa';
  const reg = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName: 'I' }),
  });
  expect(reg.status).toBe(201);
  const { uid } = (await reg.json()) as { uid: string };
  await admin.auth().updateUser(uid, { emailVerified: true });
  await admin.auth().setCustomUserClaims(uid, { role: 'INSTRUCTOR' });
  await admin.firestore().collection('users').doc(uid).update({ role: 'INSTRUCTOR' });
  return { email, password };
}

async function setupCourseWithLesson(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
  await page.goto('/courses');
  await expect(page.getByTestId('create-course')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('create-course').click();
  await page.getByTestId('title').fill(`Pub E2E ${Date.now()}`);
  await page.getByTestId('description').fill('e2e publish gate course');
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('course-meta')).toBeVisible({ timeout: 10_000 });
  page.once('dialog', async (d) => { await d.accept('Publish Module'); });
  await page.getByTestId('add-module').click();
  await expect(page.getByTestId('module-title')).toHaveText('Publish Module', { timeout: 5_000 });
  await page.getByTestId('add-lesson').click();
  await page.getByTestId('add-lesson-input').fill('Publish Lesson');
  await page.getByTestId('add-lesson-input').press('Enter');
  await expect(page.getByTestId('lesson-title')).toHaveText('Publish Lesson', { timeout: 5_000 });
}

/** Upload the fixture + drive the fake transcoder to READY. Mirrors the slice-C
 *  upload helper in videos.spec.ts. */
async function uploadAndCompleteVideo(page: Page): Promise<void> {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('upload-video').click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles(FIXTURE_MP4);
  // Wait for the slice-A upload-complete badge:
  await expect(page.getByTestId('video-state-badge')).toBeVisible({ timeout: 30_000 });
  // Trigger the fake transcoder via its dev endpoint:
  const vid = await page.getByTestId('video-state-badge').getAttribute('data-video-id');
  expect(vid).toBeTruthy();
  const fakeRes = await fetch(`${API_BASE}/internal/fake-transcoder/complete/${vid}`, { method: 'POST' });
  expect(fakeRes.status).toBe(200);
  // Wait for the player swap (slice C):
  await expect(page.getByTestId('video-player')).toBeVisible({ timeout: 15_000 });
}

test.describe('Publish gate', () => {
  test('round-trips DRAFT → PUBLISHED → DRAFT through unpublish', async ({ page }) => {
    const { email, password } = await registerAndPromoteInstructor();
    await setupCourseWithLesson(page, email, password);
    await uploadAndCompleteVideo(page);

    await expect(page.getByTestId('publish-bar-pill')).toHaveText('DRAFT');
    await expect(page.getByTestId('eligibility-panel')).toContainText('Ready to publish');
    await expect(page.getByTestId('publish-bar-primary')).toBeEnabled();

    await page.getByTestId('publish-bar-primary').click();
    await expect(page.getByTestId('publish-bar-pill')).toHaveText('PUBLISHED');
    await expect(page.getByTestId('eligibility-panel')).toHaveCount(0);
    await expect(page.getByTestId('publish-bar-primary')).toContainText('Unpublish');

    await page.getByTestId('publish-bar-primary').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-go').click();
    await expect(page.getByTestId('publish-bar-pill')).toHaveText('DRAFT');
  });

  test('Publish button is disabled when a lesson has no video', async ({ page }) => {
    const { email, password } = await registerAndPromoteInstructor();
    await setupCourseWithLesson(page, email, password);
    // Skip uploadAndCompleteVideo — the lesson has no video.
    await expect(page.getByTestId('publish-bar-pill')).toHaveText('DRAFT');
    await expect(page.getByTestId('eligibility-panel')).toContainText('to fix');
    await expect(page.getByTestId('publish-bar-primary')).toBeDisabled();
  });

  test('Archive + Restore round-trip', async ({ page }) => {
    const { email, password } = await registerAndPromoteInstructor();
    await setupCourseWithLesson(page, email, password);
    // Course is DRAFT (no eligibility needed for archive).
    await expect(page.getByTestId('publish-bar-archive')).toBeEnabled();
    await page.getByTestId('publish-bar-archive').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-go').click();
    await expect(page.getByTestId('publish-bar-pill')).toHaveText('ARCHIVED');
    await expect(page.getByTestId('publish-bar-primary')).toContainText('Restore');
    await page.getByTestId('publish-bar-primary').click();  // confirm-less
    await expect(page.getByTestId('publish-bar-pill')).toHaveText('DRAFT');
  });
});
```

Note: this assumes `<lib-video-state-badge>` renders `data-video-id` on its root element. If it does not, add `[attr.data-video-id]="video().id"` to `libs/web-video/src/lib/video-state-badge.component.html` as part of this task (one-line addition; no test required since the e2e exercises it). The slice C web e2e likely already established this convention — check `apps/web-e2e/src/videos.spec.ts` for the equivalent attribute and replicate.

If `[data-testid="upload-video"]` is not the existing selector for the slice-A upload component, replace it with whatever `apps/web-e2e/src/videos.spec.ts` uses.

- [ ] **Step 3: Run, expect pass**

```bash
pnpm nx e2e web-e2e --testPathPattern=publish-gate.spec
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add apps/web-e2e/src/publish-gate.spec.ts
git commit -m "test(web-e2e): publish gate round-trip + blocked path (slice D)"
```

---

## Task 23: Refresh mutation report and verify ≥ 85 % score

**Files:**
- Modify: `reports/mutation/api-courses/mutation.{html,json}` (regenerated)
- Modify: `docs/quality/mutation-report.md` (triage notes)

- [ ] **Step 1: Run Stryker against api-courses**

```bash
pnpm exec stryker run stryker.api-courses.config.mjs
```

Expected: completes; outputs go to `reports/mutation/api-courses/`. Aim for ≥ 85 % effective score (architecture-spec bar).

If the score regresses below 85 %, look at the surviving mutants in `reports/mutation/api-courses/mutation.html` — the most common gap will be in `composeReasons` ordering (add a test that asserts `reasons[0]` vs `reasons[1]` explicitly), or in the `PublishService` source-state guard (add a test that pins each `INVALID_TRANSITION` case).

- [ ] **Step 2: Update triage notes**

Open `docs/quality/mutation-report.md` and append a slice-D section summarising:
- The surviving mutants you accepted as equivalent (with rationale).
- The score before / after slice D.
- A note that the existing api-courses excluded set (`courses.repository.ts`, `courses.exception-filter.ts`, `dto/`, `types/`, `errors/`) is unchanged.

Keep the section terse (5–10 lines), matching the slice C section's style.

- [ ] **Step 3: Commit**

```bash
git add reports/mutation/api-courses/ docs/quality/mutation-report.md
git commit -m "chore(quality): refresh api-courses mutation report for slice D"
```

---

## Task 24: Refresh CRAP report

**Files:**
- Modify: `docs/quality/crap-report.md` (regenerated by the existing tool)

- [ ] **Step 1: Run the CRAP tool**

```bash
node tools/crap/crap.mjs
```

Expected: completes; updates `docs/quality/crap-report.md`. The new `publish/` submodules in `libs/api-courses` and `libs/web-courses` appear in the per-file breakdown.

- [ ] **Step 2: Eyeball the report**

```bash
grep -n "publish" docs/quality/crap-report.md | head -20
```

The new `publish-eligibility.ts` (pure), `publish.service.ts` (IO + 4 transitions), `course-publish-bar.component.ts`, and `publish-eligibility-panel.component.ts` should appear with reasonable CRAP scores (the pure function should be very low; the service in the low double digits at worst).

- [ ] **Step 3: Commit**

```bash
git add docs/quality/crap-report.md
git commit -m "chore(quality): refresh CRAP report for slice D surface"
```

---

## Task 25: Update README + spec cross-references

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-03-27-mvp-use-cases-design.md`
- Modify: `docs/superpowers/specs/2026-05-12-course-authoring-design.md`

- [ ] **Step 1: Update the README status banner**

Open `README.md`. Find the `> [!NOTE] PROJECT STATUS: EARLY DEVELOPMENT` block (around line 5–8). Append slice D completion to the banner per the spec's §11:

> EP-03 slice D (course publish gate) complete: instructors can publish / unpublish / archive / restore courses with structured eligibility feedback. Catalogue (EP-05) and enrolled-student playback (EP-06) remain deferred.

- [ ] **Step 2: Update the API endpoints table**

In the same README, find the "API endpoints exposed by this slice" table for the auth slice. After it, add (or extend an existing slice-D section) a small table listing the five new courses routes:

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/courses/:cid/publish-eligibility` | Preview publish eligibility; returns `{ eligible, reasons }`. |
| `POST` | `/api/courses/:cid/publish` | Transition DRAFT → PUBLISHED (atomic eligibility revalidation). |
| `POST` | `/api/courses/:cid/unpublish` | Transition PUBLISHED → DRAFT. |
| `POST` | `/api/courses/:cid/archive` | Transition DRAFT or PUBLISHED → ARCHIVED. |
| `POST` | `/api/courses/:cid/restore` | Transition ARCHIVED → DRAFT. |

- [ ] **Step 3: Update MVP use-cases design footnote**

Open `docs/superpowers/specs/2026-03-27-mvp-use-cases-design.md`. Find the MVP scope table footnote / status indicator for UC-02-04. Update it to point at this slice's design:

> UC-02-04 is in scope, addressed by `docs/superpowers/specs/2026-05-20-publish-gate-slice-d-design.md` (slice D).

- [ ] **Step 4: Update course-authoring design cross-reference**

Open `docs/superpowers/specs/2026-05-12-course-authoring-design.md`. The "deferred to EP-03" note for US-02-04 (around line 34) should now read:

> **US-02-04 (Publish, Unpublish, Archive).** Shipped as EP-03 slice D — see `2026-05-20-publish-gate-slice-d-design.md`.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/superpowers/specs/2026-03-27-mvp-use-cases-design.md docs/superpowers/specs/2026-05-12-course-authoring-design.md
git commit -m "docs(readme): EP-03 slice D complete — course publish gate"
```

---

## Task 26: Final verification + merge

- [ ] **Step 1: Full quality gate**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

Expected: every command exits 0.

- [ ] **Step 2: Manual smoke against the emulator suite**

In one terminal:

```bash
pnpm emulators
```

In another:

```bash
pnpm start
```

In a browser at `http://localhost:4200`, sign in as a promoted instructor, walk through:

1. Create a course → editor mounts → publish bar shows `DRAFT` + Publish disabled + panel shows `COURSE_HAS_NO_MODULES`.
2. Add a module + lesson → panel shows `LESSON_HAS_NO_VIDEO`.
3. Upload a video → wait for badge to read `Transcoding` → eventually `Ready to publish`.
4. Click Publish → pill flips to `PUBLISHED`; panel hidden; Unpublish primary.
5. Click Unpublish → confirm dialog → confirm → pill flips back; panel reappears.
6. Click Archive (in DRAFT) → confirm → pill flips to `ARCHIVED`; Restore primary; no eligibility panel.
7. Click Restore → pill flips to `DRAFT`; panel reappears.

No console errors on any path.

- [ ] **Step 3: Spec status update**

Open `docs/superpowers/specs/2026-05-20-publish-gate-slice-d-design.md`. Change the front-matter banner from `DRAFT` to `APPROVED`:

```markdown
> [!NOTE]
> **DOCUMENT STATUS: APPROVED**
```

Commit:

```bash
git add docs/superpowers/specs/2026-05-20-publish-gate-slice-d-design.md
git commit -m "docs(specs): slice D design Approved"
```

- [ ] **Step 4: Merge back to main**

```bash
git checkout main
git merge --no-ff ep-03-slice-d-publish-gate
git log --oneline -5
```

Expected: clean merge; the new commits land on `main`.

- [ ] **Step 5: Sanity rerun on `main`**

```bash
pnpm test && pnpm e2e
```

Expected: green.

---

## Self-Review Checklist

Run through this once the plan is complete:

**Spec coverage:**
- §1 state machine → Tasks 4, 8, 9
- §2 API surface → Tasks 11, 12
- §3 data model → Tasks 1, 2, 4
- §4 library structure → Tasks 5, 6, 7, 10, 18, 19, 20
- §5 eligibility algorithm → Tasks 5, 7, 8
- §6 editor UI → Tasks 19, 20, 21
- §7 failure modes → Tasks 14, 21
- §8 testing → Tasks 5, 7, 8, 9, 11, 12, 13, 14, 18, 19, 20, 22, 23
- §9 locked decisions → distributed across implementation tasks
- §10 env vars → N/A (none)
- §11 doc updates → Task 25
- §12 acceptance bar → Task 26

**Sequencing sanity:**
- Data model types (1, 2) before exceptions referencing them (3).
- Repo helpers (4) before service that uses them (7, 8, 9).
- VideoServiceLike widening (6) before service that calls it (7).
- Service complete (10) before controller (11).
- Controller complete (11) before api-e2e (12, 13, 14).
- Badge `@Output` (15) before LessonItem forwarding (16) before editor wiring (21).
- HTTP wrappers (17) before signal store (18) before components (19, 20) before editor wiring (21).
- All implementation tasks before quality refresh (23, 24).
- All implementation + docs before final merge (26).

**Per-task TDD discipline:** every task begins with a failing test, implements the minimum to pass, then commits. The only exceptions are:
- Task 4 (repository): exercised through api-e2e in Tasks 12–14 per the EP-02 precedent.
- Task 10 (module wiring): verified by api-e2e in Tasks 12–14.
- Task 16 (LessonItem pass-through): verified end-to-end in Task 22.
- Tasks 23–26 (quality, docs, merge): structurally cannot be TDD.
