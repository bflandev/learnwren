# EP-07 Slice A — Enrolled Students Roster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a course owner a roster of their ACTIVE enrolled students (name, email, enrollment date, completed/total progress) on a dedicated `/courses/:cid/students` page, sortable by date and progress, exportable as CSV.

**Architecture:** A new `roster/` submodule in `api-courses` exposes an owner-guarded `GET /api/courses/:cid/students` returning a `CourseRosterView`. The server computes progress live (completed ÷ total lessons); the dataset is one course's active enrollments (small at this platform's scale). The Angular `web-courses` lib adds a standalone roster page that loads the view, sorts client-side, and builds the CSV in-browser.

**Tech Stack:** NestJS 11 + firebase-admin (Firestore), Angular 21 (standalone, signals, OnPush), Vitest, Playwright (api-e2e), Nx, pnpm.

**Spec:** `docs/superpowers/specs/2026-06-01-ep07-slice-a-enrolled-students-design.md`

---

## Conventions used in this plan

- Run a single project's unit tests with `pnpm nx test <project>`. The repo uses Vitest; a red step is "the new test fails", a green step is "the suite passes".
- Commit messages follow Conventional Commits. Commit at the end of every task.
- Every new API submodule file mirrors existing siblings in `libs/api-courses/src/lib/` (`catalog/`, `learn/`).
- **Never `git add -A`** in this worktree — its `node_modules` is a symlink that evades `.gitignore`. Always `git add <explicit paths>`.

---

## File Structure

**Create:**
- `libs/shared-data-models/src/lib/roster.ts` — `CourseRosterRow`, `CourseRosterView`.
- `libs/shared-data-models/src/lib/roster.spec.ts` — type/literal spec.
- `libs/api-courses/src/lib/roster/roster.service.ts` — roster computation.
- `libs/api-courses/src/lib/roster/roster.service.spec.ts`
- `libs/api-courses/src/lib/roster/roster.controller.ts` — `GET /courses/:cid/students`.
- `libs/api-courses/src/lib/roster/roster.controller.spec.ts`
- `apps/api-e2e/src/roster.e2e-spec.ts` — end-to-end owner-guard + roster shape.
- `libs/web-courses/src/lib/roster/roster-csv.util.ts` — pure CSV builder.
- `libs/web-courses/src/lib/roster/roster-csv.util.spec.ts`
- `libs/web-courses/src/lib/roster/roster.service.ts` — web HTTP wrapper.
- `libs/web-courses/src/lib/roster/roster.service.spec.ts`
- `libs/web-courses/src/lib/course-students-page/course-students-page.component.ts`
- `libs/web-courses/src/lib/course-students-page/course-students-page.component.html`
- `libs/web-courses/src/lib/course-students-page/course-students-page.component.spec.ts`

**Modify:**
- `libs/shared-data-models/src/index.ts` — export `./lib/roster`.
- `libs/api-courses/src/lib/enrollment/enrollment.repository.ts` — add `listActiveByCourse`.
- `libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts` — test it.
- `libs/api-courses/src/lib/courses.module.ts` — register `RosterController` + `RosterService`.
- `libs/web-courses/src/lib/courses.routes.ts` — add `:id/students` child route.
- `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.html` — add a "Students" link.
- `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.spec.ts` — assert the link.
- `README.md` — feature record + endpoint table.
- `docs/USER_GUIDE.md` — instructor roster entry.

**Design decisions locked here (refining spec open points):**
- **§2.2 user read:** `RosterService` reads `users/{uid}` directly via the `FIRESTORE` handle (a private `loadProfiles` helper). The public `InstructorDirectory` is *not* extended — email stays out of the public lookup and is only ever returned through the owner-guarded roster path.
- **§2 exception filter:** reuse the existing `CoursesExceptionFilter` (as `CatalogController` does). The roster is part of the courses feature and only throws `CoursesException`s (raised by `CourseOwnerGuard`). **No new filter file.**
- **§2.1 index:** the `where('courseId','==').where('status','==')` query uses **two equality filters**, which Firestore serves from automatic single-field indexes (zig-zag merge). **No composite index is required**, and the emulator never enforces indexes.

---

## Task 1: Shared types — `CourseRosterRow` / `CourseRosterView`

**Files:**
- Create: `libs/shared-data-models/src/lib/roster.ts`
- Create: `libs/shared-data-models/src/lib/roster.spec.ts`
- Modify: `libs/shared-data-models/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/shared-data-models/src/lib/roster.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { CourseId, ISODateString, UserId } from './common';
import type { CourseRosterRow, CourseRosterView } from './roster';

describe('roster model', () => {
  it('accepts a fully-populated CourseRosterRow literal', () => {
    const row: CourseRosterRow = {
      userId: 'u1' as UserId,
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      enrolledAt: '2026-05-22T10:00:00.000Z' as ISODateString,
      completedLessons: 7,
      totalLessons: 10,
      progressPercent: 70,
    };
    expect(row.progressPercent).toBe(70);
    expect(row.email).toContain('@');
  });

  it('accepts a CourseRosterView wrapping rows', () => {
    const view: CourseRosterView = {
      courseId: 'c1' as CourseId,
      totalLessons: 10,
      students: [],
    };
    expect(view.students).toEqual([]);
    expect(view.totalLessons).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test shared-data-models`
Expected: FAIL — `Cannot find module './roster'`.

- [ ] **Step 3: Create the types**

Create `libs/shared-data-models/src/lib/roster.ts`:

```ts
import type { CourseId, ISODateString, UserId } from './common';

/** One enrolled student's row in the instructor roster (US-07-01). */
export interface CourseRosterRow {
  userId: UserId;
  displayName: string;
  email: string;
  /** Enrollment.createdAt — when the student first enrolled. */
  enrolledAt: ISODateString;
  /** Distinct completed lessons that still exist in the course; never exceeds totalLessons. */
  completedLessons: number;
  /** Current lesson count of the course. */
  totalLessons: number;
  /** round(completedLessons / totalLessons * 100); 0 when totalLessons === 0. */
  progressPercent: number;
}

/** Response of GET /api/courses/:cid/students — owner-only roster view. */
export interface CourseRosterView {
  courseId: CourseId;
  totalLessons: number;
  /** ACTIVE enrollees, ordered enrolledAt descending (newest first). */
  students: CourseRosterRow[];
}
```

