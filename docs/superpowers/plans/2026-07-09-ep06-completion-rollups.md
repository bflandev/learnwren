# EP-06 Completion Rollups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Module-complete checkmarks in the course outline and a persistent "Course Completed" badge (course detail, catalog cards, lesson player, profile), per the spec at `docs/superpowers/specs/2026-07-09-ep06-completion-rollups-design.md`.

**Architecture:** `Enrollment` gains a persisted `completedAt` stamp, written inside the existing mark-complete transaction when the last lesson completes, plus a lazy best-effort backfill stamp on the lesson-view read. A new `GET /api/enrollments` endpoint lists the caller's ACTIVE enrollments with course titles for the catalog overlay and profile section. Module rollups are pure client-side derivation from data the outline already carries.

**Tech Stack:** Nx monorepo (pnpm), NestJS 11 (`libs/api-courses`), Firestore, Angular 21 signals/standalone components (`libs/web-*`), Vitest unit tests, Playwright api-e2e.

## Global Constraints

- TDD: every task writes the failing test first, watches it fail, then implements.
- Run tasks through nx with pnpm: `pnpm nx test <project>`, `pnpm nx typecheck <project>`.
- Immutable patterns — never mutate inputs; build new objects.
- The stamp is **never cleared** by later course edits (spec decision 1).
- "All lessons" = every lesson in the course regardless of video state (spec decision 4).
- Wire types live in `libs/shared-data-models`; dates are ISO strings (`ISODateString`), IDs are branded strings.
- Web pattern: services are Promise-returning HTTP wrappers; components own signal state (house rule).
- Commit after each task, conventional-commit format, no attribution footer (disabled globally).
- api-e2e (Task 6) needs `pnpm emulators` and the API running (`pnpm start:api`); run it once at the end of the API work, not per-step.

---

### Task 1: Shared data model — `Enrollment.completedAt` + list-view types

**Files:**
- Modify: `libs/shared-data-models/src/lib/enrollment.ts`
- Test: `libs/shared-data-models/src/lib/enrollment.spec.ts`

**Interfaces:**
- Consumes: existing `Enrollment`, `ISODateString`, `CourseId` types.
- Produces: `Enrollment.completedAt: ISODateString | null`; `EnrollmentListItem { courseId: CourseId; courseTitle: string; completedAt: ISODateString | null }`; `EnrollmentListView { enrollments: EnrollmentListItem[] }`. All later tasks import these from `@learnwren/shared-data-models`.

- [ ] **Step 1: Write the failing test**

Append to `libs/shared-data-models/src/lib/enrollment.spec.ts` (match the existing construction-test style in that file):

```ts
describe('completion rollup types', () => {
  it('Enrollment carries a completedAt stamp', () => {
    const enrollment: Enrollment = {
      id: 'u1__c1' as EnrollmentId,
      userId: 'u1' as UserId,
      courseId: 'c1' as CourseId,
      status: 'ACTIVE',
      progress: [],
      withdrawnAt: null,
      lastAccessedLessonId: null,
      lastAccessedAt: null,
      completedAt: '2026-07-09T00:00:00.000Z' as ISODateString,
      createdAt: '2026-07-01T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-07-09T00:00:00.000Z' as ISODateString,
    };
    expect(enrollment.completedAt).toBe('2026-07-09T00:00:00.000Z');
  });

  it('EnrollmentListView shapes the GET /api/enrollments response', () => {
    const view: EnrollmentListView = {
      enrollments: [
        {
          courseId: 'c1' as CourseId,
          courseTitle: 'Course 1',
          completedAt: null,
        },
      ],
    };
    expect(view.enrollments[0].courseTitle).toBe('Course 1');
  });
});
```

Add `EnrollmentListView`, `EnrollmentId` to the spec file's imports.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test shared-data-models`
Expected: FAIL — `completedAt` not in `Enrollment`, `EnrollmentListView` not exported (tsc errors).

- [ ] **Step 3: Implement**

In `libs/shared-data-models/src/lib/enrollment.ts`, add to the `Enrollment` interface (after `lastAccessedAt`):

```ts
  /**
   * Set when every lesson in the course has a completed progress row
   * (US-06-02 course rollup). Never cleared by later course edits;
   * preserved across WITHDRAWN → ACTIVE. Missing on pre-rollup docs —
   * readers treat undefined as null.
   */
  completedAt?: ISODateString | null;
```

(Optional field: existing Firestore docs lack it; `?` keeps old docs type-honest.)

Below `EnrollmentStatusView`, add:

```ts
/** One row of GET /api/enrollments — the caller's enrollment joined to its course title. */
export interface EnrollmentListItem {
  courseId: CourseId;
  courseTitle: string;
  completedAt: ISODateString | null;
}

/** Response of GET /api/enrollments — the caller's ACTIVE enrollments. */
export interface EnrollmentListView {
  enrollments: EnrollmentListItem[];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test shared-data-models`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/shared-data-models/src/lib/enrollment.ts libs/shared-data-models/src/lib/enrollment.spec.ts
git commit -m "feat(shared-data-models): add Enrollment.completedAt + enrollment list view types"
```

---

### Task 2: Repository — stamp `completedAt` in the mark-complete transaction

**Files:**
- Modify: `libs/api-courses/src/lib/enrollment/enrollment.repository.ts:132-166` (`markLessonComplete`)
- Test: `libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts` (existing `markLessonComplete` describe block starts ~line 239)

**Interfaces:**
- Consumes: fake-Firestore harness `createFakeFirestore` / `repoWith(seed)` and `db.__store` from the existing spec file.
- Produces: **changed signature** `markLessonComplete(userId, courseId, lessonId, completedAtIso, allLessonIds: LessonId[])`. Task 4 (LearnService) passes the fifth argument.

- [ ] **Step 1: Write the failing tests**

In the existing `EnrollmentRepository.markLessonComplete` describe block, add (reusing the file's `UID`, `CID`, `ID`, `repoWith` helpers; `activeEnrollment` = whatever helper the block already uses to seed an ACTIVE enrollment — follow the existing tests' seeding style exactly):

```ts
it('stamps completedAt when the marked lesson is the last incomplete one', async () => {
  const { repo, db } = repoWith({
    [`enrollments/${ID}`]: {
      ...activeEnrollment(),
      progress: [
        { lessonId: 'l1' as LessonId, completedAt: '2026-07-01T00:00:00.000Z', lastWatchedSeconds: 10 },
        { lessonId: 'l2' as LessonId, completedAt: null, lastWatchedSeconds: 5 },
      ],
    },
  });
  await repo.markLessonComplete(UID, CID, 'l2' as LessonId,
    '2026-07-09T00:00:00.000Z' as ISODateString, ['l1', 'l2'] as LessonId[]);
  expect(db.__store.get(`enrollments/${ID}`)?.['completedAt']).toBe('2026-07-09T00:00:00.000Z');
});

