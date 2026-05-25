# EP-06 Slice C — Resume Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship UC-06-03: an enrolled student's last-accessed lesson is tracked per-enrolment; the catalog course-detail page surfaces a **Continue Learning** CTA pointing at that lesson (falling back to **Start Learning** → first lesson); the lesson player auto-saves position every ~15 s and flushes on pause/pagehide; on revisit the player seeks to the saved position within a 5 s tolerance.

**Architecture:** Extend the existing `learn/` submodule in `libs/api-courses` with one POST endpoint (`/position`) and a side-effect on the existing GET that bumps `lastAccessedLessonId` on the caller's enrolment. Two new `Enrollment` fields (`lastAccessedLessonId`, `lastAccessedAt`) and one finally-used `LessonProgress` field (`lastWatchedSeconds`). All writes are Firestore-transactional; the position write is **idempotent + monotonic** (drops smaller-than-stored values) so out-of-order beacons can't rewind progress. The web library extends `VideoPlayerComponent` with `(metadata)`/`(played)`/`(paused)`/`(ended)` outputs plus `currentTime()`/`seekTo()` accessors, introduces a `PositionSaver` helper, and adds a Continue/Start Learning CTA computed signal pair on the course-detail page.

**Tech Stack:** NestJS 11 (controllers + guards + per-feature exception filter), Firestore transactions (via `api-firebase`), Vitest + fake-firestore for backend unit tests, Playwright for api-e2e and web-e2e, Angular 21 standalone signal-based components, hls.js (unchanged from Slice A), `navigator.sendBeacon` with `fetch keepalive` fallback for unload writes.

**Spec:** [`docs/superpowers/specs/2026-05-25-ep06-slice-c-resume-learning-design.md`](../specs/2026-05-25-ep06-slice-c-resume-learning-design.md)

**Working tree:** Create an isolated worktree at `.claude/worktrees/ep06-slice-c-resume-learning` on a new branch `ep06-slice-c-resume-learning` branched from local `main` HEAD (NOT `origin/main` — local is 19+ commits ahead). Symlink `node_modules` to the parent (`ln -s ../../node_modules .claude/worktrees/ep06-slice-c-resume-learning/node_modules`) so installs are instant. **Never run `git add -A`** in this worktree — the symlink evades `.gitignore`'s `node_modules/` rule and would be staged. Stage files by name. Use `superpowers:using-git-worktrees` to set this up before executing.

---

## Task 1: Add `lastAccessedLessonId` / `lastAccessedAt` to the `Enrollment` shared type and extend `LessonView.progress` with `lastWatchedSeconds`

**Files:**
- Modify: `libs/shared-data-models/src/lib/enrollment.ts`
- Modify: `libs/shared-data-models/src/lib/lesson-view.ts`
- Modify: `libs/shared-data-models/src/lib/enrollment.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `libs/shared-data-models/src/lib/enrollment.spec.ts`:

```ts
import type { Enrollment, LessonProgress } from './enrollment';
import type { CourseId, EnrollmentId, ISODateString, LessonId, UserId } from './common';