- [ ] **Step 4: Export from the barrel**

In `libs/shared-data-models/src/index.ts`, add after the `./lib/enrollment` line:

```ts
export * from './lib/roster';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test shared-data-models`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/shared-data-models/src/lib/roster.ts libs/shared-data-models/src/lib/roster.spec.ts libs/shared-data-models/src/index.ts
git commit -m "feat(shared): add CourseRosterRow/CourseRosterView types"
```

---

## Task 2: Repository — `listActiveByCourse`

**Files:**
- Modify: `libs/api-courses/src/lib/enrollment/enrollment.repository.ts`
- Modify: `libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts`

- [ ] **Step 1: Write the failing test**

Open `libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts` and add this test inside the top-level `describe`. (Match the file's existing Firestore stubbing style — read the file first; the example below uses a fake collection that returns docs filtered by the `where` chain. If the spec uses the real emulator instead, seed two enrollments and assert.)

```ts
it('listActiveByCourse returns only ACTIVE enrollments scoped to the course', async () => {
  // Arrange: two ACTIVE in course-1, one WITHDRAWN in course-1, one ACTIVE in course-2.
  await seedEnrollment({ userId: 'u1', courseId: 'course-1', status: 'ACTIVE' });
  await seedEnrollment({ userId: 'u2', courseId: 'course-1', status: 'ACTIVE' });
  await seedEnrollment({ userId: 'u3', courseId: 'course-1', status: 'WITHDRAWN' });
  await seedEnrollment({ userId: 'u4', courseId: 'course-2', status: 'ACTIVE' });

  const rows = await repo.listActiveByCourse('course-1' as CourseId);

  expect(rows.map((r) => r.userId).sort()).toEqual(['u1', 'u2']);
  expect(rows.every((r) => r.status === 'ACTIVE')).toBe(true);
});
```

> If the spec file has no `seedEnrollment` helper, write the enrollments directly via the same `db`/firestore fake the other tests use, setting `enrollments/{userId}__{courseId}` docs with at least `{ id, userId, courseId, status, progress: [], createdAt, updatedAt }`. Reuse the exact fake the file already wires up — do not introduce a second test harness.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — `repo.listActiveByCourse is not a function`.

- [ ] **Step 3: Implement the method**

In `libs/api-courses/src/lib/enrollment/enrollment.repository.ts`, add this method to the `EnrollmentRepository` class (next to `getEnrollment`):

```ts
/** All ACTIVE enrollments for a course — the instructor roster source (US-07-01). */
async listActiveByCourse(courseId: CourseId): Promise<Enrollment[]> {
  const snap = await this.db
    .collection(ENROLLMENTS)
    .where('courseId', '==', courseId)
    .where('status', '==', 'ACTIVE')
    .get();
  return snap.docs.map((d) => d.data() as Enrollment);
}
```

`Enrollment` and `CourseId` are already imported at the top of the file.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-courses`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/enrollment/enrollment.repository.ts libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts
git commit -m "feat(api-courses): listActiveByCourse on EnrollmentRepository"
```

---

## Task 3: `RosterService`

**Files:**
- Create: `libs/api-courses/src/lib/roster/roster.service.ts`
- Create: `libs/api-courses/src/lib/roster/roster.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-courses/src/lib/roster/roster.service.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Course,
  CourseId,
  Enrollment,
  ISODateString,
  Lesson,
  Module,
  UserId,
} from '@learnwren/shared-data-models';

import type { CoursesRepository } from '../courses.repository';
import type { EnrollmentRepository } from '../enrollment/enrollment.repository';
import { RosterService } from './roster.service';

const CID = 'course-1' as CourseId;
const course = { id: CID, title: 'Course One' } as Course;

function lesson(id: string): Lesson {
  return { id } as Lesson;
}
function mod(id: string): Module {
  return { id } as Module;
}
function enrollment(userId: string, completed: string[], createdAt: string): Enrollment {
  return {
    userId: userId as UserId,
    courseId: CID,
    status: 'ACTIVE',
    createdAt: createdAt as ISODateString,
    progress: completed.map((lid) => ({
      lessonId: lid as never,
      completedAt: '2026-05-30T00:00:00.000Z' as ISODateString,
      lastWatchedSeconds: 0,
    })),
  } as Enrollment;
}