it('does not stamp when other lessons remain incomplete', async () => {
  const { repo, db } = repoWith({ [`enrollments/${ID}`]: activeEnrollment() });
  await repo.markLessonComplete(UID, CID, 'l1' as LessonId,
    '2026-07-09T00:00:00.000Z' as ISODateString, ['l1', 'l2'] as LessonId[]);
  expect(db.__store.get(`enrollments/${ID}`)?.['completedAt']).toBeUndefined();
});

it('does not restamp an already-stamped enrollment (idempotent re-mark)', async () => {
  const { repo, db } = repoWith({
    [`enrollments/${ID}`]: {
      ...activeEnrollment(),
      completedAt: '2026-07-01T00:00:00.000Z',
      progress: [{ lessonId: 'l1' as LessonId, completedAt: '2026-07-01T00:00:00.000Z', lastWatchedSeconds: 10 }],
    },
  });
  await repo.markLessonComplete(UID, CID, 'l1' as LessonId,
    '2026-07-09T00:00:00.000Z' as ISODateString, ['l1'] as LessonId[]);
  expect(db.__store.get(`enrollments/${ID}`)?.['completedAt']).toBe('2026-07-01T00:00:00.000Z');
});

it('does not stamp when the lesson list is empty', async () => {
  const { repo, db } = repoWith({ [`enrollments/${ID}`]: { ...activeEnrollment(), progress: [] } });
  await repo.markLessonComplete(UID, CID, 'l1' as LessonId,
    '2026-07-09T00:00:00.000Z' as ISODateString, [] as LessonId[]);
  // 'l1' isn't in an empty course list — but even so an empty list must never stamp
  expect(db.__store.get(`enrollments/${ID}`)?.['completedAt']).toBeUndefined();
});
```

Also update every existing `repo.markLessonComplete(...)` call in the spec to pass a fifth argument that does NOT trigger stamping (e.g. `['l1', 'other-lesson'] as LessonId[]`), so the pre-existing assertions stay valid.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm nx test api-courses --testPathPattern=enrollment.repository`
(If `--testPathPattern` is not supported by the vitest executor, run `pnpm nx test api-courses` — the whole suite is fast.)
Expected: FAIL — signature mismatch / `completedAt` never written.

- [ ] **Step 3: Implement**

Replace `markLessonComplete` in `enrollment.repository.ts`:

```ts
  async markLessonComplete(
    userId: UserId,
    courseId: CourseId,
    lessonId: LessonId,
    completedAtIso: ISODateString,
    allLessonIds: LessonId[],
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
      const existingRow = idx >= 0 ? progress[idx] : undefined;

      if (existingRow && existingRow.completedAt != null) {
        // Already complete — idempotent no-op. Return the prior value, write nothing.
        return { completedAt: existingRow.completedAt };
      }

      if (existingRow) {
        progress[idx] = { ...existingRow, completedAt: completedAtIso };
      } else {
        progress.push({ lessonId, completedAt: completedAtIso, lastWatchedSeconds: 0 });
      }

      const update: Record<string, unknown> = { progress, updatedAt: completedAtIso };

      // Course rollup (US-06-02): when this write completes the last lesson,
      // stamp the enrollment in the same transaction. Never restamped, never
      // cleared (completing "the course as it was" is final by design).
      const doneByLesson = new Map(progress.map((p) => [p.lessonId, p.completedAt != null]));
      const allComplete =
        allLessonIds.length > 0 && allLessonIds.every((id) => doneByLesson.get(id) === true);
      if (allComplete && existing.completedAt == null) {
        update['completedAt'] = completedAtIso;
      }

      t.update(enrollmentRef, update);
      return { completedAt: completedAtIso };
    });
  }
```

Keep the existing `// Stryker disable` comments where the surrounding lines survive unchanged.

This changes the signature its caller in `learn.service.ts` uses, so fix the call site NOW with the real wiring (do NOT pass a `[]` placeholder — it would never stamp and vitest masks tsc errors in this repo, so the defect would hide). Apply Task 4 Step 3's `markLessonComplete` + `listAllLessonIds` change to `libs/api-courses/src/lib/learn/learn.service.ts` as part of this step; Task 4 then only adds the service-level tests and the lazy-stamp-on-read behavior.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test api-courses && pnpm nx typecheck api`
Expected: PASS (typecheck confirms the learn.service call-site wiring compiles — vitest alone would mask a tsc error).

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/enrollment/enrollment.repository.ts libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts libs/api-courses/src/lib/learn/learn.service.ts
git commit -m "feat(api-courses): stamp Enrollment.completedAt when the last lesson completes"
```

---

### Task 3: Repository — `stampCompleted` (lazy backfill write) + `listActiveByUser`

**Files:**
- Modify: `libs/api-courses/src/lib/enrollment/enrollment.repository.ts`
- Test: `libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts`

**Interfaces:**
- Consumes: same fake-Firestore harness.
- Produces: `stampCompleted(userId: UserId, courseId: CourseId, completedAtIso: ISODateString): Promise<void>` (no-throw contract is the CALLER's job — this method may throw; LearnService wraps it). `listActiveByUser(userId: UserId): Promise<Enrollment[]>`. Used by Tasks 4 and 5.

- [ ] **Step 1: Write the failing tests**

```ts
describe('EnrollmentRepository.stampCompleted', () => {
  it('stamps an unstamped enrollment', async () => {
    const { repo, db } = repoWith({ [`enrollments/${ID}`]: activeEnrollment() });
    await repo.stampCompleted(UID, CID, '2026-07-09T00:00:00.000Z' as ISODateString);
    expect(db.__store.get(`enrollments/${ID}`)?.['completedAt']).toBe('2026-07-09T00:00:00.000Z');
  });

  it('leaves an existing stamp untouched', async () => {
    const { repo, db } = repoWith({
      [`enrollments/${ID}`]: { ...activeEnrollment(), completedAt: '2026-07-01T00:00:00.000Z' },
    });
    await repo.stampCompleted(UID, CID, '2026-07-09T00:00:00.000Z' as ISODateString);
    expect(db.__store.get(`enrollments/${ID}`)?.['completedAt']).toBe('2026-07-01T00:00:00.000Z');
  });
});