describe('Enrollment (Slice C)', () => {
  it('accepts lastAccessedLessonId and lastAccessedAt as nullable companion fields', () => {
    const e: Enrollment = {
      id: 'u__c' as EnrollmentId,
      userId: 'u' as UserId,
      courseId: 'c' as CourseId,
      status: 'ACTIVE',
      progress: [],
      withdrawnAt: null,
      lastAccessedLessonId: 'lesson-x' as LessonId,
      lastAccessedAt: '2026-05-25T12:00:00.000Z' as ISODateString,
      createdAt: '2026-05-01T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-25T12:00:00.000Z' as ISODateString,
    };
    expect(e.lastAccessedLessonId).toBe('lesson-x');
    expect(e.lastAccessedAt).toMatch(/2026/);
  });

  it('accepts null for both companion fields', () => {
    const e: Pick<Enrollment, 'lastAccessedLessonId' | 'lastAccessedAt'> = {
      lastAccessedLessonId: null,
      lastAccessedAt: null,
    };
    expect(e.lastAccessedLessonId).toBeNull();
    expect(e.lastAccessedAt).toBeNull();
  });

  it('LessonProgress has a numeric lastWatchedSeconds', () => {
    const p: LessonProgress = { lessonId: 'l' as LessonId, completedAt: null, lastWatchedSeconds: 42 };
    expect(p.lastWatchedSeconds).toBe(42);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test shared-data-models --testFile=enrollment.spec.ts`
Expected: FAIL with TypeScript error — `Object literal may only specify known properties, and 'lastAccessedLessonId' does not exist in type 'Enrollment'`.

- [ ] **Step 3: Extend the `Enrollment` interface**

In `libs/shared-data-models/src/lib/enrollment.ts`, replace the existing `Enrollment` interface with:

```ts
export interface Enrollment {
  id: EnrollmentId; // deterministic composite — `${userId}__${courseId}`
  userId: UserId;
  courseId: CourseId;
  status: EnrollmentStatus;
  progress: LessonProgress[];
  withdrawnAt: ISODateString | null;
  /** Lesson the caller most recently opened via GET /api/learn/.../lessons/:lid. Null until first visit. Preserved across WITHDRAWN→ACTIVE. */
  lastAccessedLessonId: LessonId | null;
  /** Companion timestamp for lastAccessedLessonId. Debug/observability only; not read by UI. */
  lastAccessedAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

- [ ] **Step 4: Extend `LessonView.progress`**

In `libs/shared-data-models/src/lib/lesson-view.ts`, replace the `progress` field definition with:

```ts
  /**
   * The caller's per-lesson progress (populated by UC-06-02 Mark Complete and
   * UC-06-03 Resume Learning; optional for backwards compatibility):
   *   - null when the caller is the course's owner (no enrolment doc),
   *   - { completedAt: null, lastWatchedSeconds: 0 } when the caller is an
   *     enrolled student with no progress row yet,
   *   - { completedAt: <ISO|null>, lastWatchedSeconds: <number> } when a row
   *     exists.
   */
  progress?: {
    completedAt: ISODateString | null;
    lastWatchedSeconds: number;
  } | null;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test shared-data-models --testFile=enrollment.spec.ts`
Expected: PASS.

- [ ] **Step 6: Verify the broader workspace still typechecks**

Run: `pnpm nx run-many -t typecheck -p shared-data-models,api-courses,web-learn,web-catalog,web-enrollment`
Expected: PASS. (If `api-courses` or any web lib breaks because they construct `Enrollment` literals, those will be fixed in later tasks.)

If you see new typecheck errors in `enrollment.repository.ts` or `enrollment.service.ts` because they construct enrollment literals without the new fields, defer the fix — Task 4 handles it. Note the failing files for that task.

- [ ] **Step 7: Commit**

```bash
git add libs/shared-data-models/src/lib/enrollment.ts \
        libs/shared-data-models/src/lib/lesson-view.ts \
        libs/shared-data-models/src/lib/enrollment.spec.ts
git commit -m "feat(shared-data-models): add Enrollment.lastAccessedLessonId/lastAccessedAt and LessonView.progress.lastWatchedSeconds for EP-06 Slice C"
```

---

## Task 2: Add `INVALID_POSITION` to the learn error catalogue + `InvalidPositionException`

**Files:**
- Modify: `libs/api-courses/src/lib/learn/errors/learn-error.codes.ts`
- Modify: `libs/api-courses/src/lib/learn/errors/learn.exception.ts`
- Modify: `libs/api-courses/src/lib/learn/errors/learn.exception.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `libs/api-courses/src/lib/learn/errors/learn.exception.spec.ts`:

```ts
describe('InvalidPositionException', () => {
  it('has code INVALID_POSITION and HTTP 400', () => {
    const err = new InvalidPositionException();
    expect(err.code).toBe('INVALID_POSITION');
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/position/i);
  });
});
```

And update the import at the top:

```ts
import {
  InvalidPositionException,
  LessonNotFoundException,
  NotEnrolledLessonException,
  NotLessonOwnerException,
} from './learn.exception';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses --testFile=learn.exception.spec.ts`
Expected: FAIL — `InvalidPositionException is not defined`.

- [ ] **Step 3: Extend the codes union**

Replace `libs/api-courses/src/lib/learn/errors/learn-error.codes.ts` with:

```ts
export const LEARN_ERROR_CODES = [
  'LESSON_NOT_FOUND',
  'NOT_LESSON_OWNER',
  'NOT_ENROLLED_LESSON',
  'INVALID_POSITION',
] as const;
export type LearnErrorCode = (typeof LEARN_ERROR_CODES)[number];
```

- [ ] **Step 4: Add the new exception class**

Append to `libs/api-courses/src/lib/learn/errors/learn.exception.ts`:

```ts
export class InvalidPositionException extends LearnException {
  constructor() {
    super(
      'INVALID_POSITION',
      'Playback position must be a finite non-negative number.',
      400,
    );
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test api-courses --testFile=learn.exception.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/api-courses/src/lib/learn/errors/learn-error.codes.ts \
        libs/api-courses/src/lib/learn/errors/learn.exception.ts \
        libs/api-courses/src/lib/learn/errors/learn.exception.spec.ts
git commit -m "feat(api-courses): add InvalidPositionException for EP-06 Slice C position endpoint"
```

---

## Task 3: `EnrollmentRepository.touchLastAccessed` (TDD)

**Files:**
- Modify: `libs/api-courses/src/lib/enrollment/enrollment.repository.ts`
- Modify: `libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts`:

```ts
describe('EnrollmentRepository.touchLastAccessed', () => {
  const NOW = '2026-05-25T12:00:00.000Z' as ISODateString;
  const LID = 'lesson-x' as LessonId;

  function active(over: Partial<Enrollment> = {}): Enrollment {
    return {
      id: ID,
      userId: UID,
      courseId: CID,
      status: 'ACTIVE',
      progress: [],
      withdrawnAt: null,
      lastAccessedLessonId: null,
      lastAccessedAt: null,
      createdAt: '2026-05-01T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-01T00:00:00.000Z' as ISODateString,
      ...over,
    };
  }

  it('sets lastAccessedLessonId and lastAccessedAt on an ACTIVE enrolment', async () => {
    const { repo, db } = repoWith({ [`enrollments/${ID}`]: active() });
    await repo.touchLastAccessed(UID, CID, LID, NOW);
    const stored = db.__store.get(`enrollments/${ID}`) as Enrollment;
    expect(stored.lastAccessedLessonId).toBe(LID);
    expect(stored.lastAccessedAt).toBe(NOW);
    expect(stored.updatedAt).toBe(NOW);
  });

  it('overwrites a prior lastAccessedLessonId on each call', async () => {
    const seeded = active({ lastAccessedLessonId: 'old' as LessonId, lastAccessedAt: '2026-05-20T00:00:00.000Z' as ISODateString });
    const { repo, db } = repoWith({ [`enrollments/${ID}`]: seeded });
    await repo.touchLastAccessed(UID, CID, LID, NOW);
    const stored = db.__store.get(`enrollments/${ID}`) as Enrollment;
    expect(stored.lastAccessedLessonId).toBe(LID);
  });

  it('throws NotEnrolledException when the enrolment is WITHDRAWN', async () => {
    const { repo } = repoWith({ [`enrollments/${ID}`]: active({ status: 'WITHDRAWN', withdrawnAt: NOW }) });
    await expect(repo.touchLastAccessed(UID, CID, LID, NOW)).rejects.toBeInstanceOf(NotEnrolledException);
  });

  it('throws NotEnrolledException when no enrolment exists', async () => {
    const { repo } = repoWith({});
    await expect(repo.touchLastAccessed(UID, CID, LID, NOW)).rejects.toBeInstanceOf(NotEnrolledException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses --testFile=enrollment.repository.spec.ts`
Expected: FAIL — `repo.touchLastAccessed is not a function`.

- [ ] **Step 3: Implement the method**

In `libs/api-courses/src/lib/enrollment/enrollment.repository.ts`, append a new method to the `EnrollmentRepository` class (after `markLessonComplete`):

```ts
  async touchLastAccessed(
    userId: UserId,
    courseId: CourseId,
    lessonId: LessonId,
    nowIso: ISODateString,
  ): Promise<void> {
    const enrollmentRef = this.db.collection(ENROLLMENTS).doc(enrollmentId(userId, courseId));

    await this.db.runTransaction(async (t) => {
      const snap = await t.get(enrollmentRef);
      const existing = snap.exists ? (snap.data() as Enrollment) : null;
      if (!existing || existing.status !== 'ACTIVE') {
        throw new NotEnrolledException();
      }
      t.update(enrollmentRef, {
        lastAccessedLessonId: lessonId,
        lastAccessedAt: nowIso,
        updatedAt: nowIso,
      });
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-courses --testFile=enrollment.repository.spec.ts`
Expected: PASS for the new describe block; existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/enrollment/enrollment.repository.ts \
        libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts
git commit -m "feat(api-courses): EnrollmentRepository.touchLastAccessed for EP-06 Slice C"
```

---

## Task 4: `EnrollmentRepository.setLastWatchedSeconds` (TDD, monotonic + idempotent)

**Files:**
- Modify: `libs/api-courses/src/lib/enrollment/enrollment.repository.ts`
- Modify: `libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts`:

```ts
describe('EnrollmentRepository.setLastWatchedSeconds', () => {
  const LID = 'lesson-x' as LessonId;

  function activeWith(progress: Enrollment['progress'] = []): Enrollment {
    return {
      id: ID,
      userId: UID,
      courseId: CID,
      status: 'ACTIVE',
      progress,
      withdrawnAt: null,
      lastAccessedLessonId: null,
      lastAccessedAt: null,
      createdAt: '2026-05-01T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-01T00:00:00.000Z' as ISODateString,
    };
  }

  it('inserts a new LessonProgress row when none exists for the lesson', async () => {
    const { repo, db } = repoWith({ [`enrollments/${ID}`]: activeWith() });
    const out = await repo.setLastWatchedSeconds(UID, CID, LID, 42);
    expect(out).toEqual({ lastWatchedSeconds: 42 });
    const stored = db.__store.get(`enrollments/${ID}`) as Enrollment;
    expect(stored.progress).toEqual([{ lessonId: LID, completedAt: null, lastWatchedSeconds: 42 }]);
  });

  it('updates an existing row when the inbound value is larger', async () => {
    const seed = activeWith([{ lessonId: LID, completedAt: null, lastWatchedSeconds: 10 }]);
    const { repo, db } = repoWith({ [`enrollments/${ID}`]: seed });
    const out = await repo.setLastWatchedSeconds(UID, CID, LID, 25);
    expect(out).toEqual({ lastWatchedSeconds: 25 });
    expect((db.__store.get(`enrollments/${ID}`) as Enrollment).progress[0].lastWatchedSeconds).toBe(25);
  });

  it('preserves completedAt when bumping lastWatchedSeconds', async () => {
    const seed = activeWith([{ lessonId: LID, completedAt: '2026-05-20T00:00:00.000Z' as ISODateString, lastWatchedSeconds: 0 }]);
    const { repo, db } = repoWith({ [`enrollments/${ID}`]: seed });
    await repo.setLastWatchedSeconds(UID, CID, LID, 60);
    const row = (db.__store.get(`enrollments/${ID}`) as Enrollment).progress[0];
    expect(row.completedAt).toBe('2026-05-20T00:00:00.000Z');
    expect(row.lastWatchedSeconds).toBe(60);
  });

  it('is a no-op (returns stored value) when inbound equals stored', async () => {
    const seed = activeWith([{ lessonId: LID, completedAt: null, lastWatchedSeconds: 30 }]);
    const stamp = seed.updatedAt;
    const { repo, db } = repoWith({ [`enrollments/${ID}`]: seed });
    const out = await repo.setLastWatchedSeconds(UID, CID, LID, 30);
    expect(out).toEqual({ lastWatchedSeconds: 30 });
    expect((db.__store.get(`enrollments/${ID}`) as Enrollment).updatedAt).toBe(stamp);
  });

  it('is a no-op (returns stored value) when inbound is smaller (monotonic regression)', async () => {
    const seed = activeWith([{ lessonId: LID, completedAt: null, lastWatchedSeconds: 100 }]);
    const stamp = seed.updatedAt;
    const { repo, db } = repoWith({ [`enrollments/${ID}`]: seed });
    const out = await repo.setLastWatchedSeconds(UID, CID, LID, 50);
    expect(out).toEqual({ lastWatchedSeconds: 100 });
    expect((db.__store.get(`enrollments/${ID}`) as Enrollment).updatedAt).toBe(stamp);
  });

  it('throws NotEnrolledException when WITHDRAWN', async () => {
    const seed = activeWith();
    seed.status = 'WITHDRAWN';
    seed.withdrawnAt = '2026-05-20T00:00:00.000Z' as ISODateString;
    const { repo } = repoWith({ [`enrollments/${ID}`]: seed });
    await expect(repo.setLastWatchedSeconds(UID, CID, LID, 10)).rejects.toBeInstanceOf(NotEnrolledException);
  });

  it('throws NotEnrolledException when no enrolment exists', async () => {
    const { repo } = repoWith({});
    await expect(repo.setLastWatchedSeconds(UID, CID, LID, 10)).rejects.toBeInstanceOf(NotEnrolledException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses --testFile=enrollment.repository.spec.ts`
Expected: FAIL — `repo.setLastWatchedSeconds is not a function`.

- [ ] **Step 3: Implement the method**

Append after `touchLastAccessed` in `libs/api-courses/src/lib/enrollment/enrollment.repository.ts`:

```ts
  async setLastWatchedSeconds(
    userId: UserId,
    courseId: CourseId,
    lessonId: LessonId,
    seconds: number,
  ): Promise<{ lastWatchedSeconds: number }> {
    const enrollmentRef = this.db.collection(ENROLLMENTS).doc(enrollmentId(userId, courseId));

    return this.db.runTransaction(async (t) => {
      const snap = await t.get(enrollmentRef);
      const existing = snap.exists ? (snap.data() as Enrollment) : null;
      if (!existing || existing.status !== 'ACTIVE') {
        throw new NotEnrolledException();
      }

      const progress = [...(existing.progress ?? [])];
      const idx = progress.findIndex((p) => p.lessonId === lessonId);
      const existingRow = idx >= 0 ? progress[idx] : undefined;

      if (existingRow && existingRow.lastWatchedSeconds >= seconds) {
        // Equal value (idempotent) or monotonic regression — drop the write.
        return { lastWatchedSeconds: existingRow.lastWatchedSeconds };
      }

      if (existingRow) {
        progress[idx] = { ...existingRow, lastWatchedSeconds: seconds };
      } else {
        progress.push({ lessonId, completedAt: null, lastWatchedSeconds: seconds });
      }

      const now = nowIso();
      t.update(enrollmentRef, { progress, updatedAt: now });
      return { lastWatchedSeconds: seconds };
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-courses --testFile=enrollment.repository.spec.ts`
Expected: PASS for the new describe block; existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/enrollment/enrollment.repository.ts \
        libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts
git commit -m "feat(api-courses): EnrollmentRepository.setLastWatchedSeconds (idempotent + monotonic)"
```

---

## Task 5: Seed new fields on `enroll` and preserve them on re-enrol

**Files:**
- Modify: `libs/api-courses/src/lib/enrollment/enrollment.repository.ts`
- Modify: `libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts`:

```ts
describe('EnrollmentRepository.enroll (Slice C fields)', () => {
  it('seeds lastAccessedLessonId=null and lastAccessedAt=null on first enrol', async () => {
    const { repo } = repoWith({ [`courses/${CID}`]: course() });
    const result = await repo.enroll(UID, CID);
    expect(result.lastAccessedLessonId).toBeNull();
    expect(result.lastAccessedAt).toBeNull();
  });

  it('preserves lastAccessedLessonId and lastAccessedAt across WITHDRAWN -> ACTIVE re-enrol', async () => {
    const withdrawn: Enrollment = {
      id: ID,
      userId: UID,
      courseId: CID,
      status: 'WITHDRAWN',
      progress: [{ lessonId: 'l1' as LessonId, completedAt: null, lastWatchedSeconds: 42 }],
      withdrawnAt: '2026-02-01T00:00:00.000Z' as ISODateString,
      lastAccessedLessonId: 'l1' as LessonId,
      lastAccessedAt: '2026-02-01T00:00:00.000Z' as ISODateString,
      createdAt: '2026-01-01T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-02-01T00:00:00.000Z' as ISODateString,
    };
    const { repo } = repoWith({
      [`courses/${CID}`]: course({ enrollmentCount: 0 }),
      [`enrollments/${ID}`]: withdrawn,
    });
    const result = await repo.enroll(UID, CID);
    expect(result.status).toBe('ACTIVE');
    expect(result.lastAccessedLessonId).toBe('l1');
    expect(result.lastAccessedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(result.progress[0].lastWatchedSeconds).toBe(42);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses --testFile=enrollment.repository.spec.ts`
Expected: FAIL — the first-enrol assertion fails because the constructed literal in `enroll` is missing the two new fields, producing `undefined` not `null`. The TypeScript compile may also flag the literal as missing properties.

- [ ] **Step 3: Update the `enroll` method's created-literal**

In `libs/api-courses/src/lib/enrollment/enrollment.repository.ts`, locate the `const created: Enrollment = { ... }` literal inside `enroll` (around line 107) and add the two fields:

```ts
      const created: Enrollment = {
        id: enrollmentId(userId, courseId),
        userId,
        courseId,
        status: 'ACTIVE',
        progress: [],
        withdrawnAt: null,
        lastAccessedLessonId: null,
        lastAccessedAt: null,
        createdAt: now,
        updatedAt: now,
      };
```

The WITHDRAWN→ACTIVE branch (the `restored` block above) does not need changes — it spreads `...existing` and only overrides `status`, `withdrawnAt`, `updatedAt`. The two new fields ride along automatically.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-courses --testFile=enrollment.repository.spec.ts`
Expected: PASS for the new describe block; all prior tests still pass.

- [ ] **Step 5: Verify no other callers broke**

Run: `pnpm nx run-many -t typecheck -p api-courses`
Expected: PASS. If a typecheck error remains in `enrollment.service.ts` or anywhere else due to literal construction of `Enrollment`, fix by adding the two `null` fields.

- [ ] **Step 6: Commit**

```bash
git add libs/api-courses/src/lib/enrollment/enrollment.repository.ts \
        libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts
git commit -m "feat(api-courses): seed lastAccessed fields on enroll; preserve on re-enrol"
```

---

## Task 6: `LearnService.getLessonView` side-effect (touch lastAccessed) + propagate `lastWatchedSeconds`

**Files:**
- Modify: `libs/api-courses/src/lib/learn/learn.service.ts`
- Modify: `libs/api-courses/src/lib/learn/learn.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `libs/api-courses/src/lib/learn/learn.service.spec.ts`:

```ts
describe('LearnService.getLessonView (Slice C — lastAccessed touch + lastWatchedSeconds)', () => {
  it('calls touchLastAccessed exactly once for an enrolled student', async () => {
    const touchSpy = vi.fn(async () => undefined);
    const service = makeService({
      enrollment: {
        ...makeEnrollmentRepoStub({ enrollment: makeEnrollment({ progress: [{ lessonId: LESSON.id, completedAt: null, lastWatchedSeconds: 0 }] }) }),
        touchLastAccessed: touchSpy,
      },
    });
    await service.getLessonView(STUDENT_UID, COURSE, LESSON);
    expect(touchSpy).toHaveBeenCalledTimes(1);
    expect(touchSpy).toHaveBeenCalledWith(STUDENT_UID, COURSE.id, LESSON.id, expect.any(String));
  });

  it('does NOT call touchLastAccessed for the course owner', async () => {
    const touchSpy = vi.fn(async () => undefined);
    const service = makeService({
      enrollment: { ...makeEnrollmentRepoStub({ enrollment: null }), touchLastAccessed: touchSpy },
    });
    await service.getLessonView(OWNER_UID, COURSE, LESSON);
    expect(touchSpy).not.toHaveBeenCalled();
  });

  it('returns the view even when touchLastAccessed throws (best-effort)', async () => {
    const touchSpy = vi.fn(async () => { throw new Error('boom'); });
    const service = makeService({
      enrollment: { ...makeEnrollmentRepoStub({ enrollment: makeEnrollment({ progress: [] }) }), touchLastAccessed: touchSpy },
    });
    const view = await service.getLessonView(STUDENT_UID, COURSE, LESSON);
    expect(view.course.id).toBe(COURSE.id);
    expect(touchSpy).toHaveBeenCalledTimes(1);
  });

  it('propagates lastWatchedSeconds from the matching LessonProgress row', async () => {
    const service = makeService({
      enrollment: {
        ...makeEnrollmentRepoStub({ enrollment: makeEnrollment({ progress: [{ lessonId: LESSON.id, completedAt: null, lastWatchedSeconds: 87 }] }) }),
        touchLastAccessed: vi.fn(async () => undefined),
      },
    });
    const view = await service.getLessonView(STUDENT_UID, COURSE, LESSON);
    expect(view.progress).toEqual({ completedAt: null, lastWatchedSeconds: 87 });
  });

  it('defaults lastWatchedSeconds to 0 when no LessonProgress row exists yet', async () => {
    const service = makeService({
      enrollment: {
        ...makeEnrollmentRepoStub({ enrollment: makeEnrollment({ progress: [] }) }),
        touchLastAccessed: vi.fn(async () => undefined),
      },
    });
    const view = await service.getLessonView(STUDENT_UID, COURSE, LESSON);
    expect(view.progress).toEqual({ completedAt: null, lastWatchedSeconds: 0 });
  });
});
```

You will need to add the `touchLastAccessed` method to the existing `makeEnrollmentRepoStub` helper at the top of the spec file (or wherever the stub is defined) so it always exists in the stubbed surface. Default it to `vi.fn(async () => undefined)`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test api-courses --testFile=learn.service.spec.ts`
Expected: FAIL — the touch-spy assertions fail because the service doesn't call it; the `lastWatchedSeconds` assertions fail because the service doesn't include it in the returned `progress`.

- [ ] **Step 3: Update `LearnService`**

Replace `libs/api-courses/src/lib/learn/learn.service.ts` with:

```ts
import { Injectable, Logger } from '@nestjs/common';

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
  private readonly logger = new Logger('LearnService');

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

    if (progress !== null) {
      // Enrolled student path only — best-effort touch. Owners (progress === null) skip.
      try {
        await this.enrollment.touchLastAccessed(
          userId,
          course.id,
          lesson.id,
          new Date().toISOString() as ISODateString,
        );
      } catch (err) {
        this.logger.warn(
          `touchLastAccessed failed for user=${userId} course=${course.id} lesson=${lesson.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      course: { id: course.id, title: course.title, status: course.status },
      lesson: {
        id: lesson.id,
        moduleId: lesson.moduleId,
        title: lesson.title,
        description: lesson.description,
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

  async savePosition(
    userId: UserId,
    course: Course,
    lesson: Lesson,
    seconds: number,
  ): Promise<{ lastWatchedSeconds: number }> {
    return this.enrollment.setLastWatchedSeconds(userId, course.id, lesson.id, seconds);
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
    return {
      completedAt: row?.completedAt ?? null,
      lastWatchedSeconds: row?.lastWatchedSeconds ?? 0,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test api-courses --testFile=learn.service.spec.ts`
Expected: PASS — including all prior Slice A / Slice B tests in this file.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/learn/learn.service.ts \
        libs/api-courses/src/lib/learn/learn.service.spec.ts
git commit -m "feat(api-courses): LearnService side-effect touchLastAccessed; expose lastWatchedSeconds; add savePosition"
```

---

## Task 7: `POST /api/learn/courses/:cid/lessons/:lid/position` controller route

**Files:**
- Modify: `libs/api-courses/src/lib/learn/learn.controller.ts`
- Modify: `libs/api-courses/src/lib/learn/learn.controller.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `libs/api-courses/src/lib/learn/learn.controller.spec.ts` (mirroring the shape of the existing `markComplete` controller tests; reuse helpers already defined):

```ts
describe('LearnController.savePosition', () => {
  it('returns 200 with the stored value on a valid POST', async () => {
    const service = makeServiceStub({
      savePosition: vi.fn(async () => ({ lastWatchedSeconds: 42 })),
    });
    const controller = new LearnController(service);
    const req = makeReq({ course: COURSE, lesson: LESSON, user: STUDENT });
    const result = await controller.savePosition(req, { seconds: 42 });
    expect(result).toEqual({ lastWatchedSeconds: 42 });
    expect(service.savePosition).toHaveBeenCalledWith(STUDENT.uid, COURSE, LESSON, 42);
  });

  it('throws InvalidPositionException when seconds is missing', async () => {
    const controller = new LearnController(makeServiceStub({}));
    const req = makeReq({ course: COURSE, lesson: LESSON, user: STUDENT });
    await expect(controller.savePosition(req, {} as never)).rejects.toBeInstanceOf(InvalidPositionException);
  });

  it('throws InvalidPositionException when seconds is negative', async () => {
    const controller = new LearnController(makeServiceStub({}));
    const req = makeReq({ course: COURSE, lesson: LESSON, user: STUDENT });
    await expect(controller.savePosition(req, { seconds: -1 })).rejects.toBeInstanceOf(InvalidPositionException);
  });

  it('throws InvalidPositionException when seconds is NaN', async () => {
    const controller = new LearnController(makeServiceStub({}));
    const req = makeReq({ course: COURSE, lesson: LESSON, user: STUDENT });
    await expect(controller.savePosition(req, { seconds: Number.NaN })).rejects.toBeInstanceOf(InvalidPositionException);
  });

  it('throws InvalidPositionException when seconds is Infinity', async () => {
    const controller = new LearnController(makeServiceStub({}));
    const req = makeReq({ course: COURSE, lesson: LESSON, user: STUDENT });
    await expect(controller.savePosition(req, { seconds: Number.POSITIVE_INFINITY })).rejects.toBeInstanceOf(InvalidPositionException);
  });

  it('throws InvalidPositionException when seconds is not a number', async () => {
    const controller = new LearnController(makeServiceStub({}));
    const req = makeReq({ course: COURSE, lesson: LESSON, user: STUDENT });
    await expect(controller.savePosition(req, { seconds: '42' as unknown as number })).rejects.toBeInstanceOf(InvalidPositionException);
  });
});
```

Make sure the imports at the top of the spec include `InvalidPositionException`. If the existing test file does not have a `makeServiceStub` / `makeReq` helper, model the new tests after the existing `markComplete` tests in the same file — they already cover this shape.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test api-courses --testFile=learn.controller.spec.ts`
Expected: FAIL — `controller.savePosition is not a function`.

- [ ] **Step 3: Add the route**

In `libs/api-courses/src/lib/learn/learn.controller.ts`, add the import:

```ts
import { InvalidPositionException } from './errors/learn.exception';
```

Then append a new method to the class (after `markComplete`):

```ts
  @Post('courses/:cid/lessons/:lid/position')
  @HttpCode(200)
  @UseGuards(LessonEnrollmentGuard)
  async savePosition(
    @Req() req: LessonScopedRequest,
    @Body() body: { seconds?: unknown },
  ): Promise<{ lastWatchedSeconds: number }> {
    if (!req.course || !req.lesson || !req.user) {
      throw new Error('LearnController: guard did not attach course/lesson/user');
    }
    const seconds = body?.seconds;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
      throw new InvalidPositionException();
    }
    return this.service.savePosition(req.user.uid as UserId, req.course, req.lesson, seconds);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test api-courses --testFile=learn.controller.spec.ts`
Expected: PASS for all new tests; existing tests still pass.

- [ ] **Step 5: Verify the exception filter routes `INVALID_POSITION` correctly**

Run: `pnpm nx test api-courses --testFile=learn.exception-filter.spec.ts`
Expected: PASS. (No code change needed — `LearnExceptionFilter` already maps any `LearnException` by its `code` / `status`.) If a test in that file enumerates known codes, add `INVALID_POSITION` to the enumeration.

- [ ] **Step 6: Commit**

```bash
git add libs/api-courses/src/lib/learn/learn.controller.ts \
        libs/api-courses/src/lib/learn/learn.controller.spec.ts
git commit -m "feat(api-courses): POST /learn/.../position endpoint for EP-06 Slice C"
```

---

## Task 8: Web `LearnService.savePosition` HTTP wrapper

**Files:**
- Modify: `libs/web-learn/src/lib/learn.service.ts`
- Modify: `libs/web-learn/src/lib/learn.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `libs/web-learn/src/lib/learn.service.spec.ts` (mirroring the existing `markLessonComplete` test pattern):

```ts
describe('LearnService.savePosition', () => {
  it('POSTs to /api/learn/courses/:cid/lessons/:lid/position with body {seconds} and returns the parsed payload', async () => {
    TestBed.configureTestingModule({
      providers: [LearnService, provideHttpClient(), provideHttpClientTesting()],
    });
    const svc = TestBed.inject(LearnService);
    const ctrl = TestBed.inject(HttpTestingController);

    const promise = svc.savePosition('c1', 'l1', 42);
    const req = ctrl.expectOne('/api/learn/courses/c1/lessons/l1/position');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ seconds: 42 });
    req.flush({ lastWatchedSeconds: 42 });

    await expect(promise).resolves.toEqual({ lastWatchedSeconds: 42 });
    ctrl.verify();
  });

  it('rethrows HttpErrorResponse on 403 so callers can branch on status', async () => {
    TestBed.configureTestingModule({
      providers: [LearnService, provideHttpClient(), provideHttpClientTesting()],
    });
    const svc = TestBed.inject(LearnService);
    const ctrl = TestBed.inject(HttpTestingController);

    const promise = svc.savePosition('c1', 'l1', 1);
    const req = ctrl.expectOne('/api/learn/courses/c1/lessons/l1/position');
    req.flush(
      { error: { code: 'NOT_ENROLLED_LESSON', message: 'no' } },
      { status: 403, statusText: 'Forbidden' },
    );

    await expect(promise).rejects.toBeInstanceOf(HttpErrorResponse);
  });
});
```

Ensure the imports at the top of the spec include `HttpErrorResponse`, `provideHttpClient`, `provideHttpClientTesting`, `HttpTestingController`, and `TestBed`. Reuse whatever pattern the existing `markLessonComplete` test in this file already uses.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-learn --testFile=learn.service.spec.ts`
Expected: FAIL — `svc.savePosition is not a function`.

- [ ] **Step 3: Add the method**

In `libs/web-learn/src/lib/learn.service.ts`, append a new method to the `LearnService` class:

```ts
  savePosition(
    courseId: string,
    lessonId: string,
    seconds: number,
  ): Promise<{ lastWatchedSeconds: number }> {
    return firstValueFrom(
      this.http.post<{ lastWatchedSeconds: number }>(
        `/api/learn/courses/${courseId}/lessons/${lessonId}/position`,
        { seconds },
        { withCredentials: true },
      ),
    );
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test web-learn --testFile=learn.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-learn/src/lib/learn.service.ts \
        libs/web-learn/src/lib/learn.service.spec.ts
git commit -m "feat(web-learn): add LearnService.savePosition HTTP wrapper"
```

---

## Task 9: Extend `VideoPlayerComponent` with player events and time accessors

**Files:**
- Modify: `libs/web-video/src/lib/player/video-player.component.ts`
- Modify: `libs/web-video/src/lib/player/video-player.component.html` (if needed for binding)
- Create: `libs/web-video/src/lib/player/video-player.component.spec.ts` (new file — does not yet exist; verify with `ls` and create if absent)

- [ ] **Step 1: Verify whether a spec exists**

Run: `ls libs/web-video/src/lib/player/`
Expected output includes `video-player.component.ts` and `video-player.service.ts`. Note whether a `.spec.ts` exists for the component.

- [ ] **Step 2: Write the failing tests**

Create or extend `libs/web-video/src/lib/player/video-player.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { describe, expect, it, vi } from 'vitest';
import { VideoPlayerComponent } from './video-player.component';
import { VideoPlayerService } from './video-player.service';
import type { VideoId } from '@learnwren/shared-data-models';

function harness(): { fixture: ComponentFixture<VideoPlayerComponent>; el: HTMLVideoElement } {
  const playerSvcStub = { attach: vi.fn(() => ({ dispose: vi.fn() })) };
  TestBed.configureTestingModule({
    imports: [VideoPlayerComponent],
    providers: [
      provideHttpClient(),
      { provide: VideoPlayerService, useValue: playerSvcStub },
    ],
  });
  const fixture = TestBed.createComponent(VideoPlayerComponent);
  fixture.componentRef.setInput('videoId', 'vid-1' as VideoId);
  fixture.detectChanges();
  const el = fixture.componentInstance.playerEl.nativeElement;
  return { fixture, el };
}

describe('VideoPlayerComponent — Slice C event surface', () => {
  it('emits (metadata) on loadedmetadata', () => {
    const { fixture, el } = harness();
    const spy = vi.fn();
    fixture.componentInstance.metadata.subscribe(spy);
    el.dispatchEvent(new Event('loadedmetadata'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('emits (played) on play', () => {
    const { fixture, el } = harness();
    const spy = vi.fn();
    fixture.componentInstance.played.subscribe(spy);
    el.dispatchEvent(new Event('play'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('emits (paused) on pause', () => {
    const { fixture, el } = harness();
    const spy = vi.fn();
    fixture.componentInstance.paused.subscribe(spy);
    el.dispatchEvent(new Event('pause'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('emits (ended) on ended', () => {
    const { fixture, el } = harness();
    const spy = vi.fn();
    fixture.componentInstance.ended.subscribe(spy);
    el.dispatchEvent(new Event('ended'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('currentTime() proxies the underlying element', () => {
    const { fixture, el } = harness();
    Object.defineProperty(el, 'currentTime', { value: 17, configurable: true, writable: true });
    expect(fixture.componentInstance.currentTime()).toBe(17);
  });

  it('seekTo(s) sets the underlying element currentTime', () => {
    const { fixture, el } = harness();
    let stored = 0;
    Object.defineProperty(el, 'currentTime', {
      get: () => stored,
      set: (v) => { stored = v; },
      configurable: true,
    });
    fixture.componentInstance.seekTo(33);
    expect(stored).toBe(33);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm nx test web-video --testFile=video-player.component.spec.ts`
Expected: FAIL — events `metadata`, `played`, `paused`, `ended` do not exist on the component; `currentTime`/`seekTo` not defined.

- [ ] **Step 4: Extend the component**

Replace `libs/web-video/src/lib/player/video-player.component.ts` with:

```ts
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  Output,
  ViewChild,
  inject,
  input,
  signal,
} from '@angular/core';

import type { VideoId } from '@learnwren/shared-data-models';

import { LwButtonDirective } from '@learnwren/web-ui';
import { VideoPlayerService, type PlayerHandle } from './video-player.service';

@Component({
  selector: 'lib-video-player',
  standalone: true,
  imports: [LwButtonDirective],
  templateUrl: './video-player.component.html',
})
export class VideoPlayerComponent implements AfterViewInit, OnDestroy {
  readonly videoId = input.required<VideoId>();

  @ViewChild('playerEl', { static: true })
  playerEl!: ElementRef<HTMLVideoElement>;

  /** Native <video> event proxies. Consumers may ignore all of them. */
  @Output() readonly metadata = new EventEmitter<void>();
  @Output() readonly played = new EventEmitter<void>();
  @Output() readonly paused = new EventEmitter<void>();
  @Output() readonly ended = new EventEmitter<void>();

  readonly error = signal<string | null>(null);
  private handle: PlayerHandle | null = null;
  private readonly playerSvc = inject(VideoPlayerService);
  private listenersAttached = false;
  private readonly onMetadata = (): void => this.metadata.emit();
  private readonly onPlay = (): void => this.played.emit();
  private readonly onPause = (): void => this.paused.emit();
  private readonly onEnded = (): void => this.ended.emit();

  ngAfterViewInit(): void {
    this.attachListeners();
    this.mount();
  }

  ngOnDestroy(): void {
    this.detachListeners();
    this.handle?.dispose();
    this.handle = null;
  }

  retry(): void {
    this.handle?.dispose();
    this.handle = null;
    this.error.set(null);
    this.mount();
  }

  currentTime(): number {
    return this.playerEl.nativeElement.currentTime;
  }

  seekTo(seconds: number): void {
    this.playerEl.nativeElement.currentTime = seconds;
  }

  private mount(): void {
    const url = `/api/playback/manifest/${this.videoId()}`;
    this.handle = this.playerSvc.attach(this.playerEl.nativeElement, url, {
      onFatalError: (message: string) => this.error.set(message),
    });
  }

  private attachListeners(): void {
    if (this.listenersAttached) return;
    const el = this.playerEl.nativeElement;
    el.addEventListener('loadedmetadata', this.onMetadata);
    el.addEventListener('play', this.onPlay);
    el.addEventListener('pause', this.onPause);
    el.addEventListener('ended', this.onEnded);
    this.listenersAttached = true;
  }

  private detachListeners(): void {
    if (!this.listenersAttached) return;
    const el = this.playerEl.nativeElement;
    el.removeEventListener('loadedmetadata', this.onMetadata);
    el.removeEventListener('play', this.onPlay);
    el.removeEventListener('pause', this.onPause);
    el.removeEventListener('ended', this.onEnded);
    this.listenersAttached = false;
  }
}
```

The HTML template (`video-player.component.html`) does not need changes — `@Output()` decorators expose events to parent bindings via the standard `(eventName)="..."` syntax without template wiring.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm nx test web-video --testFile=video-player.component.spec.ts`
Expected: PASS.

- [ ] **Step 6: Verify no existing consumer broke**

Run: `pnpm nx run-many -t test -p web-video,web-learn,web-courses`
Expected: PASS — existing `web-courses` usage of `VideoPlayerComponent` ignores the new outputs.

- [ ] **Step 7: Commit**

```bash
git add libs/web-video/src/lib/player/video-player.component.ts \
        libs/web-video/src/lib/player/video-player.component.spec.ts
git commit -m "feat(web-video): expose loadedmetadata/play/pause/ended events and currentTime/seekTo on VideoPlayerComponent"
```

---

## Task 10: `PositionSaver` helper class (TDD)

**Files:**
- Create: `libs/web-learn/src/lib/position-saver.ts`
- Create: `libs/web-learn/src/lib/position-saver.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `libs/web-learn/src/lib/position-saver.spec.ts`:

```ts
import { HttpErrorResponse } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LearnService } from './learn.service';
import { PositionSaver } from './position-saver';

function makeSaver(opts: {
  onRevoked?: () => void;
  savePosition?: (cid: string, lid: string, s: number) => Promise<{ lastWatchedSeconds: number }>;
} = {}): { saver: PositionSaver; service: { savePosition: ReturnType<typeof vi.fn> }; onRevoked: ReturnType<typeof vi.fn> } {
  const onRevoked = vi.fn(opts.onRevoked ?? (() => undefined));
  const savePosition = vi.fn(opts.savePosition ?? (async () => ({ lastWatchedSeconds: 0 })));
  const service = { savePosition } as unknown as LearnService;
  const saver = new PositionSaver({
    learn: service,
    courseId: 'c1',
    lessonId: 'l1',
    onRevoked,
    intervalMs: 100,
  });
  return { saver, service: service as never as { savePosition: ReturnType<typeof vi.fn> }, onRevoked };
}

describe('PositionSaver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('does nothing until start() is called', () => {
    const { service } = makeSaver();
    vi.advanceTimersByTime(500);
    expect(service.savePosition).not.toHaveBeenCalled();
  });

  it('after start() it POSTs current time on each interval tick', async () => {
    const time = { v: 5 };
    const { saver, service } = makeSaver({ savePosition: async (_c, _l, s) => ({ lastWatchedSeconds: s }) });
    saver.start(() => time.v);

    await vi.advanceTimersByTimeAsync(100);
    expect(service.savePosition).toHaveBeenCalledWith('c1', 'l1', 5);

    time.v = 12;
    await vi.advanceTimersByTimeAsync(100);
    expect(service.savePosition).toHaveBeenLastCalledWith('c1', 'l1', 12);
  });

  it('dedupes equal integer seconds across ticks', async () => {
    const { saver, service } = makeSaver({ savePosition: async (_c, _l, s) => ({ lastWatchedSeconds: s }) });
    saver.start(() => 7.3); // floors to 7
    await vi.advanceTimersByTimeAsync(100);
    expect(service.savePosition).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(service.savePosition).toHaveBeenCalledTimes(1); // dedup
  });

  it('clamps negative time to 0', async () => {
    const { saver, service } = makeSaver({ savePosition: async (_c, _l, s) => ({ lastWatchedSeconds: s }) });
    saver.start(() => -3);
    await vi.advanceTimersByTimeAsync(100);
    expect(service.savePosition).toHaveBeenCalledWith('c1', 'l1', 0);
  });

  it('on 403 it stops the timer and invokes onRevoked', async () => {
    const err = new HttpErrorResponse({ status: 403, statusText: 'Forbidden' });
    const { saver, service, onRevoked } = makeSaver({ savePosition: async () => { throw err; } });
    saver.start(() => 10);
    await vi.advanceTimersByTimeAsync(100);
    expect(onRevoked).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(service.savePosition).toHaveBeenCalledTimes(1); // no further ticks
  });

  it('on a non-403 error it leaves lastSent unchanged so the next tick retries with the same value', async () => {
    let calls = 0;
    const { saver, service } = makeSaver({
      savePosition: async (_c, _l, _s) => {
        calls++;
        if (calls === 1) throw new HttpErrorResponse({ status: 500, statusText: 'fail' });
        return { lastWatchedSeconds: _s };
      },
    });
    saver.start(() => 9);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);
    expect(service.savePosition).toHaveBeenCalledTimes(2);
    expect(service.savePosition).toHaveBeenNthCalledWith(2, 'c1', 'l1', 9);
  });

  it('flush() forces an immediate save outside the interval', async () => {
    const { saver, service } = makeSaver({ savePosition: async (_c, _l, s) => ({ lastWatchedSeconds: s }) });
    saver.start(() => 4);
    await saver.flush();
    expect(service.savePosition).toHaveBeenCalledWith('c1', 'l1', 4);
  });

  it('stop() cancels further ticks', async () => {
    const { saver, service } = makeSaver({ savePosition: async (_c, _l, s) => ({ lastWatchedSeconds: s }) });
    saver.start(() => 1);
    saver.stop();
    await vi.advanceTimersByTimeAsync(500);
    expect(service.savePosition).not.toHaveBeenCalled();
  });

  it('flushBeacon uses navigator.sendBeacon when available and updates lastSent on success', () => {
    const beacon = vi.fn(() => true);
    Object.defineProperty(globalThis, 'navigator', {
      value: { sendBeacon: beacon },
      configurable: true,
    });
    const { saver } = makeSaver();
    saver.start(() => 50);
    saver.flushBeacon();
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, blob] = beacon.mock.calls[0];
    expect(url).toBe('/api/learn/courses/c1/lessons/l1/position');
    expect(blob).toBeInstanceOf(Blob);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test web-learn --testFile=position-saver.spec.ts`
Expected: FAIL — `Cannot find module './position-saver'`.

- [ ] **Step 3: Implement `PositionSaver`**

Create `libs/web-learn/src/lib/position-saver.ts`:

```ts
import { HttpErrorResponse } from '@angular/common/http';

import type { LearnService } from './learn.service';

export interface PositionSaverOptions {
  learn: LearnService;
  courseId: string;
  lessonId: string;
  onRevoked: () => void;
  /** Defaults to 15_000 ms. Override for tests. */
  intervalMs?: number;
}

export class PositionSaver {
  private readonly learn: LearnService;
  private readonly courseId: string;
  private readonly lessonId: string;
  private readonly onRevoked: () => void;
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSent: number | null = null;
  private getTime: (() => number) | null = null;

  constructor(opts: PositionSaverOptions) {
    this.learn = opts.learn;
    this.courseId = opts.courseId;
    this.lessonId = opts.lessonId;
    this.onRevoked = opts.onRevoked;
    this.intervalMs = opts.intervalMs ?? 15_000;
  }

  start(getCurrentTime: () => number): void {
    this.getTime = getCurrentTime;
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), this.intervalMs);
  }

  async flush(): Promise<void> {
    if (!this.getTime) return;
    const seconds = Math.max(0, Math.floor(this.getTime()));
    if (this.lastSent === seconds) return;
    try {
      const out = await this.learn.savePosition(this.courseId, this.lessonId, seconds);
      this.lastSent = out.lastWatchedSeconds;
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 403) {
        this.stop();
        this.onRevoked();
      }
      // Other 4xx/5xx: leave lastSent unchanged so the next tick retries.
    }
  }

  flushBeacon = (): void => {
    if (!this.getTime || typeof navigator === 'undefined') return;
    const seconds = Math.max(0, Math.floor(this.getTime()));
    if (this.lastSent === seconds) return;
    const url = `/api/learn/courses/${encodeURIComponent(this.courseId)}/lessons/${encodeURIComponent(this.lessonId)}/position`;
    const body = JSON.stringify({ seconds });
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon(url, blob);
      if (ok) this.lastSent = seconds;
      return;
    }
    void fetch(url, {
      method: 'POST',
      body,
      keepalive: true,
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
    }).then(() => { this.lastSent = seconds; }).catch(() => undefined);
  };

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.getTime = null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test web-learn --testFile=position-saver.spec.ts`
Expected: PASS for all 9 tests.

- [ ] **Step 5: Commit**

```bash
git add libs/web-learn/src/lib/position-saver.ts \
        libs/web-learn/src/lib/position-saver.spec.ts
git commit -m "feat(web-learn): PositionSaver with throttled saves, monotonic dedupe, and sendBeacon flush"
```

---

## Task 11: Wire resume-seek and `PositionSaver` into `LessonPlayerPageComponent`

**Files:**
- Modify: `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts`
- Modify: `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.html`
- Modify: `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.spec.ts` (model them on the existing patterns; the spec file already has a `configure(...)` + `create()` harness — reuse it):

```ts
describe('LessonPlayerPageComponent — resume on metadata', () => {
  it('seeks to the saved lastWatchedSeconds when 0 < saved < duration - 5', async () => {
    const view = makeView({ lesson: { ...defaultLesson, videoState: 'READY' } }, { completedAt: null, lastWatchedSeconds: 30 });
    configure({ getLessonView: async () => view });
    const fixture = create();
    await fixture.whenStable();
    const seek = vi.spyOn(fixture.componentInstance, 'seekVideoTo' as never);

    fixture.componentInstance.onMetadata(60);
    expect(seek).toHaveBeenCalledWith(30);
  });

  it('clamps to duration - 5 when saved is within 5 s of the end', async () => {
    const view = makeView({ lesson: { ...defaultLesson, videoState: 'READY' } }, { completedAt: null, lastWatchedSeconds: 58 });
    configure({ getLessonView: async () => view });
    const fixture = create();
    await fixture.whenStable();
    const seek = vi.spyOn(fixture.componentInstance, 'seekVideoTo' as never);

    fixture.componentInstance.onMetadata(60);
    expect(seek).toHaveBeenCalledWith(55);
  });

  it('resets to 0 when saved >= duration (UC-06-03 ext 5b)', async () => {
    const view = makeView({ lesson: { ...defaultLesson, videoState: 'READY' } }, { completedAt: null, lastWatchedSeconds: 120 });
    configure({ getLessonView: async () => view });
    const fixture = create();
    await fixture.whenStable();
    const seek = vi.spyOn(fixture.componentInstance, 'seekVideoTo' as never);

    fixture.componentInstance.onMetadata(60);
    expect(seek).toHaveBeenCalledWith(0);
  });

  it('does not seek when saved is 0', async () => {
    const view = makeView({ lesson: { ...defaultLesson, videoState: 'READY' } }, { completedAt: null, lastWatchedSeconds: 0 });
    configure({ getLessonView: async () => view });
    const fixture = create();
    await fixture.whenStable();
    const seek = vi.spyOn(fixture.componentInstance, 'seekVideoTo' as never);

    fixture.componentInstance.onMetadata(60);
    expect(seek).not.toHaveBeenCalled();
  });

  it('does not seek in owner-preview mode', async () => {
    const view = makeView({ lesson: { ...defaultLesson, videoState: 'READY' } }, null);
    configure({ getLessonView: async () => view });
    const fixture = create();
    await fixture.whenStable();
    const seek = vi.spyOn(fixture.componentInstance, 'seekVideoTo' as never);

    fixture.componentInstance.onMetadata(60);
    expect(seek).not.toHaveBeenCalled();
  });
});

describe('LessonPlayerPageComponent — position saver wiring', () => {
  it('does not start the saver in owner-preview mode', async () => {
    const view = makeView({ lesson: { ...defaultLesson, videoState: 'READY' } }, null);
    const savePosition = vi.fn(async () => ({ lastWatchedSeconds: 0 }));
    configure({ getLessonView: async () => view, savePosition });
    const fixture = create();
    await fixture.whenStable();
    fixture.componentInstance.onPlayed();
    // PositionSaver intervals would fire here in a non-owner mount; in owner-preview the start() is skipped.
    expect(savePosition).not.toHaveBeenCalled();
  });

  it('switches state to NOT_ENROLLED when the saver reports revocation', async () => {
    const view = makeView({ lesson: { ...defaultLesson, videoState: 'READY' } }, { completedAt: null, lastWatchedSeconds: 0 });
    configure({ getLessonView: async () => view });
    const fixture = create();
    await fixture.whenStable();

    fixture.componentInstance.onSaverRevoked();
    expect(fixture.componentInstance.state()).toBe('NOT_ENROLLED');
  });
});
```

If the existing spec's `configure({...})` helper does not accept a `savePosition` override, extend it now to include `savePosition?: LearnService['savePosition']`. The existing spec already supports this kind of injection — match its convention.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test web-learn --testFile=lesson-player-page.component.spec.ts`
Expected: FAIL — `onMetadata`, `onPlayed`, `onSaverRevoked`, `seekVideoTo` are not defined on the component.

- [ ] **Step 3: Update the component**

Replace `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts` with:

```ts
import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import type { ISODateString, LessonView } from '@learnwren/shared-data-models';
import { VideoPlayerComponent } from '@learnwren/web-video';

import { LearnService } from '../learn.service';
import { PositionSaver } from '../position-saver';

type PageState = 'LOADING' | 'READY' | 'PROCESSING' | 'NOT_ENROLLED' | 'NOT_FOUND' | 'LOAD_ERROR';

@Component({
  selector: 'lib-lesson-player-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, VideoPlayerComponent, DatePipe],
  templateUrl: './lesson-player-page.component.html',
})
export class LessonPlayerPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly learn = inject(LearnService);

  courseId = '';
  lessonId = '';

  @ViewChild(VideoPlayerComponent) private playerRef?: VideoPlayerComponent;

  readonly state = signal<PageState>('LOADING');
  readonly view = signal<LessonView | null>(null);

  readonly completedAt = computed<ISODateString | null>(
    () => this.view()?.progress?.completedAt ?? null,
  );
  readonly lastWatchedSeconds = computed<number>(
    () => this.view()?.progress?.lastWatchedSeconds ?? 0,
  );
  readonly isOwnerPreview = computed<boolean>(() => this.view()?.progress === null);
  readonly markBusy = signal<boolean>(false);
  readonly markError = signal<null | 'revoked' | 'other'>(null);

  private saver: PositionSaver | null = null;
  private hasResumed = false;
  private readonly onPageHide = (): void => this.saver?.flushBeacon();
  private readonly onVisibilityChange = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      this.saver?.flushBeacon();
    }
  };

  async ngOnInit(): Promise<void> {
    const courseId = this.route.snapshot.paramMap.get('courseId');
    const lessonId = this.route.snapshot.paramMap.get('lessonId');
    if (!courseId || !lessonId) {
      this.state.set('NOT_FOUND');
      return;
    }
    this.courseId = courseId;
    this.lessonId = lessonId;
    await this.load();
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.onPageHide);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.onPageHide);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    this.saver?.stop();
    this.saver = null;
  }

  private async load(): Promise<void> {
    this.state.set('LOADING');
    try {
      const view = await this.learn.getLessonView(this.courseId, this.lessonId);
      this.view.set(view);
      const v = view.lesson;
      if (v.videoId && v.videoState === 'READY') {
        this.state.set('READY');
        this.ensureSaver();
      } else {
        this.state.set('PROCESSING');
      }
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 403) { this.state.set('NOT_ENROLLED'); return; }
        if (err.status === 404) { this.state.set('NOT_FOUND'); return; }
      }
      this.state.set('LOAD_ERROR');
    }
  }

  retry(): void { void this.load(); }

  /** Called from the template via (metadata)="onMetadata($event)" — the player emits no payload, so the test passes a duration directly via `playerRef.playerEl`. */
  onMetadata(duration?: number): void {
    if (this.hasResumed || this.isOwnerPreview()) return;
    this.hasResumed = true;
    const d = duration ?? this.playerRef?.playerEl?.nativeElement.duration ?? 0;
    const saved = this.lastWatchedSeconds();
    if (!Number.isFinite(d) || d <= 0 || saved <= 0) return;
    if (saved >= d) {
      this.seekVideoTo(0);
      return;
    }
    this.seekVideoTo(Math.min(saved, Math.max(0, d - 5)));
  }

  onPlayed(): void {
    if (this.isOwnerPreview()) return;
    this.ensureSaver();
    this.saver?.start(() => this.playerRef?.currentTime() ?? 0);
  }

  onPaused(): void { void this.saver?.flush(); }
  onEnded(): void { void this.saver?.flush(); }

  /** Component hook invoked by PositionSaver on a 403 (enrolment revoked mid-session). */
  onSaverRevoked(): void {
    this.state.set('NOT_ENROLLED');
    this.saver?.stop();
    this.saver = null;
  }

  /** Indirection so tests can spy on the seek without needing a real <video>. */
  seekVideoTo(seconds: number): void { this.playerRef?.seekTo(seconds); }

  async onMarkComplete(): Promise<void> {
    this.markBusy.set(true);
    this.markError.set(null);
    try {
      const { completedAt } = await this.learn.markLessonComplete(this.courseId, this.lessonId);
      this.view.update((v) => (v ? { ...v, progress: { completedAt, lastWatchedSeconds: v.progress?.lastWatchedSeconds ?? 0 } } : v));
    } catch (err) {
      const status = err instanceof HttpErrorResponse ? err.status : 0;
      this.markError.set(status === 403 ? 'revoked' : 'other');
    } finally {
      this.markBusy.set(false);
    }
  }

  private ensureSaver(): void {
    if (this.saver || this.isOwnerPreview()) return;
    this.saver = new PositionSaver({
      learn: this.learn,
      courseId: this.courseId,
      lessonId: this.lessonId,
      onRevoked: () => this.onSaverRevoked(),
    });
  }
}
```

- [ ] **Step 4: Wire the player events in the template**

In `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.html`, locate the `<lib-video-player>` element and add the event bindings. The line currently looks something like:

```html
<lib-video-player [videoId]="view()!.lesson.videoId!" />
```

Replace it with:

```html
<lib-video-player
  [videoId]="view()!.lesson.videoId!"
  (metadata)="onMetadata()"
  (played)="onPlayed()"
  (paused)="onPaused()"
  (ended)="onEnded()" />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm nx test web-learn --testFile=lesson-player-page.component.spec.ts`
Expected: PASS for all new resume / saver tests, and all prior Slice A / Slice B tests still pass.

- [ ] **Step 6: Commit**

```bash
git add libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts \
        libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.html \
        libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.spec.ts
git commit -m "feat(web-learn): wire resume-seek and PositionSaver into LessonPlayerPageComponent"
```

---

## Task 12: Catalog course-detail — Continue Learning CTA

**Files:**
- Modify: `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.ts`
- Modify: `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.html`
- Modify: `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.spec.ts`

- [ ] **Step 1: Inspect existing computed signals**

Run: `grep -n "firstLessonHref\|enrollmentStatus\|canStartLearning" libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.ts`
Expected: locate the existing `firstLessonHref`, `canStartLearning`, and `enrollmentStatus` signal/computed declarations. Read the surrounding code so you preserve their semantics.

- [ ] **Step 2: Write the failing tests**

Append to `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.spec.ts`:

```ts
describe('CourseDetailPage — Continue Learning CTA (Slice C)', () => {
  it('shows Continue Learning when enrollment.lastAccessedLessonId resolves to a live lesson', async () => {
    const fixture = await renderWith({
      course: courseWithLessons([['m1', ['l1', 'l2']]]),
      enrollmentStatus: enrolledStatus({ lastAccessedLessonId: 'l2' }),
    });
    const cta = fixture.nativeElement.querySelector('[data-testid="continue-learning"]') as HTMLAnchorElement | null;
    expect(cta).not.toBeNull();
    expect(cta!.textContent).toContain('Continue Learning');
    expect(cta!.getAttribute('href')).toBe('/learn/course-1/l2');
  });

  it('shows Start Learning when lastAccessedLessonId is null', async () => {
    const fixture = await renderWith({
      course: courseWithLessons([['m1', ['l1', 'l2']]]),
      enrollmentStatus: enrolledStatus({ lastAccessedLessonId: null }),
    });
    const cta = fixture.nativeElement.querySelector('[data-testid="start-learning"]') as HTMLAnchorElement | null;
    expect(cta).not.toBeNull();
    expect(cta!.textContent).toContain('Start Learning');
    expect(cta!.getAttribute('href')).toBe('/learn/course-1/l1');
  });

  it('falls back to Start Learning + first lesson when lastAccessedLessonId no longer resolves', async () => {
    const fixture = await renderWith({
      course: courseWithLessons([['m1', ['l1', 'l2']]]),
      enrollmentStatus: enrolledStatus({ lastAccessedLessonId: 'deleted-lesson-id' }),
    });
    const cta = fixture.nativeElement.querySelector('[data-testid="start-learning"]') as HTMLAnchorElement | null;
    expect(cta).not.toBeNull();
    expect(cta!.textContent).toContain('Start Learning');
    expect(cta!.getAttribute('href')).toBe('/learn/course-1/l1');
  });

  it('owner sees Start Learning regardless of lastAccessedLessonId (owners have no enrolment)', async () => {
    const fixture = await renderWith({
      course: courseWithLessons([['m1', ['l1']]]),
      enrollmentStatus: ownerStatus(),
    });
    const cta = fixture.nativeElement.querySelector('[data-testid="start-learning"]') as HTMLAnchorElement | null;
    expect(cta).not.toBeNull();
    expect(cta!.textContent).toContain('Start Learning');
  });
});
```

Implement the test helpers `renderWith`, `courseWithLessons`, `enrolledStatus`, `ownerStatus` by adapting the existing test scaffolding in the same file. The existing `Start Learning CTA tests` section (line ~185) already covers analogous shape — match its style. Make sure `enrolledStatus(opts)` produces an `EnrollmentStatusView` whose `enrollment` field includes all required `Enrollment` fields (including `lastAccessedLessonId`, `lastAccessedAt`).

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm nx test web-catalog --testFile=course-detail-page.component.spec.ts`
Expected: FAIL — no `[data-testid="continue-learning"]` element; existing test for an enrolled student passes because the current code already emits `start-learning`.

- [ ] **Step 4: Update the component**

In `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.ts`, add (near the existing `firstLessonHref` and `canStartLearning` declarations):

```ts
  /** True only when there is an ACTIVE enrolment whose lastAccessedLessonId resolves to a live lesson. */
  private readonly resumeTarget = computed<readonly [string, string, string] | null>(() => {
    const c = this.course();
    const e = this.enrollmentStatus()?.enrollment ?? null;
    if (!c || !e || e.status !== 'ACTIVE' || !e.lastAccessedLessonId) return null;
    const lastId = e.lastAccessedLessonId;
    const found = c.modules?.some((m) => m.lessons?.some((l) => l.id === lastId));
    return found ? (['/learn', c.id, lastId] as const) : null;
  });

  readonly resumeHref = computed<readonly [string, string, string] | null>(
    () => this.resumeTarget() ?? this.firstLessonHref(),
  );

  readonly resumeLabel = computed<'Start Learning' | 'Continue Learning'>(
    () => (this.resumeTarget() ? 'Continue Learning' : 'Start Learning'),
  );
```

(`canStartLearning` and `firstLessonHref` keep their current semantics. `resumeHref` is now what the template binds to.)

- [ ] **Step 5: Update the template**

In `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.html`, replace the existing CTA block:

```html
@if (canStartLearning()) {
  <a data-testid="start-learning"
     class="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-white"
     [routerLink]="firstLessonHref()">
    Start Learning
  </a>
}
```

with:

```html
@if (canStartLearning()) {
  <a
    [attr.data-testid]="resumeLabel() === 'Continue Learning' ? 'continue-learning' : 'start-learning'"
    class="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-white"
    [routerLink]="resumeHref()">
    {{ resumeLabel() }}
  </a>
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm nx test web-catalog --testFile=course-detail-page.component.spec.ts`
Expected: PASS for all new tests; existing Start Learning tests still pass (the `data-testid="start-learning"` is preserved in the fallback path).

- [ ] **Step 7: Commit**

```bash
git add libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.ts \
        libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.html \
        libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.spec.ts
git commit -m "feat(web-catalog): Continue Learning CTA on course-detail page (falls back to Start Learning)"
```

---

## Task 13: api-e2e — `POST /position` and GET side-effect

**Files:**
- Modify: `apps/api-e2e/src/learn.e2e-spec.ts`

- [ ] **Step 1: Inspect existing fixture helpers**

Run: `grep -nE "seedEnrollment|registerVerified|markLessonComplete" apps/api-e2e/src/learn.e2e-spec.ts | head -30`
Expected: locate the test fixture helpers used by the existing `markComplete` tests. Reuse them.

- [ ] **Step 2: Add the e2e tests**

Append to `apps/api-e2e/src/learn.e2e-spec.ts`:

```ts
test.describe('POST /api/learn/courses/:cid/lessons/:lid/position', () => {
  test('200 with returned lastWatchedSeconds; idempotent on equal repeat', async ({ request }) => {
    const ctx = await registerVerifiedStudent(request);
    const { courseId, lessonId } = await seedCourseAndEnrol(request, ctx);
    const r1 = await request.post(`/api/learn/courses/${courseId}/lessons/${lessonId}/position`, {
      data: { seconds: 30 },
      headers: ctx.headers,
    });
    expect(r1.status()).toBe(200);
    expect(await r1.json()).toEqual({ lastWatchedSeconds: 30 });

    const r2 = await request.post(`/api/learn/courses/${courseId}/lessons/${lessonId}/position`, {
      data: { seconds: 30 },
      headers: ctx.headers,
    });
    expect(r2.status()).toBe(200);
    expect(await r2.json()).toEqual({ lastWatchedSeconds: 30 });
  });

  test('monotonic regression: smaller seconds returns the stored larger value and does not overwrite', async ({ request }) => {
    const ctx = await registerVerifiedStudent(request);
    const { courseId, lessonId } = await seedCourseAndEnrol(request, ctx);
    await request.post(`/api/learn/courses/${courseId}/lessons/${lessonId}/position`, { data: { seconds: 100 }, headers: ctx.headers });
    const r = await request.post(`/api/learn/courses/${courseId}/lessons/${lessonId}/position`, { data: { seconds: 50 }, headers: ctx.headers });
    expect(r.status()).toBe(200);
    expect(await r.json()).toEqual({ lastWatchedSeconds: 100 });
  });

  test('400 INVALID_POSITION on negative seconds', async ({ request }) => {
    const ctx = await registerVerifiedStudent(request);
    const { courseId, lessonId } = await seedCourseAndEnrol(request, ctx);
    const r = await request.post(`/api/learn/courses/${courseId}/lessons/${lessonId}/position`, { data: { seconds: -1 }, headers: ctx.headers });
    expect(r.status()).toBe(400);
    expect((await r.json()).error.code).toBe('INVALID_POSITION');
  });

  test('400 INVALID_POSITION on missing body', async ({ request }) => {
    const ctx = await registerVerifiedStudent(request);
    const { courseId, lessonId } = await seedCourseAndEnrol(request, ctx);
    const r = await request.post(`/api/learn/courses/${courseId}/lessons/${lessonId}/position`, { data: {}, headers: ctx.headers });
    expect(r.status()).toBe(400);
    expect((await r.json()).error.code).toBe('INVALID_POSITION');
  });

  test('403 NOT_ENROLLED_LESSON for a withdrawn enrolment', async ({ request }) => {
    const ctx = await registerVerifiedStudent(request);
    const { courseId, lessonId } = await seedCourseAndEnrol(request, ctx);
    await withdrawEnrolment(request, ctx, courseId);
    const r = await request.post(`/api/learn/courses/${courseId}/lessons/${lessonId}/position`, { data: { seconds: 5 }, headers: ctx.headers });
    expect(r.status()).toBe(403);
    expect((await r.json()).error.code).toBe('NOT_ENROLLED_LESSON');
  });
});

test('GET /learn/.../lessons/:lid bumps lastAccessedLessonId as a side effect', async ({ request }) => {
  const ctx = await registerVerifiedStudent(request);
  const { courseId, lessonId } = await seedCourseAndEnrol(request, ctx);
  await request.get(`/api/learn/courses/${courseId}/lessons/${lessonId}`, { headers: ctx.headers });
  const status = await request.get(`/api/enrollments/${courseId}`, { headers: ctx.headers });
  const body = await status.json();
  expect(body.enrollment.lastAccessedLessonId).toBe(lessonId);
});
```

If your file lacks `registerVerifiedStudent`, `seedCourseAndEnrol`, or `withdrawEnrolment` helpers, adapt the closest existing helpers (the markComplete spec block already does the same setup). Do not introduce new framework abstractions — copy the existing inline style.

- [ ] **Step 3: Run the e2e suite locally**

In one terminal:
```bash
pnpm emulators
```

In another:
```bash
pnpm start:api
```

In a third:
```bash
pnpm nx e2e api-e2e --testFile=learn.e2e-spec.ts
```

Expected: PASS for new and existing tests.

- [ ] **Step 4: Commit**

```bash
git add apps/api-e2e/src/learn.e2e-spec.ts
git commit -m "test(api-e2e): cover POST /position, monotonic skip, validation, and GET-bumps-lastAccessed"
```

---

## Task 14: web-e2e — resume + Continue Learning CTA scenarios

**Files:**
- Modify: `apps/web-e2e/src/learn.spec.ts`

- [ ] **Step 1: Add the e2e tests**

Append to `apps/web-e2e/src/learn.spec.ts`:

```ts
test('Continue Learning appears on /catalog/:cid after the student opens a lesson', async ({ page }) => {
  const ctx = await registerAndPublish(page);
  await enrolStudent(page, ctx);

  await page.goto(`/learn/${ctx.courseId}/${ctx.lessonId}`);
  await expect(page.getByText(ctx.lessonTitle)).toBeVisible();

  await page.goto(`/catalog/${ctx.courseId}`);
  await expect(page.getByTestId('continue-learning')).toBeVisible();
  await expect(page.getByTestId('continue-learning')).toHaveText(/Continue Learning/);
  await expect(page.getByTestId('continue-learning')).toHaveAttribute('href', `/learn/${ctx.courseId}/${ctx.lessonId}`);
});

test('the lesson player resumes from a non-zero saved position on reload', async ({ page, request }) => {
  const ctx = await registerAndPublish(page);
  await enrolStudent(page, ctx);

  // Seed lastWatchedSeconds=20 directly via the API so the spec does not depend on real video playback timing.
  await page.request.post(`/api/learn/courses/${ctx.courseId}/lessons/${ctx.lessonId}/position`, {
    data: { seconds: 20 },
  });

  await page.goto(`/learn/${ctx.courseId}/${ctx.lessonId}`);
  // The page calls GET /learn which embeds lastWatchedSeconds; the component seeks on (metadata).
  // We assert via the data exposed to the DOM rather than the real <video> element, since playback is fake in the test env.
  await expect(page.locator('lib-video-player video')).toBeAttached();
  await page.waitForFunction(() => {
    const v = document.querySelector('lib-video-player video') as HTMLVideoElement | null;
    return v != null && v.duration > 0 && Math.abs(v.currentTime - 20) <= 5;
  }, { timeout: 10_000 });
});
```

If `registerAndPublish` / `enrolStudent` / the `ctx` shape diverges from your existing file's helpers, adapt to whatever helpers exist. The Slice B web-e2e tests in the same file are the closest pattern to copy.

If the test environment uses the `fake` playback storage (per the `fake-source-probe-seam` design) and `<video>.duration` is never set in jsdom-style fixtures, fall back to asserting on the component's `lastWatchedSeconds()` computed via a `page.evaluate(...)` against the Angular component element instead. Note this in a commit message addendum if you use the fallback.

- [ ] **Step 2: Run the suite locally**

In one terminal:
```bash
pnpm emulators
```

In another:
```bash
pnpm start
```

In a third:
```bash
pnpm nx e2e web-e2e --testFile=learn.spec.ts
```

Expected: PASS for new and existing tests.

- [ ] **Step 3: Commit**

```bash
git add apps/web-e2e/src/learn.spec.ts
git commit -m "test(web-e2e): cover Continue Learning CTA and resume-on-reload"
```

---

## Task 15: Workspace quality gates

**Files:** none (verification only)

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS across the workspace.

- [ ] **Step 3: All unit tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: PASS for `web` and `api`.

- [ ] **Step 5: Affected-graph sanity check**

Run: `pnpm nx affected -t lint,typecheck,test,build --base=main`
Expected: PASS. Confirms the slice's churn touched the expected set of projects and nothing further.

If any of the above fails, fix the failing project's issues with the smallest possible change and commit per the convention (`fix(<scope>): …`). Do **not** roll back earlier task commits to "patch" them — keep history linear.

---

## Task 16: README and docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the slice status callout**

In `README.md`, find the existing `> [!NOTE] PROJECT STATUS: ACTIVE DEVELOPMENT` block. Insert a new bullet after the `EP-06 Slice B` line:

```
> - **EP-06 Slice C: Resume Learning** — opening a lesson is tracked per-enrolment; the course-detail page surfaces **Continue Learning** (falling back to **Start Learning** for new enrolments and owners); the lesson player auto-saves position every ~15 s, flushes on pause/pagehide, and resumes within 5 s on revisit. Position writes are idempotent and monotonic (out-of-order beacons cannot rewind progress).
```

Update the "Not built yet" line to remove "resume / last-watched timestamp" if it's still listed there.

- [ ] **Step 2: (Optional) Sync the USER_GUIDE if it documents lesson playback**

Run: `grep -n "lesson\|player\|Mark as Complete\|Continue Learning" docs/USER_GUIDE.md | head -20`
If the guide has a player section that mentions Slice A / Slice B behaviour, add a sentence: "On revisit, the player resumes from the last saved position within 5 s; on the course detail page, a Continue Learning button deep-links to your last opened lesson." If no player section exists, skip this step — defer documentation to a docs-only PR.

- [ ] **Step 3: Commit**

```bash
git add README.md
# add docs/USER_GUIDE.md only if you modified it
git commit -m "docs(ep06): record Slice C — Resume Learning is shipped"
```

---

## Task 17: Land the slice

**Files:** none (git mechanics only)

- [ ] **Step 1: Confirm clean tree on the worktree branch**

Run: `git status`
Expected: clean working tree on branch `ep06-slice-c-resume-learning`.

- [ ] **Step 2: Confirm no surprise files staged**

Run: `git log main..HEAD --stat | head -100`
Confirm: the diff is the expected set of files only (no `node_modules`, no `dist`, no `.claude/`).

- [ ] **Step 3: Sync the worktree against latest main BEFORE merging**

Per the memory `EP-06 Slice B follow-ups`, long divergence windows cause painful merges. Even on a short slice, do this:

```bash
git fetch  # not strictly needed since the branch was cut from local main
git merge main --no-ff -m "Merge main into ep06-slice-c-resume-learning"
```

If this surfaces conflicts, resolve them in the worktree, re-run `pnpm lint typecheck test`, and commit.

- [ ] **Step 4: Switch back to main and merge with --no-ff**

From the main checkout (NOT the worktree):

```bash
git checkout main
git merge ep06-slice-c-resume-learning --no-ff -m "Merge ep06-slice-c-resume-learning: UC-06-03 resume learning"
```

- [ ] **Step 5: Verify gates one more time on main**

Run: `pnpm lint typecheck test build`
Expected: PASS.

- [ ] **Step 6: Clean up the worktree**

```bash
git worktree remove .claude/worktrees/ep06-slice-c-resume-learning
git branch -d ep06-slice-c-resume-learning
```

(Do NOT `git push` — per the memory `Branch isolation preference`, the user lands locally. They will push when ready.)

---

## Post-Implementation

- Save a project memory `project_ep06_slice_c_followups.md` summarising: what shipped, what's still deferred (UC-06-04 course outline, completion rollups), and any non-blocking follow-ups discovered during implementation (e.g. e2e flakes, mocks needing tidy-up).
- Confirm the spec drift report (`docs/quality/spec-drift-report.md`) still cleanly lists UC-06-04 as the remaining EP-06 work; update if needed.

---

## Self-Review Notes

The spec-to-task mapping:

| Spec section | Tasks |
| ------------ | ----- |
| §3 Data Model | Tasks 1, 5 |
| §4 API Surface — GET side effect | Task 6 |
| §4 API Surface — POST /position | Tasks 2, 4, 7 |
| §4 API Surface — touchLastAccessed | Tasks 3, 6 |
| §4 API Surface — INVALID_POSITION error | Tasks 2, 7 |
| §5 Catalog CTA | Task 12 |
| §6 Resume seek + auto-save | Tasks 9, 10, 11 |
| §6 Web LearnService | Task 8 |
| §7 Error / failure modes | Tasks 4, 7, 10, 11 |
| §8 Testing — unit | Tasks 1–12 (each TDD step) |
| §8 Testing — e2e | Tasks 13, 14 |
| §9 Migration / rollout | None needed — additive only |
| Final gates | Task 15 |
| Docs / land | Tasks 16, 17 |

No spec requirement is uncovered. Types and method names are consistent across tasks (`touchLastAccessed`, `setLastWatchedSeconds`, `savePosition`, `PositionSaver`, `resumeHref`, `resumeLabel`).