describe('RosterService', () => {
  let courses: {
    listModulesByCourse: ReturnType<typeof vi.fn>;
    listLessonsByModule: ReturnType<typeof vi.fn>;
  };
  let enrollments: { listActiveByCourse: ReturnType<typeof vi.fn> };
  let firestore: { collection: ReturnType<typeof vi.fn> };
  let service: RosterService;

  function stubUser(uid: string, data: Record<string, unknown> | null) {
    return {
      get: vi.fn().mockResolvedValue({ exists: data !== null, data: () => data }),
    };
  }

  beforeEach(() => {
    courses = {
      listModulesByCourse: vi.fn().mockResolvedValue([mod('m1')]),
      listLessonsByModule: vi.fn().mockResolvedValue([lesson('l1'), lesson('l2'), lesson('l3')]),
    };
    enrollments = { listActiveByCourse: vi.fn() };
    const users: Record<string, Record<string, unknown> | null> = {
      u1: { displayName: 'Ada', email: 'ada@example.com' },
      u2: { displayName: 'Bo', email: 'bo@example.com' },
    };
    firestore = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn((uid: string) => stubUser(uid, users[uid] ?? null)),
      }),
    };
    service = new RosterService(
      courses as unknown as CoursesRepository,
      enrollments as unknown as EnrollmentRepository,
      firestore as never,
    );
  });

  it('computes progress as distinct completed ÷ total lessons and joins name/email', async () => {
    enrollments.listActiveByCourse.mockResolvedValue([
      enrollment('u1', ['l1', 'l2'], '2026-05-20T00:00:00.000Z'),
    ]);
    const view = await service.getRoster(course);
    expect(view.totalLessons).toBe(3);
    expect(view.students).toHaveLength(1);
    expect(view.students[0]).toMatchObject({
      userId: 'u1',
      displayName: 'Ada',
      email: 'ada@example.com',
      completedLessons: 2,
      totalLessons: 3,
      progressPercent: 67,
    });
  });

  it('excludes completions for lessons that no longer exist and never exceeds total', async () => {
    enrollments.listActiveByCourse.mockResolvedValue([
      enrollment('u1', ['l1', 'l2', 'l3', 'deleted-lesson'], '2026-05-20T00:00:00.000Z'),
    ]);
    const view = await service.getRoster(course);
    expect(view.students[0].completedLessons).toBe(3);
    expect(view.students[0].progressPercent).toBe(100);
  });

  it('orders rows by enrolledAt descending (newest first)', async () => {
    enrollments.listActiveByCourse.mockResolvedValue([
      enrollment('u1', [], '2026-05-20T00:00:00.000Z'),
      enrollment('u2', [], '2026-05-25T00:00:00.000Z'),
    ]);
    const view = await service.getRoster(course);
    expect(view.students.map((s) => s.userId)).toEqual(['u2', 'u1']);
  });

  it('falls back to a default name and empty email when the user doc is missing', async () => {
    enrollments.listActiveByCourse.mockResolvedValue([
      enrollment('ghost', [], '2026-05-20T00:00:00.000Z'),
    ]);
    const view = await service.getRoster(course);
    expect(view.students[0].displayName).toBe('Student');
    expect(view.students[0].email).toBe('');
  });

  it('reports 0% with no divide-by-zero when the course has no lessons', async () => {
    courses.listModulesByCourse.mockResolvedValue([]);
    enrollments.listActiveByCourse.mockResolvedValue([
      enrollment('u1', [], '2026-05-20T00:00:00.000Z'),
    ]);
    const view = await service.getRoster(course);
    expect(view.totalLessons).toBe(0);
    expect(view.students[0].progressPercent).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — `Cannot find module './roster.service'`.

- [ ] **Step 3: Implement the service**

Create `libs/api-courses/src/lib/roster/roster.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type {
  Course,
  CourseRosterRow,
  CourseRosterView,
  User,
  UserId,
} from '@learnwren/shared-data-models';

import { CoursesRepository } from '../courses.repository';
import { EnrollmentRepository } from '../enrollment/enrollment.repository';

const USERS = 'users';
const FALLBACK_NAME = 'Student';

interface ProfileRef {
  displayName: string;
  email: string;
}

@Injectable()
export class RosterService {
  constructor(
    private readonly courses: CoursesRepository,
    private readonly enrollments: EnrollmentRepository,
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
  ) {}

  /** Owner-only roster of ACTIVE enrollees with computed completion. */
  async getRoster(course: Course): Promise<CourseRosterView> {
    const modules = await this.courses.listModulesByCourse(course.id);
    const lessonsByModule = await Promise.all(
      modules.map((m) => this.courses.listLessonsByModule(course.id, m.id)),
    );
    const lessonIds = new Set(lessonsByModule.flat().map((l) => l.id));
    const totalLessons = lessonIds.size;

    const enrollments = await this.enrollments.listActiveByCourse(course.id);
    const profiles = await this.loadProfiles(enrollments.map((e) => e.userId));

    const students: CourseRosterRow[] = enrollments
      .map((e): CourseRosterRow => {
        const completed = new Set(
          e.progress
            .filter((p) => p.completedAt != null && lessonIds.has(p.lessonId))
            .map((p) => p.lessonId),
        );
        const completedLessons = completed.size;
        const progressPercent =
          totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100);
        const profile = profiles.get(e.userId) ?? { displayName: FALLBACK_NAME, email: '' };
        return {
          userId: e.userId,
          displayName: profile.displayName,
          email: profile.email,
          enrolledAt: e.createdAt,
          completedLessons,
          totalLessons,
          progressPercent,
        };
      })
      .sort((a, b) => b.enrolledAt.localeCompare(a.enrolledAt));

    return { courseId: course.id, totalLessons, students };
  }

  /** Batch-read name + email from users/{uid}. Owner-guarded path only. */
  private async loadProfiles(uids: UserId[]): Promise<Map<UserId, ProfileRef>> {
    const unique = [...new Set(uids)];
    const entries = await Promise.all(
      unique.map(async (uid): Promise<[UserId, ProfileRef]> => {
        const snap = await this.firestore.collection(USERS).doc(uid).get();
        const data = snap.exists ? (snap.data() as User) : undefined;
        return [uid, { displayName: data?.displayName ?? FALLBACK_NAME, email: data?.email ?? '' }];
      }),
    );
    return new Map(entries);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-courses`
Expected: PASS (all 5 RosterService tests).

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/roster/roster.service.ts libs/api-courses/src/lib/roster/roster.service.spec.ts
git commit -m "feat(api-courses): RosterService computes enrolled-student roster"
```

---

## Task 4: `RosterController` + module wiring

**Files:**
- Create: `libs/api-courses/src/lib/roster/roster.controller.ts`
- Create: `libs/api-courses/src/lib/roster/roster.controller.spec.ts`
- Modify: `libs/api-courses/src/lib/courses.module.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-courses/src/lib/roster/roster.controller.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Course, CourseId, CourseRosterView } from '@learnwren/shared-data-models';

import type { CourseScopedRequest } from '../types/loaded-course';
import { RosterController } from './roster.controller';
import type { RosterService } from './roster.service';

const CID = 'course-1' as CourseId;
const course = { id: CID } as Course;

describe('RosterController', () => {
  let svc: { getRoster: ReturnType<typeof vi.fn> };
  let controller: RosterController;

  beforeEach(() => {
    svc = {
      getRoster: vi.fn().mockResolvedValue({
        courseId: CID,
        totalLessons: 0,
        students: [],
      } as CourseRosterView),
    };
    controller = new RosterController(svc as unknown as RosterService);
  });

  it('GET :cid/students delegates the guard-loaded course to the service', async () => {
    const req = { user: { uid: 'owner' }, course } as CourseScopedRequest;
    const view = await controller.getStudents(req);
    expect(svc.getRoster).toHaveBeenCalledWith(course);
    expect(view.courseId).toBe(CID);
  });

  it('throws if the owner guard did not attach the course', async () => {
    const req = { user: { uid: 'owner' } } as CourseScopedRequest;
    await expect(controller.getStudents(req)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — `Cannot find module './roster.controller'`.

- [ ] **Step 3: Implement the controller**

Create `libs/api-courses/src/lib/roster/roster.controller.ts`:

```ts
import { Controller, Get, Req, UseFilters, UseGuards } from '@nestjs/common';

import type { CourseRosterView } from '@learnwren/shared-data-models';

import { FirebaseSessionGuard } from '@learnwren/api-auth';

import { CourseOwnerGuard } from '../course-owner.guard';
import { CoursesExceptionFilter } from '../courses.exception-filter';
import type { CourseScopedRequest } from '../types/loaded-course';
import { RosterService } from './roster.service';

/**
 * Owner-only enrolled-students roster (US-07-01). `CourseOwnerGuard` loads and
 * authorizes the course (404 missing / 403 not-owner) and attaches it to the
 * request; the session guard supplies the authenticated user (401 otherwise).
 */
@Controller('courses')
@UseFilters(CoursesExceptionFilter)
@UseGuards(FirebaseSessionGuard)
export class RosterController {
  constructor(private readonly service: RosterService) {}

  @Get(':cid/students')
  @UseGuards(CourseOwnerGuard)
  getStudents(@Req() req: CourseScopedRequest): Promise<CourseRosterView> {
    if (!req.course) {
      throw new Error('RosterController: CourseOwnerGuard did not attach course');
    }
    return this.service.getRoster(req.course);
  }
}
```

- [ ] **Step 4: Wire into the module**

In `libs/api-courses/src/lib/courses.module.ts`:

Add imports near the other roster-adjacent imports:

```ts
import { RosterController } from './roster/roster.controller';
import { RosterService } from './roster/roster.service';
```

Add `RosterController` to the `controllers` array:

```ts
controllers: [CoursesController, CatalogController, EnrollmentController, LearnController, CoverController, RosterController],
```

Add `RosterService` to the `providers` array (anywhere in the list):

```ts
    RosterService,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm nx test api-courses`
Expected: PASS (controller + service + repository).

- [ ] **Step 6: Typecheck the API build wiring**

Run: `pnpm nx typecheck api-courses`
Expected: PASS (DI graph resolves; no unused imports).

- [ ] **Step 7: Commit**

```bash
git add libs/api-courses/src/lib/roster/roster.controller.ts libs/api-courses/src/lib/roster/roster.controller.spec.ts libs/api-courses/src/lib/courses.module.ts
git commit -m "feat(api-courses): GET /courses/:cid/students roster endpoint"
```

---

## Task 5: api-e2e — owner guard + roster shape

**Files:**
- Create: `apps/api-e2e/src/roster.e2e-spec.ts`

> This suite needs the emulator + API running: `pnpm emulators` and `pnpm start:api` in separate terminals before `pnpm nx e2e api-e2e`.

- [ ] **Step 1: Write the e2e test**

Create `apps/api-e2e/src/roster.e2e-spec.ts`:

```ts
// NOTE: Run `pnpm emulators` and `pnpm start:api` before executing this suite.
import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

import {
  API_BASE,
  initAdmin,
  registerAndPromoteInstructor,
  registerStudent,
  withAnonRequest,
} from './_helpers/auth';

initAdmin();

async function seedPublishedCourse(instructorId: string): Promise<{ cid: string; lessonIds: string[] }> {
  const cid = `roster-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();
  const db = admin.firestore();
  await db.collection('courses').doc(cid).set({
    id: cid,
    title: 'Roster e2e course',
    description: 'course',
    instructorId,
    status: 'PUBLISHED',
    enrollmentCount: 0,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  const mid = `${cid}-m1`;
  await db.collection('courses').doc(cid).collection('modules').doc(mid).set({
    id: mid,
    courseId: cid,
    title: 'Module 1',
    order: 0,
    createdAt: now,
    updatedAt: now,
  });
  const lessonIds = [`${cid}-l1`, `${cid}-l2`];
  for (let i = 0; i < lessonIds.length; i += 1) {
    await db
      .collection('courses')
      .doc(cid)
      .collection('modules')
      .doc(mid)
      .collection('lessons')
      .doc(lessonIds[i])
      .set({
        id: lessonIds[i],
        moduleId: mid,
        courseId: cid,
        title: `Lesson ${i + 1}`,
        order: i,
        createdAt: now,
        updatedAt: now,
      });
  }
  return { cid, lessonIds };
}

test('owner sees an ACTIVE enrollee with computed progress', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const student = await registerStudent(request);
  const { cid, lessonIds } = await seedPublishedCourse(instructor.uid);

  // Enroll the student via the public API, then complete one of two lessons.
  await request.post(`${API_BASE}/enrollments`, {
    headers: { cookie: student.cookieHeader },
    data: { courseId: cid },
  });
  await request.post(`${API_BASE}/learn/courses/${cid}/lessons/${lessonIds[0]}/complete`, {
    headers: { cookie: student.cookieHeader },
  });

  const res = await request.get(`${API_BASE}/courses/${cid}/students`, {
    headers: { cookie: instructor.cookieHeader },
  });
  expect(res.status()).toBe(200);
  const view = await res.json();
  expect(view.totalLessons).toBe(2);
  expect(view.students).toHaveLength(1);
  expect(view.students[0]).toMatchObject({
    userId: student.uid,
    completedLessons: 1,
    totalLessons: 2,
    progressPercent: 50,
  });
  expect(typeof view.students[0].email).toBe('string');
});

test('a non-owner instructor is forbidden', async ({ request }) => {
  const owner = await registerAndPromoteInstructor(request);
  const stranger = await registerAndPromoteInstructor(request);
  const { cid } = await seedPublishedCourse(owner.uid);

  const res = await request.get(`${API_BASE}/courses/${cid}/students`, {
    headers: { cookie: stranger.cookieHeader },
  });
  expect(res.status()).toBe(403);
});

test('an unauthenticated request is rejected', async ({ request }) => {
  const owner = await registerAndPromoteInstructor(request);
  const { cid } = await seedPublishedCourse(owner.uid);

  await withAnonRequest(async (anon) => {
    const res = await anon.get(`${API_BASE}/courses/${cid}/students`);
    expect(res.status()).toBe(401);
  });
});
```

> Verify the seeded subcollection paths (`courses/{cid}/modules/{mid}/lessons/{lid}`) match what `CoursesRepository.listModulesByCourse` / `listLessonsByModule` read — open `courses.repository.ts` and confirm the collection names. Adjust the seed if the repository uses different paths.

- [ ] **Step 2: Run the suite**

Run (with emulator + API up): `pnpm nx e2e api-e2e --grep roster`
Expected: PASS — 3 tests (owner 200 with progress, non-owner 403, anon 401).

- [ ] **Step 3: Commit**

```bash
git add apps/api-e2e/src/roster.e2e-spec.ts
git commit -m "test(api-e2e): roster endpoint owner-guard and progress"
```

---

## Task 6: Web CSV builder (pure util)

**Files:**
- Create: `libs/web-courses/src/lib/roster/roster-csv.util.ts`
- Create: `libs/web-courses/src/lib/roster/roster-csv.util.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web-courses/src/lib/roster/roster-csv.util.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { CourseRosterRow } from '@learnwren/shared-data-models';

import { rosterRowsToCsv } from './roster-csv.util';

function row(partial: Partial<CourseRosterRow>): CourseRosterRow {
  return {
    userId: 'u' as never,
    displayName: 'Ada',
    email: 'ada@example.com',
    enrolledAt: '2026-05-22T10:00:00.000Z' as never,
    completedLessons: 7,
    totalLessons: 10,
    progressPercent: 70,
    ...partial,
  };
}

describe('rosterRowsToCsv', () => {
  it('emits a header row and one data row per student', () => {
    const csv = rosterRowsToCsv([row({})]);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('"Display Name","Email","Enrollment Date","Progress (%)"');
    expect(lines[1]).toBe('"Ada","ada@example.com","2026-05-22","70"');
  });

  it('quotes and escapes fields containing commas, quotes, and newlines', () => {
    const csv = rosterRowsToCsv([row({ displayName: 'Doe, "Jane"\nJr' })]);
    expect(csv).toContain('"Doe, ""Jane""\nJr"');
  });

  it('renders the enrollment date as YYYY-MM-DD', () => {
    const csv = rosterRowsToCsv([row({ enrolledAt: '2026-01-09T23:59:00.000Z' as never })]);
    expect(csv).toContain('"2026-01-09"');
  });

  it('returns just the header for an empty roster', () => {
    expect(rosterRowsToCsv([]).trim()).toBe('"Display Name","Email","Enrollment Date","Progress (%)"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-courses`
Expected: FAIL — `Cannot find module './roster-csv.util'`.

- [ ] **Step 3: Implement the util**

Create `libs/web-courses/src/lib/roster/roster-csv.util.ts`:

```ts
import type { CourseRosterRow } from '@learnwren/shared-data-models';

const HEADERS = ['Display Name', 'Email', 'Enrollment Date', 'Progress (%)'];

/** RFC-4180 field: wrap in quotes, double any internal quote. */
function field(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** ISO timestamp → YYYY-MM-DD (the calendar date portion). */
function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

/** Build an RFC-4180 CSV (CRLF line endings) from roster rows. */
export function rosterRowsToCsv(rows: CourseRosterRow[]): string {
  const lines = [HEADERS.map(field).join(',')];
  for (const r of rows) {
    lines.push(
      [
        field(r.displayName),
        field(r.email),
        field(isoDate(r.enrolledAt)),
        field(String(r.progressPercent)),
      ].join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test web-courses`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-courses/src/lib/roster/roster-csv.util.ts libs/web-courses/src/lib/roster/roster-csv.util.spec.ts
git commit -m "feat(web-courses): RFC-4180 roster CSV builder"
```

---

## Task 7: Web `RosterService` (HTTP wrapper)

**Files:**
- Create: `libs/web-courses/src/lib/roster/roster.service.ts`
- Create: `libs/web-courses/src/lib/roster/roster.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web-courses/src/lib/roster/roster.service.spec.ts`:

```ts
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { CourseRosterView } from '@learnwren/shared-data-models';

import { RosterService } from './roster.service';

describe('RosterService (web)', () => {
  let service: RosterService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RosterService);
    http = TestBed.inject(HttpTestingController);
  });

  it('GETs /api/courses/:cid/students with credentials', async () => {
    const promise = service.getRoster('course-1');
    const reqs = http.match('/api/courses/course-1/students');
    expect(reqs).toHaveLength(1);
    expect(reqs[0].request.method).toBe('GET');
    expect(reqs[0].request.withCredentials).toBe(true);
    reqs[0].flush({ courseId: 'course-1', totalLessons: 0, students: [] } as CourseRosterView);
    const view = await promise;
    expect(view.courseId).toBe('course-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-courses`
Expected: FAIL — `Cannot find module './roster.service'`.

- [ ] **Step 3: Implement the service**

Create `libs/web-courses/src/lib/roster/roster.service.ts`:

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { CourseRosterView } from '@learnwren/shared-data-models';

const OPTS = { withCredentials: true } as const;

@Injectable({ providedIn: 'root' })
export class RosterService {
  private readonly http = inject(HttpClient);

  getRoster(cid: string): Promise<CourseRosterView> {
    return firstValueFrom(
      this.http.get<CourseRosterView>(`/api/courses/${cid}/students`, OPTS),
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test web-courses`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-courses/src/lib/roster/roster.service.ts libs/web-courses/src/lib/roster/roster.service.spec.ts
git commit -m "feat(web-courses): RosterService HTTP wrapper"
```

---

## Task 8: `CourseStudentsPageComponent` + route

**Files:**
- Create: `libs/web-courses/src/lib/course-students-page/course-students-page.component.ts`
- Create: `libs/web-courses/src/lib/course-students-page/course-students-page.component.html`
- Create: `libs/web-courses/src/lib/course-students-page/course-students-page.component.spec.ts`
- Modify: `libs/web-courses/src/lib/courses.routes.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web-courses/src/lib/course-students-page/course-students-page.component.spec.ts`:

```ts
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import type { CourseRosterView } from '@learnwren/shared-data-models';

import { CourseStudentsPageComponent } from './course-students-page.component';

const VIEW: CourseRosterView = {
  courseId: 'course-1' as never,
  totalLessons: 10,
  students: [
    {
      userId: 'u1' as never,
      displayName: 'Ada',
      email: 'ada@example.com',
      enrolledAt: '2026-05-20T00:00:00.000Z' as never,
      completedLessons: 5,
      totalLessons: 10,
      progressPercent: 50,
    },
    {
      userId: 'u2' as never,
      displayName: 'Bo',
      email: 'bo@example.com',
      enrolledAt: '2026-05-25T00:00:00.000Z' as never,
      completedLessons: 9,
      totalLessons: 10,
      progressPercent: 90,
    },
  ],
};

function setup() {
  TestBed.configureTestingModule({
    imports: [CourseStudentsPageComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: of(new Map([['id', 'course-1']])) } },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(CourseStudentsPageComponent);
  fixture.detectChanges();
  return { http, fixture };
}

describe('CourseStudentsPageComponent', () => {
  let http: HttpTestingController;

  it('renders a row per enrolled student with name, email and progress', async () => {
    const s = setup();
    http = s.http;
    http.expectOne('/api/courses/course-1/students').flush(VIEW);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const text = (s.fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Ada');
    expect(text).toContain('ada@example.com');
    expect(text).toContain('90%');
  });

  it('defaults to newest-first by enrollment date', async () => {
    const s = setup();
    http = s.http;
    http.expectOne('/api/courses/course-1/students').flush(VIEW);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const names = Array.from(
      (s.fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="student-name"]'),
    ).map((el) => el.textContent?.trim());
    expect(names).toEqual(['Bo', 'Ada']); // Bo enrolled 05-25, Ada 05-20
  });

  it('sorts by progress ascending when the progress header is toggled', async () => {
    const s = setup();
    http = s.http;
    http.expectOne('/api/courses/course-1/students').flush(VIEW);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const comp = s.fixture.componentInstance;
    comp.toggleSort('progress'); // first toggle on a new key => ascending
    s.fixture.detectChanges();
    const names = Array.from(
      (s.fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="student-name"]'),
    ).map((el) => el.textContent?.trim());
    expect(names).toEqual(['Ada', 'Bo']); // 50% then 90%
  });

  it('shows the empty state when no students are enrolled', async () => {
    const s = setup();
    http = s.http;
    http.expectOne('/api/courses/course-1/students').flush({
      courseId: 'course-1',
      totalLessons: 10,
      students: [],
    } as CourseRosterView);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    expect((s.fixture.nativeElement as HTMLElement).textContent).toContain(
      'No students enrolled yet',
    );
  });

  it('shows an error state when the load fails', async () => {
    const s = setup();
    http = s.http;
    http
      .expectOne('/api/courses/course-1/students')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    expect((s.fixture.nativeElement as HTMLElement).textContent?.toLowerCase()).toContain(
      'could not load',
    );
  });

  it('exposes an Export CSV control', async () => {
    const s = setup();
    http = s.http;
    http.expectOne('/api/courses/course-1/students').flush(VIEW);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    expect(
      (s.fixture.nativeElement as HTMLElement).querySelector('[data-testid="export-csv"]'),
    ).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-courses`
Expected: FAIL — `Cannot find module './course-students-page.component'`.

- [ ] **Step 3: Implement the component**

Create `libs/web-courses/src/lib/course-students-page/course-students-page.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import type { CourseRosterRow, CourseRosterView } from '@learnwren/shared-data-models';
import { LwCardComponent } from '@learnwren/web-ui';

import { rosterRowsToCsv } from '../roster/roster-csv.util';
import { RosterService } from '../roster/roster.service';

type SortKey = 'enrolledAt' | 'progress';
type SortDir = 'asc' | 'desc';
type State = 'loading' | 'loaded' | 'error';

@Component({
  selector: 'lib-course-students-page',
  standalone: true,
  imports: [RouterLink, LwCardComponent],
  templateUrl: './course-students-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseStudentsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(RosterService);

  private readonly paramMap = toSignal(this.route.paramMap);
  readonly cid = computed(() => this.paramMap()?.get('id') ?? '');

  readonly state = signal<State>('loading');
  readonly view = signal<CourseRosterView | null>(null);
  readonly sortKey = signal<SortKey>('enrolledAt');
  readonly sortDir = signal<SortDir>('desc');

  readonly rows = computed<CourseRosterRow[]>(() => {
    const students = this.view()?.students ?? [];
    const key = this.sortKey();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    return [...students].sort((a, b) => {
      const cmp =
        key === 'progress'
          ? a.progressPercent - b.progressPercent
          : a.enrolledAt.localeCompare(b.enrolledAt);
      return cmp * dir;
    });
  });

  constructor() {
    this.load();
  }

  async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.view.set(await this.service.getRoster(this.cid()));
      this.state.set('loaded');
    } catch {
      this.state.set('error');
    }
  }

  /** Toggle direction when re-selecting the active key; otherwise switch key (ascending). */
  toggleSort(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortKey.set(key);
      this.sortDir.set('asc');
    }
  }

  exportCsv(): void {
    const csv = rosterRowsToCsv(this.rows());
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `course-${this.cid()}-students.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
```

- [ ] **Step 4: Create the template**

Create `libs/web-courses/src/lib/course-students-page/course-students-page.component.html`:

```html
<section class="mx-auto max-w-4xl p-4">
  <header class="mb-5 flex items-center justify-between">
    <div>
      <a [routerLink]="['/courses', cid(), 'edit']" class="text-sm text-ochre hover:underline"
        >← Back to course</a
      >
      <h1 class="mt-1 font-serif text-2xl text-ink">Enrolled students</h1>
    </div>
    @if (state() === 'loaded' && rows().length > 0) {
      <button
        type="button"
        data-testid="export-csv"
        class="lw-btn lw-btn-secondary"
        (click)="exportCsv()"
      >
        Export CSV
      </button>
    }
  </header>

  @switch (state()) {
    @case ('loading') {
      <p class="text-ink-3">Loading…</p>
    }
    @case ('error') {
      <lw-card>
        <p class="text-bad">We could not load the student list.</p>
        <button type="button" class="lw-btn lw-btn-secondary mt-3" (click)="load()">Try again</button>
      </lw-card>
    }
    @case ('loaded') {
      @if (rows().length === 0) {
        <lw-card>
          <p class="text-ink-2">No students enrolled yet.</p>
        </lw-card>
      } @else {
        <lw-card>
          <table class="w-full text-left text-sm">
            <thead class="text-ink-3">
              <tr>
                <th class="py-2">Name</th>
                <th class="py-2">Email</th>
                <th class="py-2">
                  <button type="button" class="hover:underline" (click)="toggleSort('enrolledAt')">
                    Enrolled
                    @if (sortKey() === 'enrolledAt') {
                      <span aria-hidden="true">{{ sortDir() === 'asc' ? '▲' : '▼' }}</span>
                    }
                  </button>
                </th>
                <th class="py-2">
                  <button type="button" class="hover:underline" (click)="toggleSort('progress')">
                    Progress
                    @if (sortKey() === 'progress') {
                      <span aria-hidden="true">{{ sortDir() === 'asc' ? '▲' : '▼' }}</span>
                    }
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.userId) {
                <tr class="border-t border-bg-2">
                  <td class="py-2 text-ink" data-testid="student-name">{{ row.displayName }}</td>
                  <td class="py-2 text-ink-2">{{ row.email }}</td>
                  <td class="py-2 text-ink-2">{{ row.enrolledAt | date: 'mediumDate' }}</td>
                  <td class="py-2 text-ink-2">
                    {{ row.completedLessons }} / {{ row.totalLessons }} · {{ row.progressPercent }}%
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </lw-card>
      }
    }
  }
</section>
```

> The template uses the `date` pipe — add `DatePipe` to the component `imports` if your Angular config does not provide it standalone. If the build complains about `date`, add `import { DatePipe } from '@angular/common';` and include `DatePipe` in `imports`.

- [ ] **Step 5: Register the route**

In `libs/web-courses/src/lib/courses.routes.ts`, add a child after the `:id/edit` route:

```ts
      {
        path: ':id/students',
        loadComponent: () =>
          import('./course-students-page/course-students-page.component').then(
            (m) => m.CourseStudentsPageComponent,
          ),
      },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm nx test web-courses`
Expected: PASS (all 6 component tests + the util + service).

- [ ] **Step 7: Commit**

```bash
git add libs/web-courses/src/lib/course-students-page libs/web-courses/src/lib/courses.routes.ts
git commit -m "feat(web-courses): enrolled-students roster page at /courses/:id/students"
```

---

## Task 9: "Students" link in the course editor

**Files:**
- Modify: `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.html`
- Modify: `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Open `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.spec.ts`. Add a test that asserts a Students link exists once the course tree has loaded. Mirror the file's existing setup (it already loads a tree via `HttpTestingController`); add:

```ts
it('links to the students roster for the course', async () => {
  // ... reuse the spec's existing arrange that flushes a course tree for `cid` ...
  const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
    '[data-testid="view-students"]',
  );
  expect(link).not.toBeNull();
  expect(link!.getAttribute('ng-reflect-router-link') ?? link!.getAttribute('href')).toContain(
    '/students',
  );
});
```

> Read the existing spec first and copy its exact arrange block (how it provides the route param and flushes the tree) so this test reaches the loaded state. Assert on `data-testid="view-students"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-courses`
Expected: FAIL — the `[data-testid="view-students"]` element does not exist yet.

- [ ] **Step 3: Add the link**

In `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.html`, replace the header block:

```html
  <header class="mb-5">
    <a routerLink="/courses" class="text-sm text-ochre hover:underline">← My Courses</a>
  </header>
```

with:

```html
  <header class="mb-5 flex items-center justify-between">
    <a routerLink="/courses" class="text-sm text-ochre hover:underline">← My Courses</a>
    <a
      [routerLink]="['/courses', cid(), 'students']"
      data-testid="view-students"
      class="text-sm text-ochre hover:underline"
      >Students</a
    >
  </header>
```

`cid()` is already a signal on the editor component (`computed` over the `id` route param). `RouterLink` is already imported.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test web-courses`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-courses/src/lib/course-editor-page/course-editor-page.component.html libs/web-courses/src/lib/course-editor-page/course-editor-page.component.spec.ts
git commit -m "feat(web-courses): Students link from the course editor header"
```

---

## Task 10: Docs — README + USER_GUIDE

**Files:**
- Modify: `README.md`
- Modify: `docs/USER_GUIDE.md`

- [ ] **Step 1: Update the README feature record**

In `README.md`, under the status callout, add a bullet after the EP-06 Slice D bullet:

```markdown
> - **EP-07 Slice A: Enrolled students roster (US-07-01)** — a course owner opens **Students** from the course editor to reach `/courses/:cid/students`, a table of the course's ACTIVE enrollees showing display name, email, enrollment date, and progress (completed ÷ total lessons). Sortable by enrollment date and progress; exportable as an RFC-4180 CSV generated in-browser. Owner-only (`GET /api/courses/:cid/students`, `CourseOwnerGuard`). Analytics (US-07-02) and new-module notifications (US-07-03) are deferred to later EP-07 slices.
```

Update the "Not built yet" line: change `instructor dashboard (EP-07)` to `the rest of the instructor dashboard (EP-07 Slices B–C: analytics, new-module notifications)`.

- [ ] **Step 2: Add the endpoint to the README API tables**

Add a new table after the EP-06 endpoints table:

```markdown
The API endpoints exposed by EP-07 Slice A (instructor roster — session cookie + course owner required):

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/courses/:cid/students` | The course owner's roster of ACTIVE enrollees: display name, email, enrollment date, completed/total lessons, progress %. `403` for non-owners, `404` for a missing course. |
```

- [ ] **Step 3: Update USER_GUIDE**

In `docs/USER_GUIDE.md`, add a short instructor-roster entry consistent with the file's existing structure (find the instructor/course-management section; add a paragraph describing the Students page, the four columns, sorting, and CSV export, and note that only ACTIVE enrollees appear).

- [ ] **Step 4: Commit**

```bash
git add README.md docs/USER_GUIDE.md
git commit -m "docs(ep07): record enrolled-students roster (Slice A)"
```

---

## Task 11: Verification gate

**Files:** none (verification only).

- [ ] **Step 1: Sync TS project references**

Run: `pnpm nx sync`
Expected: succeeds; if it writes tsconfig reference updates, commit them:

```bash
git add tsconfig*.json '**/tsconfig*.json'
git commit -m "chore: nx sync project references for roster"
```

(Skip the commit if `git status` shows nothing changed.)

- [ ] **Step 2: Run affected lint, test, typecheck, build**

Run: `pnpm nx run-many -t lint test typecheck build -p shared-data-models api-courses web-courses`
Expected: all green.

- [ ] **Step 3: Run the api-e2e roster suite**

With `pnpm emulators` and `pnpm start:api` running:

Run: `pnpm nx e2e api-e2e --grep roster`
Expected: 3 tests pass.

- [ ] **Step 4: Browser walk-through**

With `pnpm emulators` + `pnpm start` running, as an instructor with a PUBLISHED course that has at least one enrolled student:
1. Open the course editor → click **Students**.
2. Confirm the table shows name, email, enrollment date, and progress, legible on the dark theme.
3. Toggle the **Enrolled** and **Progress** headers — rows reorder.
4. Click **Export CSV** — a `course-<id>-students.csv` downloads; open it and confirm the header row and one row per student, with any comma/quote in a name correctly quoted.
5. Visit `/courses/:cid/students` for a course you do **not** own → the UI surfaces the error/forbidden state (the API returns 403).

- [ ] **Step 5: Mutation check (quality bar)**

Run the two affected libs' Stryker configs and confirm each stays ≥ 80% adjusted:

Run: `pnpm exec stryker run stryker.api-courses.config.mjs`
Run: `pnpm exec stryker run stryker.web-courses.config.mjs`

If new survivors in the roster code drop a lib below the bar, add targeted assertions (e.g., assert the exact `progressPercent` value, the sort order both directions, the CSV escaping) and re-run. Do **not** run the no-arg consolidated `report.mjs` from this worktree (it would clobber `docs/quality/mutation-report.md`).

- [ ] **Step 6: Final confirmation**

Run: `git log --oneline origin/main..HEAD`
Expected: the task commits in order. The branch `feat/ep07-slice-a-roster` is ready to merge to `main` via `git merge --no-ff` (per the project's branch-isolation workflow).

---

## Self-Review (completed by plan author)

**Spec coverage:**
- §1 shared types → Task 1. ✅
- §2 API service/controller/guards → Tasks 3, 4. ✅ (filter: reuse `CoursesExceptionFilter`, decision recorded.)
- §2.1 `listActiveByCourse` (+ index note) → Task 2 (index determined unnecessary — two equality filters). ✅
- §2.2 user name+email read, owner-guarded only → Task 3 `loadProfiles`. ✅
- §3 web service/component/route/sort/CSV/states/entry-link → Tasks 6, 7, 8, 9. ✅
- §4 error handling (401/403/404, zero lessons, missing user, deleted lesson) → covered by Task 3 unit tests + Task 5 e2e + Task 8 error state. ✅
- §5 testing (shared, api unit + e2e, web, mutation) → Tasks 1–9 tests + Task 11. ✅
- §6 decomposition order → Tasks 1→11 build bottom-up. ✅

**Placeholder scan:** No TBD/TODO. Two steps instruct reading an existing spec's arrange block before copying it (Task 2 enrollment repo, Task 9 editor spec) — unavoidable because those files' fixtures must be reused verbatim; the assertion to add is given in full.

**Type consistency:** `CourseRosterView`/`CourseRosterRow` field names (`completedLessons`, `totalLessons`, `progressPercent`, `enrolledAt`) are identical across Tasks 1, 3, 6, 7, 8. `getRoster(course)` signature matches between service (Task 3) and controller (Task 4). `rosterRowsToCsv` matches between Task 6 and Task 8. Route param `id` matches the editor convention and the component (Task 8) + link (Task 9).