describe('EnrollmentRepository.listActiveByUser', () => {
  it('returns only the caller’s ACTIVE enrollments', async () => {
    const other = { ...activeEnrollment(), id: 'u2__c1', userId: 'u2' };
    const withdrawn = { ...activeEnrollment(), id: `${UID}__c2`, courseId: 'c2', status: 'WITHDRAWN' };
    const { repo } = repoWith({
      [`enrollments/${ID}`]: activeEnrollment(),
      ['enrollments/u2__c1']: other,
      [`enrollments/${UID}__c2`]: withdrawn,
    });
    const rows = await repo.listActiveByUser(UID);
    expect(rows.map((r) => r.id)).toEqual([ID]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test api-courses`
Expected: FAIL — methods don't exist.

- [ ] **Step 3: Implement**

Add to `EnrollmentRepository` (next to `listActiveByCourse`):

```ts
  /** All ACTIVE enrollments for a user — GET /api/enrollments + profile/catalog badges. */
  async listActiveByUser(userId: UserId): Promise<Enrollment[]> {
    const snap = await this.db
      .collection(ENROLLMENTS)
      .where('userId', '==', userId)
      .where('status', '==', 'ACTIVE')
      .get();
    return snap.docs.map((d) => d.data() as Enrollment);
  }

  /**
   * Lazy backfill stamp (US-06-02): sets completedAt on an unstamped
   * enrollment. Transactional read-then-write so a concurrent stamp (or the
   * mark-complete path) is never overwritten with a later date.
   */
  async stampCompleted(
    userId: UserId,
    courseId: CourseId,
    completedAtIso: ISODateString,
  ): Promise<void> {
    const ref = this.db.collection(ENROLLMENTS).doc(enrollmentId(userId, courseId));
    await this.db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      const existing = snap.exists ? (snap.data() as Enrollment) : null;
      if (!existing || existing.completedAt != null) return;
      t.update(ref, { completedAt: completedAtIso, updatedAt: completedAtIso });
    });
  }
```

(Two equality filters need no composite Firestore index — equality-only queries merge single-field indexes; `firestore.indexes.json` stays untouched, same as `listActiveByCourse`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test api-courses`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/enrollment/enrollment.repository.ts libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts
git commit -m "feat(api-courses): add stampCompleted + listActiveByUser to EnrollmentRepository"
```

---

### Task 4: LearnService — wire lesson IDs into mark-complete; lazy stamp on lesson view

**Files:**
- Modify: `libs/api-courses/src/lib/learn/learn.service.ts` (`markLessonComplete` ~line 126, `projectOutline` ~line 94)
- Test: `libs/api-courses/src/lib/learn/learn.service.spec.ts`

**Interfaces:**
- Consumes: `EnrollmentRepository.markLessonComplete(..., allLessonIds)` (Task 2), `stampCompleted` (Task 3), existing `CoursesRepository.listModulesByCourse(courseId)` / `listLessonsByModule(courseId, moduleId)`.
- Produces: no signature changes — `LearnService.markLessonComplete(userId, course, lesson)` and `getLessonView` keep their contracts.

(If Task 2 already folded in the service wiring to compile, this task only adds the lazy-stamp behavior + tests.)

- [ ] **Step 1: Write the failing tests**

Follow the existing mock style in `learn.service.spec.ts` (hand-rolled stub objects per repository). Add:

```ts
describe('LearnService.markLessonComplete — course rollup', () => {
  it('passes the full lesson-id list of the course to the repository', async () => {
    // arrange: courses stub returns 2 modules with lessons l1..l3;
    // enrollment.markLessonComplete records its arguments
    await service.markLessonComplete(UID, courseFixture, lessonFixture);
    expect(enrollmentRepo.markLessonComplete).toHaveBeenCalledWith(
      UID, courseFixture.id, lessonFixture.id, expect.any(String),
      ['l1', 'l2', 'l3'],
    );
  });
});

describe('LearnService.getLessonView — lazy completion stamp', () => {
  it('stamps an unstamped enrollment whose lessons are all complete', async () => {
    // arrange: enrolled student, every outline lesson has completedAt, enrollment.completedAt is null
    await service.getLessonView(UID, courseFixture, lessonFixture);
    expect(enrollmentRepo.stampCompleted).toHaveBeenCalledWith(UID, courseFixture.id, expect.any(String));
  });

  it('does not stamp when a lesson is incomplete', async () => {
    await service.getLessonView(UID, courseFixture, lessonFixture);
    expect(enrollmentRepo.stampCompleted).not.toHaveBeenCalled();
  });

  it('does not stamp an already-stamped enrollment', async () => {
    // enrollment.completedAt already set
    await service.getLessonView(UID, courseFixture, lessonFixture);
    expect(enrollmentRepo.stampCompleted).not.toHaveBeenCalled();
  });

  it('does not stamp for the course owner (no enrollment)', async () => {
    await service.getLessonView(OWNER_UID, courseFixture, lessonFixture);
    expect(enrollmentRepo.stampCompleted).not.toHaveBeenCalled();
  });

  it('a failing stamp write does not fail the read', async () => {
    enrollmentRepo.stampCompleted = vi.fn().mockRejectedValue(new Error('boom'));
    const view = await service.getLessonView(UID, courseFixture, lessonFixture);
    expect(view.outline.modules.length).toBeGreaterThan(0);
  });
});
```

Flesh out the arrange sections with the spec file's existing fixture helpers — reuse, don't reinvent.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test api-courses`
Expected: FAIL — lesson-id list not passed / `stampCompleted` never called.

- [ ] **Step 3: Implement**

In `learn.service.ts`, replace `markLessonComplete`:

```ts
  async markLessonComplete(
    userId: UserId,
    course: Course,
    lesson: Lesson,
  ): Promise<{ completedAt: ISODateString }> {
    const allLessonIds = await this.listAllLessonIds(course);
    return this.enrollment.markLessonComplete(
      userId,
      course.id,
      lesson.id,
      new Date().toISOString() as ISODateString,
      allLessonIds,
    );
  }

  private async listAllLessonIds(course: Course): Promise<LessonId[]> {
    const modules = await this.courses.listModulesByCourse(course.id);
    const lessonsByModule = await Promise.all(
      modules.map((m) => this.courses.listLessonsByModule(course.id, m.id)),
    );
    return lessonsByModule.flat().map((l) => l.id);
  }
```

In `projectOutline`, the student branch already builds `progressByLesson` and has `allLessonIds` in scope. After the `for` loop that fills `progressByLesson`, inside the `if (course.instructorId !== userId)` block, add:

```ts
      // Lazy backfill (US-06-02): a student who finished every lesson before
      // the rollup shipped has nothing left to mark — stamp on read instead.
      // Best-effort: a stamp failure must never fail the lesson view.
      const allComplete =
        allLessonIds.length > 0 &&
        allLessonIds.every((id) => progressByLesson.get(id) != null);
      if (enrolment?.status === 'ACTIVE' && enrolment.completedAt == null && allComplete) {
        try {
          await this.enrollment.stampCompleted(
            userId,
            course.id,
            new Date().toISOString() as ISODateString,
          );
        } catch (err) {
          this.logger.warn(
            `stampCompleted failed for user=${userId} course=${course.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
```

Note: `projectOutline` and `listAllLessonIds` both list modules/lessons; `markLessonComplete` doesn't call `projectOutline`, so there is no duplicate fetch on either path. Don't merge them speculatively.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test api-courses`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/learn/learn.service.ts libs/api-courses/src/lib/learn/learn.service.spec.ts
git commit -m "feat(api-courses): course-completion stamp on mark-complete + lazy backfill on lesson view"
```

---

### Task 5: API — `GET /api/enrollments` list endpoint

**Files:**
- Modify: `libs/api-courses/src/lib/enrollment/enrollment.service.ts`
- Modify: `libs/api-courses/src/lib/enrollment/enrollment.controller.ts`
- Test: `libs/api-courses/src/lib/enrollment/enrollment.service.spec.ts`, `libs/api-courses/src/lib/enrollment/enrollment.controller.spec.ts`

**Interfaces:**
- Consumes: `EnrollmentRepository.listActiveByUser` (Task 3), `CoursesRepository.getCourse(courseId)`, `EnrollmentListView` (Task 1).
- Produces: `EnrollmentService.listMyEnrollments(userId: UserId): Promise<EnrollmentListView>`; route `GET /api/enrollments` (session-guarded — controller-level `FirebaseSessionGuard` already applies). `@Get()` on the controller root cannot collide with `@Get(':courseId')`.

- [ ] **Step 1: Write the failing tests**

Service spec (follow the file's existing stub style):

```ts
describe('EnrollmentService.listMyEnrollments', () => {
  it('joins course titles onto the caller’s ACTIVE enrollments', async () => {
    enrollments.listActiveByUser = vi.fn().mockResolvedValue([
      { courseId: 'c1', completedAt: '2026-07-09T00:00:00.000Z' },
      { courseId: 'c2', completedAt: null },
    ]);
    courses.getCourse = vi.fn(async (id: string) =>
      id === 'c1' ? { id: 'c1', title: 'Course One' } : { id: 'c2', title: 'Course Two' },
    );
    const view = await service.listMyEnrollments(UID);
    expect(view).toEqual({
      enrollments: [
        { courseId: 'c1', courseTitle: 'Course One', completedAt: '2026-07-09T00:00:00.000Z' },
        { courseId: 'c2', courseTitle: 'Course Two', completedAt: null },
      ],
    });
  });

  it('omits enrollments whose course was deleted', async () => {
    enrollments.listActiveByUser = vi.fn().mockResolvedValue([{ courseId: 'gone', completedAt: null }]);
    courses.getCourse = vi.fn().mockResolvedValue(null);
    const view = await service.listMyEnrollments(UID);
    expect(view.enrollments).toEqual([]);
  });

  it('normalizes a missing completedAt (pre-rollup doc) to null', async () => {
    enrollments.listActiveByUser = vi.fn().mockResolvedValue([{ courseId: 'c1' }]);
    courses.getCourse = vi.fn().mockResolvedValue({ id: 'c1', title: 'Course One' });
    const view = await service.listMyEnrollments(UID);
    expect(view.enrollments[0].completedAt).toBeNull();
  });
});
```

Controller spec: assert `list()` delegates to `svc.listMyEnrollments(req.user.uid)` — same delegation-test shape as the existing `getStatus` test.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test api-courses`
Expected: FAIL — methods don't exist.

- [ ] **Step 3: Implement**

`enrollment.service.ts` — add (import `EnrollmentListView` from `@learnwren/shared-data-models`):

```ts
  /** The caller's ACTIVE enrollments joined to course titles (GET /api/enrollments). */
  async listMyEnrollments(userId: UserId): Promise<EnrollmentListView> {
    const rows = await this.enrollments.listActiveByUser(userId);
    const courses = await Promise.all(rows.map((r) => this.courses.getCourse(r.courseId)));
    const enrollments = rows.flatMap((r, i) => {
      const course = courses[i];
      if (!course) return []; // course deleted — orphaned enrollment, omit
      return [{ courseId: r.courseId, courseTitle: course.title, completedAt: r.completedAt ?? null }];
    });
    return { enrollments };
  }
```

`enrollment.controller.ts` — add above the `@Get(':courseId')` handler (import `EnrollmentListView`):

```ts
  @Get()
  list(@Req() req: AuthenticatedRequest): Promise<EnrollmentListView> {
    return this.svc.listMyEnrollments(req.user!.uid);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test api-courses` then `pnpm nx typecheck api`
Expected: PASS (typecheck catches anything vitest masks — known gotcha in this repo).

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/enrollment/enrollment.service.ts libs/api-courses/src/lib/enrollment/enrollment.controller.ts libs/api-courses/src/lib/enrollment/enrollment.service.spec.ts libs/api-courses/src/lib/enrollment/enrollment.controller.spec.ts
git commit -m "feat(api): GET /api/enrollments — caller's enrollments with course titles"
```

---

### Task 6: api-e2e — list endpoint + end-to-end stamp

**Files:**
- Modify: `apps/api-e2e/src/enrollment.e2e-spec.ts`

**Interfaces:**
- Consumes: helpers from `apps/api-e2e/src/_helpers/auth.ts` (`API_BASE`, `initAdmin`, `registerStudent`, `registerAndPromoteInstructor` — `SessionContext` is `{ uid, cookieHeader }`), the file's own `seedCourse` helper, `admin.firestore()` for seeding modules/lessons.
- Produces: nothing downstream; this is the integration gate for Tasks 1–5.

**Prereq:** `pnpm emulators` running in one terminal, API running (`pnpm start:api`).

- [ ] **Step 1: Write the tests**

Add to `enrollment.e2e-spec.ts` (adapt seeding of modules/lessons from `learn.e2e-spec.ts` — copy its module/lesson seed helper shape rather than inventing one):

```ts
test('GET /api/enrollments requires a session', async ({ request }) => {
  expect((await request.get(`${API_BASE}/enrollments`)).status()).toBe(401);
});

test('GET /api/enrollments returns [] for a fresh user', async ({ request }) => {
  const student = await registerStudent(request);
  const res = await request.get(`${API_BASE}/enrollments`, {
    headers: { cookie: student.cookieHeader },
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ enrollments: [] });
});

test('GET /api/enrollments lists an enrollment with its course title and null completedAt', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const student = await registerStudent(request);
  const courseId = await seedCourse('PUBLISHED', instructor.uid);
  await request.post(`${API_BASE}/enrollments`, {
    headers: { cookie: student.cookieHeader },
    data: { courseId },
  });
  const res = await request.get(`${API_BASE}/enrollments`, {
    headers: { cookie: student.cookieHeader },
  });
  const body = await res.json();
  const row = body.enrollments.find((e: { courseId: string }) => e.courseId === courseId);
  expect(row).toEqual({ courseId, courseTitle: 'Enrollment e2e course', completedAt: null });
});

test('completing every lesson stamps the enrollment; the list reflects it', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const student = await registerStudent(request);
  const courseId = await seedCourse('PUBLISHED', instructor.uid);
  const { moduleId, lessonIds } = await seedModuleWithLessons(courseId, instructor.uid, 2); // adapt from learn.e2e-spec seeding
  await request.post(`${API_BASE}/enrollments`, {
    headers: { cookie: student.cookieHeader },
    data: { courseId },
  });

  for (const lid of lessonIds) {
    const res = await request.post(`${API_BASE}/learn/courses/${courseId}/lessons/${lid}/complete`, {
      headers: { cookie: student.cookieHeader },
      data: {},
    });
    expect(res.status()).toBe(200);
  }

  const list = await request.get(`${API_BASE}/enrollments`, {
    headers: { cookie: student.cookieHeader },
  });
  const row = (await list.json()).enrollments.find(
    (e: { courseId: string }) => e.courseId === courseId,
  );
  expect(row.completedAt).not.toBeNull();

  const status = await request.get(`${API_BASE}/enrollments/${courseId}`, {
    headers: { cookie: student.cookieHeader },
  });
  expect((await status.json()).enrollment.completedAt).toBe(row.completedAt);
});
```

- [ ] **Step 2: Run the suite**

Run: `pnpm nx e2e api-e2e --testFile=enrollment` (check the project's actual filter flag with `pnpm nx show project api-e2e` first; run the full target if unsure)
Expected: PASS. The PUBLIC_ALLOWLIST guard-coverage test must stay green (the new route is session-guarded, not public).

- [ ] **Step 3: Commit**

```bash
git add apps/api-e2e/src/enrollment.e2e-spec.ts
git commit -m "test(api-e2e): enrollment list endpoint + course-completion stamp"
```

---

### Task 7: Web — outline panel module checkmarks + course-complete banner

**Files:**
- Modify: `libs/web-learn/src/lib/course-outline-panel/course-outline-panel.component.ts`
- Modify: `libs/web-learn/src/lib/course-outline-panel/course-outline-panel.component.html`
- Test: `libs/web-learn/src/lib/course-outline-panel/course-outline-panel.component.spec.ts`

**Interfaces:**
- Consumes: `CourseOutline` input already on the component (`outline().modules[].lessons[].completedAt`).
- Produces: template test-ids `module-complete` and `course-complete-banner` (used by tests only; no new inputs/outputs).

- [ ] **Step 1: Write the failing tests**

Follow the spec file's existing harness (TestBed + fixture). Add:

```ts
it('shows a checkmark on a module whose lessons are all complete, not on others', async () => {
  // outline: module m1 lessons all completedAt set; module m2 has one null
  const marks = fixture.nativeElement.querySelectorAll('[data-testid="module-complete"]');
  expect(marks.length).toBe(1);
});

it('shows the course-complete banner only when every lesson is complete', async () => {
  // all complete → banner present
  expect(fixture.nativeElement.querySelector('[data-testid="course-complete-banner"]')).toBeTruthy();
});

it('hides the banner when any lesson is incomplete', async () => {
  expect(fixture.nativeElement.querySelector('[data-testid="course-complete-banner"]')).toBeNull();
});

it('treats an empty outline as not complete', async () => {
  // outline with zero modules → no banner
  expect(fixture.nativeElement.querySelector('[data-testid="course-complete-banner"]')).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test web-learn`
Expected: FAIL — no such elements.

- [ ] **Step 3: Implement**

Component — add `computed` to the `@angular/core` import, plus:

```ts
  /** True when the module's every lesson is complete (US-06-02 module rollup). */
  isModuleComplete(m: CourseOutline['modules'][number]): boolean {
    return m.lessons.length > 0 && m.lessons.every((l) => l.completedAt != null);
  }

  readonly courseComplete = computed(() => {
    const modules = this.outline().modules;
    const lessons = modules.flatMap((m) => m.lessons);
    return lessons.length > 0 && lessons.every((l) => l.completedAt != null);
  });
```

Template — inside `<aside>`, before the `@for` over modules:

```html
  @if (courseComplete()) {
    <p data-testid="course-complete-banner" class="course-complete-banner" role="status">
      🎉 Course completed
    </p>
  }
```

And on the module heading:

```html
      <h3>
        {{ m.title }}
        @if (isModuleComplete(m)) {
          <span data-testid="module-complete" aria-label="Module completed">&#10003;</span>
        }
      </h3>
```

Style with the codebase's Tailwind tokens to match neighboring elements (`text-ink`, `text-ink-2`, etc. — copy from what the template already uses; keep it minimal).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test web-learn`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/web-learn/src/lib/course-outline-panel/
git commit -m "feat(web-learn): module-complete checkmarks + course-complete banner in outline"
```

---

### Task 8: Web — enrollment service list call + Completed badge on course detail

**Files:**
- Modify: `libs/web-enrollment/src/lib/enrollment.service.ts`
- Modify: `libs/web-enrollment/src/lib/course-enrollment-panel/course-enrollment-panel.component.ts`
- Modify: `libs/web-enrollment/src/lib/course-enrollment-panel/course-enrollment-panel.component.html`
- Test: `libs/web-enrollment/src/lib/enrollment.service.spec.ts`, `libs/web-enrollment/src/lib/course-enrollment-panel/course-enrollment-panel.component.spec.ts`

**Interfaces:**
- Consumes: `EnrollmentListView` (Task 1); panel's existing `resolveStatus()` flow and `EnrollmentStatusView`.
- Produces: `EnrollmentService.listMyEnrollments(): Promise<EnrollmentListView>` (Tasks 9 and 10 call this); panel template test-id `course-completed-badge`.

- [ ] **Step 1: Write the failing tests**

Service spec (match the file's HttpTestingController style):

```ts
it('listMyEnrollments GETs /api/enrollments', async () => {
  const promise = service.listMyEnrollments();
  const req = httpMock.expectOne('/api/enrollments');
  expect(req.request.method).toBe('GET');
  req.flush({ enrollments: [] });
  expect(await promise).toEqual({ enrollments: [] });
});
```

Panel spec (match existing mock-service pattern; `getEnrollmentStatus` is already mocked there):

```ts
it('shows the Completed badge when the enrollment is stamped', async () => {
  enrollmentsMock.getEnrollmentStatus.mockResolvedValue({
    isOwner: false,
    enrollment: { status: 'ACTIVE', completedAt: '2026-07-09T00:00:00.000Z' } as Enrollment,
  });
  // ...create fixture, whenStable...
  expect(fixture.nativeElement.querySelector('[data-testid="course-completed-badge"]')).toBeTruthy();
});

it('shows no badge for an unstamped active enrollment', async () => {
  enrollmentsMock.getEnrollmentStatus.mockResolvedValue({
    isOwner: false,
    enrollment: { status: 'ACTIVE', completedAt: null } as Enrollment,
  });
  expect(fixture.nativeElement.querySelector('[data-testid="course-completed-badge"]')).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test web-enrollment`
Expected: FAIL.

- [ ] **Step 3: Implement**

Service — add:

```ts
  listMyEnrollments(): Promise<EnrollmentListView> {
    return firstValueFrom(this.http.get<EnrollmentListView>('/api/enrollments'));
  }
```

(import `EnrollmentListView` type from `@learnwren/shared-data-models`).

Panel component — add a signal and set it wherever state is resolved or changed:

```ts
  readonly completed = signal(false);
```

In `resolveStatus()`, after fetching `view`:

```ts
      this.completed.set(view.enrollment?.status === 'ACTIVE' && view.enrollment.completedAt != null);
```

(one line placed before the state branching; owners/guests naturally resolve to `false`). In `confirmLeave()` success path, `this.completed.set(false)` next to `this.state.set('ENROLLABLE')`.

Panel template — in the `ENROLLED` case:

```html
    @case ('ENROLLED') {
      <p class="text-sm font-medium text-ink">Enrolled ✓</p>
      @if (completed()) {
        <p data-testid="course-completed-badge" class="text-sm font-medium text-ink">
          🎉 Course Completed
        </p>
      }
      <button lwButton type="button" [disabled]="busy()" (click)="openConfirm()">
        Leave course
      </button>
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test web-enrollment`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/web-enrollment/src/lib/
git commit -m "feat(web-enrollment): listMyEnrollments + Course Completed badge on the detail panel"
```

---

### Task 9: Web — catalog card Completed overlay

**Files:**
- Modify: `libs/web-catalog/src/lib/components/course-card/course-card.component.ts` + `.html`
- Modify: `libs/web-catalog/src/lib/catalog-page/catalog-page.component.ts` + `.html`
- Test: `libs/web-catalog/src/lib/components/course-card/course-card.component.spec.ts`, `libs/web-catalog/src/lib/catalog-page/catalog-page.component.spec.ts`

**Interfaces:**
- Consumes: `EnrollmentService.listMyEnrollments()` from `@learnwren/web-enrollment` (Task 8 — web-catalog already depends on web-enrollment), `AuthService.currentUser()` from `@learnwren/web-auth`.
- Produces: `CourseCardComponent` gains `completed = input(false)`.

- [ ] **Step 1: Write the failing tests**

Card spec:

```ts
it('shows a Completed pill when completed', () => {
  fixture.componentRef.setInput('completed', true);
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('[data-testid="card-completed-pill"]')).toBeTruthy();
});

it('shows no Completed pill by default', () => {
  expect(fixture.nativeElement.querySelector('[data-testid="card-completed-pill"]')).toBeNull();
});
```

Catalog page spec (extend the existing TestBed providers with mocks for `AuthService` and `EnrollmentService`):

```ts
it('marks cards of completed courses when signed in', async () => {
  authMock.currentUser.mockReturnValue({ uid: 'u1' } as never);
  enrollmentsMock.listMyEnrollments.mockResolvedValue({
    enrollments: [{ courseId: 'c1', courseTitle: 'One', completedAt: '2026-07-09T00:00:00.000Z' }],
  });
  // catalog service returns courses c1 and c2 …
  expect(component.completedCourseIds().has('c1')).toBe(true);
  expect(component.completedCourseIds().has('c2')).toBe(false);
});

it('does not call the enrollments API for guests', async () => {
  authMock.currentUser.mockReturnValue(null);
  expect(enrollmentsMock.listMyEnrollments).not.toHaveBeenCalled();
});

it('a failed enrollments load leaves the catalog rendered without badges', async () => {
  authMock.currentUser.mockReturnValue({ uid: 'u1' } as never);
  enrollmentsMock.listMyEnrollments.mockRejectedValue(new Error('boom'));
  // catalog still renders; completedCourseIds stays empty
  expect(component.completedCourseIds().size).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test web-catalog`
Expected: FAIL.

- [ ] **Step 3: Implement**

Card component: add `readonly completed = input(false);`. Template — next to the existing pills (`LwPillComponent` is already imported):

```html
  @if (completed()) {
    <lw-pill data-testid="card-completed-pill">Completed</lw-pill>
  }
```

(Match the exact `lw-pill` usage/attributes already present in `course-card.component.html` — copy an existing pill and change the label.)

Catalog page component — inject and load once (constructor already subscribes to query params; badges are orthogonal to filters so load once, not per filter change):

```ts
  private readonly auth = inject(AuthService);
  private readonly enrollments = inject(EnrollmentService);

  /** Course ids the signed-in caller has completed — overlays a badge on cards. */
  readonly completedCourseIds = signal<ReadonlySet<string>>(new Set());

  // in the constructor:
  if (this.auth.currentUser()) {
    void this.enrollments
      .listMyEnrollments()
      .then((view) => {
        this.completedCourseIds.set(
          new Set(
            view.enrollments.filter((e) => e.completedAt != null).map((e) => e.courseId),
          ),
        );
      })
      .catch(() => {
        /* badge overlay is best-effort — catalog renders without it */
      });
  }
```

Imports: `AuthService` from `@learnwren/web-auth`, `EnrollmentService` from `@learnwren/web-enrollment`.

Template line 27:

```html
        <li><lib-course-card [course]="course" [completed]="completedCourseIds().has(course.id)" /></li>
```

- [ ] **Step 4: Run tests, typecheck the app**

Run: `pnpm nx test web-catalog && pnpm nx typecheck web`
Expected: PASS. If typecheck fails on a missing project reference, add the lib's `tsconfig.lib.json` path to `apps/web/tsconfig.spec.json` references (known repo gotcha).

- [ ] **Step 5: Commit**

```bash
git add libs/web-catalog/src/lib/
git commit -m "feat(web-catalog): Completed pill on catalog cards for signed-in students"
```

---

### Task 10: Web — "Completed courses" section on the profile page

**Files:**
- Create: `libs/web-profile/src/lib/completed-courses/completed-courses.component.ts`
- Create: `libs/web-profile/src/lib/completed-courses/completed-courses.component.html`
- Test: `libs/web-profile/src/lib/completed-courses/completed-courses.component.spec.ts`
- Modify: `libs/web-profile/src/lib/profile-page/profile-page.component.ts` (imports array) + `.html` (mount the component)

**Interfaces:**
- Consumes: `EnrollmentService.listMyEnrollments()` from `@learnwren/web-enrollment` (Task 8), `EnrollmentListItem` from shared models.
- Produces: `<lib-completed-courses />` standalone component, self-loading (no inputs).

- [ ] **Step 1: Write the failing tests**

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, beforeEach, expect, it, vi } from 'vitest';

import { EnrollmentService } from '@learnwren/web-enrollment';
import { CompletedCoursesComponent } from './completed-courses.component';

describe('CompletedCoursesComponent', () => {
  const listMyEnrollments = vi.fn();

  async function create(): Promise<ComponentFixture<CompletedCoursesComponent>> {
    await TestBed.configureTestingModule({
      imports: [CompletedCoursesComponent],
      providers: [
        provideRouter([]),
        { provide: EnrollmentService, useValue: { listMyEnrollments } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(CompletedCoursesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('lists completed courses with links to the catalog page', async () => {
    listMyEnrollments.mockResolvedValue({
      enrollments: [
        { courseId: 'c1', courseTitle: 'Done Course', completedAt: '2026-07-09T00:00:00.000Z' },
        { courseId: 'c2', courseTitle: 'In Progress', completedAt: null },
      ],
    });
    const fixture = await create();
    const links = fixture.nativeElement.querySelectorAll('[data-testid="completed-course-link"]');
    expect(links.length).toBe(1);
    expect(links[0].textContent).toContain('Done Course');
    expect(links[0].getAttribute('href')).toBe('/catalog/c1');
  });

  it('renders nothing when there are no completed courses', async () => {
    listMyEnrollments.mockResolvedValue({ enrollments: [] });
    const fixture = await create();
    expect(fixture.nativeElement.querySelector('[data-testid="completed-courses-section"]')).toBeNull();
  });

  it('renders nothing when the load fails', async () => {
    listMyEnrollments.mockRejectedValue(new Error('boom'));
    const fixture = await create();
    expect(fixture.nativeElement.querySelector('[data-testid="completed-courses-section"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test web-profile`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement**

`completed-courses.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import type { EnrollmentListItem } from '@learnwren/shared-data-models';
import { EnrollmentService } from '@learnwren/web-enrollment';

/**
 * "Completed courses" section on /settings/profile (US-06-02: the badge on
 * "my profile"). Self-loading; renders nothing while loading, on error, or
 * when the caller has completed nothing.
 */
@Component({
  selector: 'lib-completed-courses',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe],
  templateUrl: './completed-courses.component.html',
})
export class CompletedCoursesComponent implements OnInit {
  private readonly enrollments = inject(EnrollmentService);

  readonly completed = signal<EnrollmentListItem[]>([]);

  async ngOnInit(): Promise<void> {
    try {
      const view = await this.enrollments.listMyEnrollments();
      this.completed.set(view.enrollments.filter((e) => e.completedAt != null));
    } catch {
      // Section is decorative — a failed load just hides it.
    }
  }
}
```

`completed-courses.component.html` (style headings/text with the same Tailwind tokens `profile-page.component.html` uses for its section blocks — copy a sibling section's classes):

```html
@if (completed().length > 0) {
  <section data-testid="completed-courses-section">
    <h2>Completed courses</h2>
    <ul>
      @for (c of completed(); track c.courseId) {
        <li>
          <a data-testid="completed-course-link" [routerLink]="['/catalog', c.courseId]">
            🎉 {{ c.courseTitle }}
          </a>
          <span>Completed {{ c.completedAt | date: 'mediumDate' }}</span>
        </li>
      }
    </ul>
  </section>
}
```

Mount in `profile-page.component.html` after the existing profile sections (e.g. before the instructor-application section) with `<lib-completed-courses />`, and add `CompletedCoursesComponent` to the `imports` array of `ProfilePageComponent`. Check whether `profile-page.component.spec.ts` compiles the page with real children — if it errors on the new child's `EnrollmentService`, provide the same `{ listMyEnrollments }` stub there.

- [ ] **Step 4: Run tests, typecheck**

Run: `pnpm nx test web-profile && pnpm nx typecheck web`
Expected: PASS. web-profile newly imports web-enrollment — if `nx typecheck web` complains about a missing reference, add `../../libs/web-enrollment/tsconfig.lib.json` to `apps/web/tsconfig.spec.json` (known repo gotcha; it may already be there via web-catalog).

- [ ] **Step 5: Commit**

```bash
git add libs/web-profile/src/lib/completed-courses/ libs/web-profile/src/lib/profile-page/ apps/web/tsconfig.spec.json
git commit -m "feat(web-profile): Completed courses section on the profile page"
```

---

### Task 11: Docs, full verification, mutation gate

**Files:**
- Modify: `README.md` (EP-06 bullet list + "Not built yet" line + API endpoint tables)
- Modify: `docs/USER_GUIDE.md` (learning-experience section)
- Modify: `docs/superpowers/specs/2026-07-09-ep06-completion-rollups-design.md` (flip DRAFT banner only if the user approves)

- [ ] **Step 1: Update README.md**

Add an EP-06 rollups bullet alongside the Slice A–D bullets describing: module checkmarks in the outline, course-complete banner, persistent `completedAt` stamp (never cleared; lazy backfill on lesson view), Completed badge on detail page + catalog cards, profile Completed-courses section. Add `GET /api/enrollments` to the EP-05 Slice B endpoint table. Update the "Not built yet" line: remove "module / course completion rollups (rest of EP-06)"; EP-06/US-06-02 is now fully implemented.

- [ ] **Step 2: Update docs/USER_GUIDE.md**

Extend the learning-experience section with the same content, user-facing voice. Note the deliberate exclusions (no un-stamping, no certificates).

- [ ] **Step 3: Full verification**

```bash
pnpm nx affected -t lint test typecheck
```

Expected: all green. Then mutation-test the touched libs (repo standard is 100% or proven residuals):

```bash
pnpm nx run api-courses:mutation
pnpm nx run web-learn:mutation && pnpm nx run web-enrollment:mutation
pnpm nx run web-catalog:mutation && pnpm nx run web-profile:mutation
pnpm nx run shared-data-models:mutation
```

(Confirm the target name with `pnpm nx show project api-courses` first. NEVER run the no-arg mutation report script from a worktree — known clobber hazard for `docs/quality/mutation-report.md`.) Kill surviving mutants by strengthening tests; annotate genuine equivalents with `// Stryker disable` + reason, matching the existing catalogue style.

- [ ] **Step 4: Manual smoke (emulators)**

With `pnpm emulators` + `pnpm start`: register a student, enroll in a seeded course, complete all lessons, and observe: banner in the player, badge on the detail page, pill on the catalog card, section on the profile page.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/USER_GUIDE.md
git commit -m "docs: record EP-06 completion rollups (US-06-02 complete)"
```

---

## Execution notes

- Work in a git worktree off local `HEAD` per the user's standing preference (superpowers:using-git-worktrees; symlink `node_modules` to the parent, never `git add -A`, nuke stale `dist`/`out-tsc` with `NX_DAEMON=false` if typecheck goes weird after long runs).
- Tasks 1→5 are strictly ordered (each consumes the previous task's interface). Tasks 7–10 are independent of each other once Task 8's service method exists (7 needs nothing beyond Task 1's types — it can run any time after Task 1).
- Task 6 (api-e2e) needs live emulators + API; probe for orphaned api-serve processes from prior worktree runs before starting (known hazard).
