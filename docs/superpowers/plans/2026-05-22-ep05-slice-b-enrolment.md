# EP-05 Slice B — Course Enrolment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in student enrol in and unenrol from a published course, with the enrolment record granting video/material access and feeding a "Most Popular" catalogue sort.

**Architecture:** A new `enrollment/` submodule in `libs/api-courses` exposes three authenticated REST endpoints over a top-level `enrollments` Firestore collection whose documents use the deterministic composite ID `${userId}__${courseId}`. Enrol/unenrol are Firestore transactions that also maintain a denormalised `Course.enrollmentCount`. A new `libs/web-enrollment` Angular library renders an enrol/leave panel on the existing course-detail page. The two access guards (`EnrollmentOrOwnerGuard`, `MaterialAccessGuard`) are wired to grant enrolled-student access.

**Tech Stack:** Nx monorepo (pnpm), NestJS 11, Angular 21, Firestore (via `firebase-admin`), Vitest, Playwright. Full design: `docs/superpowers/specs/2026-05-22-ep05-slice-b-enrolment-design.md`.

**Conventions:**
- Run unit tests with `pnpm nx test <project>` (projects: `shared-data-models`, `api-courses`, `web-catalog`, `web-enrollment`, `web-auth`).
- Every source file has a sibling `.spec.ts` (Vitest). Write the test first; watch it fail; implement; watch it pass; commit.
- Commit messages follow Conventional Commits. End every commit message body with:
  `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- Work happens on the existing branch `feat/ep-05-slice-b-enrolment`.

---

## Task 1: Extend the shared data models

**Files:**
- Modify: `libs/shared-data-models/src/lib/enrollment.ts`
- Modify: `libs/shared-data-models/src/lib/course.ts`
- Modify: `libs/shared-data-models/src/lib/catalog.ts`
- Create: `libs/shared-data-models/src/lib/enrollment.spec.ts`
- Modify: `libs/shared-data-models/src/lib/catalog.spec.ts`

- [ ] **Step 1: Update the catalogue sort test to expect three options**

In `libs/shared-data-models/src/lib/catalog.spec.ts`, replace the first `it(...)` block:

```ts
  it('exposes the three catalogue sort options', () => {
    expect(CATALOG_SORT_OPTIONS).toEqual(['NEWEST', 'ALPHABETICAL', 'POPULAR']);
  });
```

- [ ] **Step 2: Create the enrolment-model test**

Create `libs/shared-data-models/src/lib/enrollment.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { ENROLLMENT_STATUSES } from './enrollment';

describe('enrollment model', () => {
  it('exposes the ACTIVE and WITHDRAWN statuses', () => {
    expect(ENROLLMENT_STATUSES).toEqual(['ACTIVE', 'WITHDRAWN']);
  });
});
```

- [ ] **Step 3: Run the tests — verify they fail**

Run: `pnpm nx test shared-data-models`
Expected: FAIL — `catalog.spec.ts` fails (array still has 2 entries); `enrollment.spec.ts` fails (`ENROLLMENT_STATUSES` is not exported).

- [ ] **Step 4: Extend `enrollment.ts`**

Replace the entire contents of `libs/shared-data-models/src/lib/enrollment.ts`:

```ts
import type { CourseId, EnrollmentId, ISODateString, LessonId, UserId } from './common';

export interface LessonProgress {
  lessonId: LessonId;
  completedAt: ISODateString | null;
  lastWatchedSeconds: number;
}

/** ACTIVE = enrolled; WITHDRAWN = soft-deleted, progress retained for re-enrol. */
export const ENROLLMENT_STATUSES = ['ACTIVE', 'WITHDRAWN'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export interface Enrollment {
  id: EnrollmentId; // deterministic composite — `${userId}__${courseId}`
  userId: UserId;
  courseId: CourseId;
  status: EnrollmentStatus;
  progress: LessonProgress[];
  withdrawnAt: ISODateString | null; // set on unenrol, cleared on enrol/re-enrol
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Response of GET /api/enrollments/:courseId — the caller's state for one course. */
export interface EnrollmentStatusView {
  enrollment: Enrollment | null; // the caller's enrolment (any status), or null
  isOwner: boolean; // true when the caller is the course's instructor
}
```

- [ ] **Step 5: Add `enrollmentCount` to `Course`**

In `libs/shared-data-models/src/lib/course.ts`, add one field to the `Course` interface, immediately after the `archivedAt` line:

```ts
  enrollmentCount?: number;           // slice B — count of ACTIVE enrolments; absent on pre-Slice-B docs
```

- [ ] **Step 6: Add `POPULAR` to the catalogue sort options**

In `libs/shared-data-models/src/lib/catalog.ts`, replace the `CATALOG_SORT_OPTIONS` declaration and its doc comment:

```ts
/** Catalogue sort options. POPULAR ranks by Course.enrollmentCount descending. */
export const CATALOG_SORT_OPTIONS = ['NEWEST', 'ALPHABETICAL', 'POPULAR'] as const;
```

- [ ] **Step 7: Run the tests — verify they pass**

Run: `pnpm nx test shared-data-models`
Expected: PASS.

- [ ] **Step 8: Typecheck**

Run: `pnpm nx typecheck shared-data-models`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add libs/shared-data-models/src/lib/enrollment.ts libs/shared-data-models/src/lib/enrollment.spec.ts libs/shared-data-models/src/lib/course.ts libs/shared-data-models/src/lib/catalog.ts libs/shared-data-models/src/lib/catalog.spec.ts
git commit -m "feat(shared-data-models): enrolment model, Course.enrollmentCount, POPULAR sort

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add enrolment error codes and exceptions

**Files:**
- Modify: `libs/api-courses/src/lib/errors/courses-error.codes.ts`
- Modify: `libs/api-courses/src/lib/errors/courses.exception.ts`
- Modify: `libs/api-courses/src/lib/errors/courses.exception.spec.ts`

- [ ] **Step 1: Write the failing exception tests**

In `libs/api-courses/src/lib/errors/courses.exception.spec.ts`, add three classes to the import list at the top (`CannotEnrollOwnCourseException`, `CourseNotAvailableException`, `NotEnrolledException`), then add a new `describe` block at the end of the file:

```ts
describe('slice B enrolment exceptions', () => {
  it('CourseNotAvailableException is 409 with code COURSE_NOT_AVAILABLE', () => {
    const e = new CourseNotAvailableException();
    expect(e.code).toBe('COURSE_NOT_AVAILABLE');
    expect(e.status).toBe(409);
    expect(e.message).toBe('This course is no longer available.');
  });

  it('CannotEnrollOwnCourseException is 409 with code CANNOT_ENROLL_OWN_COURSE', () => {
    const e = new CannotEnrollOwnCourseException();
    expect(e.code).toBe('CANNOT_ENROLL_OWN_COURSE');
    expect(e.status).toBe(409);
    expect(e.message).toBe('You cannot enrol in a course you own.');
  });

  it('NotEnrolledException is 404 with code NOT_ENROLLED', () => {
    const e = new NotEnrolledException();
    expect(e.code).toBe('NOT_ENROLLED');
    expect(e.status).toBe(404);
    expect(e.message).toBe('You are not enrolled in this course.');
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — the three exception classes do not exist.

- [ ] **Step 3: Add the error codes**

In `libs/api-courses/src/lib/errors/courses-error.codes.ts`, add three members to the `CoursesErrorCode` union, immediately before `| 'INTERNAL';`:

```ts
  | 'COURSE_NOT_AVAILABLE'
  | 'CANNOT_ENROLL_OWN_COURSE'
  | 'NOT_ENROLLED'
```

- [ ] **Step 4: Add the exception classes**

In `libs/api-courses/src/lib/errors/courses.exception.ts`, append three classes at the end of the file:

```ts
export class CourseNotAvailableException extends CoursesException {
  constructor() {
    super('COURSE_NOT_AVAILABLE', 'This course is no longer available.', 409);
  }
}

export class CannotEnrollOwnCourseException extends CoursesException {
  constructor() {
    super('CANNOT_ENROLL_OWN_COURSE', 'You cannot enrol in a course you own.', 409);
  }
}

export class NotEnrolledException extends CoursesException {
  constructor() {
    super('NOT_ENROLLED', 'You are not enrolled in this course.', 404);
  }
}
```

- [ ] **Step 5: Run the test — verify it passes**

Run: `pnpm nx test api-courses`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/api-courses/src/lib/errors/
git commit -m "feat(api-courses): add enrolment error codes and exceptions

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: EnrollmentRepository

**Files:**
- Create: `libs/api-courses/src/lib/enrollment/enrollment.repository.ts`
- Create: `libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts`

The repository wraps the `enrollments` collection and the `Course.enrollmentCount` counter. **Firestore transactions require all reads before all writes** — the `withdraw` transaction below does both `get`s first for that reason. The `fake-firestore` test double does not enforce this, but the real emulator does.

- [ ] **Step 1: Write the failing repository tests**

Create `libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type {
  Course,
  Enrollment,
  ISODateString,
  LessonId,
  UserId,
  CourseId,
} from '@learnwren/shared-data-models';

import {
  CourseNotAvailableException,
  NotEnrolledException,
} from '../errors/courses.exception';
import { createFakeFirestore } from '../testing/fake-firestore';
import { EnrollmentRepository, enrollmentId } from './enrollment.repository';

const UID = 'student-1' as UserId;
const CID = 'course-1' as CourseId;
const ID = enrollmentId(UID, CID);

function course(over: Partial<Course> = {}): Course {
  return {
    id: CID,
    title: 'Course 1',
    description: 'desc',
    instructorId: 'owner-1' as UserId,
    status: 'PUBLISHED',
    createdAt: '2026-01-01T00:00:00.000Z' as ISODateString,
    updatedAt: '2026-01-01T00:00:00.000Z' as ISODateString,
    ...over,
  };
}

function repoWith(seed: Record<string, unknown>) {
  const db = createFakeFirestore(seed as Record<string, Record<string, unknown>>);
  return { repo: new EnrollmentRepository(db as never), db };
}

describe('enrollmentId', () => {
  it('builds the deterministic composite id', () => {
    expect(enrollmentId(UID, CID)).toBe('student-1__course-1');
  });
});

describe('EnrollmentRepository.enroll', () => {
  it('creates an ACTIVE enrolment with empty progress and increments the counter', async () => {
    const { repo, db } = repoWith({ [`courses/${CID}`]: course() });
    const result = await repo.enroll(UID, CID);
    expect(result.status).toBe('ACTIVE');
    expect(result.progress).toEqual([]);
    expect(result.withdrawnAt).toBeNull();
    expect(result.id).toBe(ID);
    expect(db.__store.get(`courses/${CID}`)?.['enrollmentCount']).toBe(1);
  });

  it('restores a WITHDRAWN enrolment, preserves progress, re-increments the counter', async () => {
    const withdrawn: Enrollment = {
      id: ID,
      userId: UID,
      courseId: CID,
      status: 'WITHDRAWN',
      progress: [{ lessonId: 'l1' as LessonId, completedAt: null, lastWatchedSeconds: 42 }],
      withdrawnAt: '2026-02-01T00:00:00.000Z' as ISODateString,
      createdAt: '2026-01-01T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-02-01T00:00:00.000Z' as ISODateString,
    };
    const { repo, db } = repoWith({
      [`courses/${CID}`]: course({ enrollmentCount: 3 }),
      [`enrollments/${ID}`]: withdrawn,
    });
    const result = await repo.enroll(UID, CID);
    expect(result.status).toBe('ACTIVE');
    expect(result.withdrawnAt).toBeNull();
    expect(result.progress).toEqual(withdrawn.progress);
    expect(db.__store.get(`courses/${CID}`)?.['enrollmentCount']).toBe(4);
  });

  it('is idempotent when already ACTIVE — no second counter increment', async () => {
    const { repo, db } = repoWith({ [`courses/${CID}`]: course({ enrollmentCount: 5 }) });
    await repo.enroll(UID, CID);
    await repo.enroll(UID, CID);
    expect(db.__store.get(`courses/${CID}`)?.['enrollmentCount']).toBe(6);
  });

  it('throws CourseNotAvailableException when the course is missing', async () => {
    const { repo } = repoWith({});
    await expect(repo.enroll(UID, CID)).rejects.toBeInstanceOf(CourseNotAvailableException);
  });

  it('throws CourseNotAvailableException when the course is not PUBLISHED', async () => {
    const { repo } = repoWith({ [`courses/${CID}`]: course({ status: 'DRAFT' }) });
    await expect(repo.enroll(UID, CID)).rejects.toBeInstanceOf(CourseNotAvailableException);
  });
});

describe('EnrollmentRepository.withdraw', () => {
  it('flips ACTIVE to WITHDRAWN, stamps withdrawnAt, decrements the counter', async () => {
    const { repo, db } = repoWith({ [`courses/${CID}`]: course() });
    await repo.enroll(UID, CID);
    await repo.withdraw(UID, CID);
    const stored = db.__store.get(`enrollments/${ID}`);
    expect(stored?.['status']).toBe('WITHDRAWN');
    expect(stored?.['withdrawnAt']).toEqual(expect.any(String));
    expect(db.__store.get(`courses/${CID}`)?.['enrollmentCount']).toBe(0);
  });

  it('throws NotEnrolledException when there is no enrolment', async () => {
    const { repo } = repoWith({ [`courses/${CID}`]: course() });
    await expect(repo.withdraw(UID, CID)).rejects.toBeInstanceOf(NotEnrolledException);
  });

  it('throws NotEnrolledException when the enrolment is already WITHDRAWN', async () => {
    const { repo } = repoWith({ [`courses/${CID}`]: course() });
    await repo.enroll(UID, CID);
    await repo.withdraw(UID, CID);
    await expect(repo.withdraw(UID, CID)).rejects.toBeInstanceOf(NotEnrolledException);
  });
});

describe('EnrollmentRepository.isEnrolled / getEnrollment', () => {
  it('isEnrolled is true only for an ACTIVE enrolment', async () => {
    const { repo } = repoWith({ [`courses/${CID}`]: course() });
    expect(await repo.isEnrolled(UID, CID)).toBe(false);
    await repo.enroll(UID, CID);
    expect(await repo.isEnrolled(UID, CID)).toBe(true);
    await repo.withdraw(UID, CID);
    expect(await repo.isEnrolled(UID, CID)).toBe(false);
  });

  it('getEnrollment returns the document as-is, or null when absent', async () => {
    const { repo } = repoWith({ [`courses/${CID}`]: course() });
    expect(await repo.getEnrollment(UID, CID)).toBeNull();
    await repo.enroll(UID, CID);
    expect((await repo.getEnrollment(UID, CID))?.status).toBe('ACTIVE');
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — `enrollment.repository.ts` does not exist.

- [ ] **Step 3: Implement the repository**

Create `libs/api-courses/src/lib/enrollment/enrollment.repository.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type {
  Course,
  CourseId,
  Enrollment,
  EnrollmentId,
  ISODateString,
  UserId,
} from '@learnwren/shared-data-models';

import {
  CourseNotAvailableException,
  NotEnrolledException,
} from '../errors/courses.exception';

const ENROLLMENTS = 'enrollments';
const COURSES = 'courses';

function nowIso(): ISODateString {
  return new Date().toISOString() as ISODateString;
}

/** Deterministic composite document id for an enrolment. */
export function enrollmentId(userId: UserId, courseId: CourseId): EnrollmentId {
  return `${userId}__${courseId}` as EnrollmentId;
}

@Injectable()
export class EnrollmentRepository {
  constructor(@Inject(FIRESTORE) private readonly db: FirestoreHandle) {}

  async getEnrollment(userId: UserId, courseId: CourseId): Promise<Enrollment | null> {
    const snap = await this.db
      .collection(ENROLLMENTS)
      .doc(enrollmentId(userId, courseId))
      .get();
    return snap.exists ? (snap.data() as Enrollment) : null;
  }

  /** True only when an ACTIVE enrolment exists. Consumed by the access guards. */
  async isEnrolled(userId: UserId, courseId: CourseId): Promise<boolean> {
    const enrollment = await this.getEnrollment(userId, courseId);
    return enrollment?.status === 'ACTIVE';
  }

  async enroll(userId: UserId, courseId: CourseId): Promise<Enrollment> {
    const enrollmentRef = this.db.collection(ENROLLMENTS).doc(enrollmentId(userId, courseId));
    const courseRef = this.db.collection(COURSES).doc(courseId);

    return this.db.runTransaction(async (t) => {
      const courseSnap = await t.get(courseRef);
      const course = courseSnap.exists ? (courseSnap.data() as Course) : null;
      if (!course || course.status !== 'PUBLISHED') {
        throw new CourseNotAvailableException();
      }

      const enrollSnap = await t.get(enrollmentRef);
      const existing = enrollSnap.exists ? (enrollSnap.data() as Enrollment) : null;

      if (existing?.status === 'ACTIVE') {
        return existing; // idempotent — no counter change
      }

      const now = nowIso();
      const nextCount = (course.enrollmentCount ?? 0) + 1;

      if (existing) {
        // WITHDRAWN -> ACTIVE; progress is left untouched.
        const restored: Enrollment = {
          ...existing,
          status: 'ACTIVE',
          withdrawnAt: null,
          updatedAt: now,
        };
        t.update(enrollmentRef, { status: 'ACTIVE', withdrawnAt: null, updatedAt: now });
        t.update(courseRef, { enrollmentCount: nextCount });
        return restored;
      }

      const created: Enrollment = {
        id: enrollmentId(userId, courseId),
        userId,
        courseId,
        status: 'ACTIVE',
        progress: [],
        withdrawnAt: null,
        createdAt: now,
        updatedAt: now,
      };
      t.set(enrollmentRef, created);
      t.update(courseRef, { enrollmentCount: nextCount });
      return created;
    });
  }

  async withdraw(userId: UserId, courseId: CourseId): Promise<void> {
    const enrollmentRef = this.db.collection(ENROLLMENTS).doc(enrollmentId(userId, courseId));
    const courseRef = this.db.collection(COURSES).doc(courseId);

    await this.db.runTransaction(async (t) => {
      // All reads before any writes (Firestore transaction rule).
      const enrollSnap = await t.get(enrollmentRef);
      const courseSnap = await t.get(courseRef);

      const existing = enrollSnap.exists ? (enrollSnap.data() as Enrollment) : null;
      if (!existing || existing.status !== 'ACTIVE') {
        throw new NotEnrolledException();
      }

      const now = nowIso();
      t.update(enrollmentRef, { status: 'WITHDRAWN', withdrawnAt: now, updatedAt: now });

      if (courseSnap.exists) {
        const course = courseSnap.data() as Course;
        const nextCount = Math.max(0, (course.enrollmentCount ?? 0) - 1);
        t.update(courseRef, { enrollmentCount: nextCount });
      }
    });
  }
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `pnpm nx test api-courses`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/enrollment/enrollment.repository.ts libs/api-courses/src/lib/enrollment/enrollment.repository.spec.ts
git commit -m "feat(api-courses): EnrollmentRepository with transactional enrol/unenrol

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: EnrollmentService

**Files:**
- Create: `libs/api-courses/src/lib/enrollment/enrollment.service.ts`
- Create: `libs/api-courses/src/lib/enrollment/enrollment.service.spec.ts`

- [ ] **Step 1: Write the failing service tests**

Create `libs/api-courses/src/lib/enrollment/enrollment.service.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import type { Course, CourseId, Enrollment, UserId } from '@learnwren/shared-data-models';

import { CannotEnrollOwnCourseException } from '../errors/courses.exception';
import type { CoursesRepository } from '../courses.repository';
import type { EnrollmentRepository } from './enrollment.repository';
import { EnrollmentService } from './enrollment.service';

const UID = 'student-1' as UserId;
const OWNER = 'owner-1' as UserId;
const CID = 'course-1' as CourseId;

const publishedCourse = { id: CID, instructorId: OWNER, status: 'PUBLISHED' } as Course;

function make(over: {
  course?: Course | null;
  enrollment?: Enrollment | null;
} = {}) {
  const courses = {
    getCourse: vi.fn().mockResolvedValue(over.course ?? publishedCourse),
  } as unknown as CoursesRepository;
  const enrollments = {
    enroll: vi.fn().mockResolvedValue({ id: 'e1' } as Enrollment),
    withdraw: vi.fn().mockResolvedValue(undefined),
    getEnrollment: vi.fn().mockResolvedValue(over.enrollment ?? null),
  } as unknown as EnrollmentRepository;
  return { service: new EnrollmentService(enrollments, courses), courses, enrollments };
}

describe('EnrollmentService.enroll', () => {
  it('throws CannotEnrollOwnCourseException when the caller owns the course', async () => {
    const { service } = make();
    await expect(service.enroll(OWNER, CID)).rejects.toBeInstanceOf(
      CannotEnrollOwnCourseException,
    );
  });

  it('delegates to the repository for a non-owner', async () => {
    const { service, enrollments } = make();
    await service.enroll(UID, CID);
    expect(enrollments.enroll).toHaveBeenCalledWith(UID, CID);
  });

  it('delegates to the repository when the course read returns null (repo re-checks)', async () => {
    const { service, enrollments } = make({ course: null });
    await service.enroll(UID, CID);
    expect(enrollments.enroll).toHaveBeenCalledWith(UID, CID);
  });
});

describe('EnrollmentService.unenroll', () => {
  it('delegates to the repository', async () => {
    const { service, enrollments } = make();
    await service.unenroll(UID, CID);
    expect(enrollments.withdraw).toHaveBeenCalledWith(UID, CID);
  });
});

describe('EnrollmentService.getEnrollmentStatus', () => {
  it('reports isOwner true and the enrolment for the course owner', async () => {
    const enrollment = { id: 'e1', status: 'ACTIVE' } as Enrollment;
    const { service } = make({ enrollment });
    const view = await service.getEnrollmentStatus(OWNER, CID);
    expect(view).toEqual({ enrollment, isOwner: true });
  });

  it('reports isOwner false for a non-owner', async () => {
    const { service } = make();
    const view = await service.getEnrollmentStatus(UID, CID);
    expect(view).toEqual({ enrollment: null, isOwner: false });
  });

  it('yields { enrollment: null, isOwner: false } when the course is missing', async () => {
    const { service } = make({ course: null });
    const view = await service.getEnrollmentStatus(UID, CID);
    expect(view).toEqual({ enrollment: null, isOwner: false });
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — `enrollment.service.ts` does not exist.

- [ ] **Step 3: Implement the service**

Create `libs/api-courses/src/lib/enrollment/enrollment.service.ts`:

```ts
import { Injectable } from '@nestjs/common';

import type {
  CourseId,
  Enrollment,
  EnrollmentStatusView,
  UserId,
} from '@learnwren/shared-data-models';

import { CoursesRepository } from '../courses.repository';
import { CannotEnrollOwnCourseException } from '../errors/courses.exception';
import { EnrollmentRepository } from './enrollment.repository';

@Injectable()
export class EnrollmentService {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly courses: CoursesRepository,
  ) {}

  async enroll(userId: UserId, courseId: CourseId): Promise<Enrollment> {
    // Advisory owner check. The repository's transactional PUBLISHED check
    // remains the authority on availability.
    const course = await this.courses.getCourse(courseId);
    if (course && course.instructorId === userId) {
      throw new CannotEnrollOwnCourseException();
    }
    return this.enrollments.enroll(userId, courseId);
  }

  async unenroll(userId: UserId, courseId: CourseId): Promise<void> {
    await this.enrollments.withdraw(userId, courseId);
  }

  async getEnrollmentStatus(
    userId: UserId,
    courseId: CourseId,
  ): Promise<EnrollmentStatusView> {
    const [course, enrollment] = await Promise.all([
      this.courses.getCourse(courseId),
      this.enrollments.getEnrollment(userId, courseId),
    ]);
    return { enrollment, isOwner: course?.instructorId === userId };
  }
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `pnpm nx test api-courses`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/enrollment/enrollment.service.ts libs/api-courses/src/lib/enrollment/enrollment.service.spec.ts
git commit -m "feat(api-courses): EnrollmentService with owner-self-enrol guard

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: EnrollCourseDto

**Files:**
- Create: `libs/api-courses/src/lib/enrollment/dto/enroll-course.dto.ts`
- Create: `libs/api-courses/src/lib/enrollment/dto/dto.spec.ts`

- [ ] **Step 1: Write the failing DTO test**

Create `libs/api-courses/src/lib/enrollment/dto/dto.spec.ts`:

```ts
import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { EnrollCourseDto } from './enroll-course.dto';

describe('EnrollCourseDto', () => {
  it('accepts a non-empty courseId', () => {
    const dto = plainToInstance(EnrollCourseDto, { courseId: 'course-1' });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects a missing courseId', () => {
    const dto = plainToInstance(EnrollCourseDto, {});
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('rejects an empty courseId', () => {
    const dto = plainToInstance(EnrollCourseDto, { courseId: '' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — `enroll-course.dto.ts` does not exist.

- [ ] **Step 3: Implement the DTO**

Create `libs/api-courses/src/lib/enrollment/dto/enroll-course.dto.ts`:

```ts
import { IsNotEmpty, IsString } from 'class-validator';

import type { CourseId } from '@learnwren/shared-data-models';

export class EnrollCourseDto {
  @IsString()
  @IsNotEmpty()
  courseId!: CourseId;
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `pnpm nx test api-courses`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/enrollment/dto/
git commit -m "feat(api-courses): EnrollCourseDto

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: EnrollmentController

**Files:**
- Create: `libs/api-courses/src/lib/enrollment/enrollment.controller.ts`
- Create: `libs/api-courses/src/lib/enrollment/enrollment.controller.spec.ts`

- [ ] **Step 1: Write the failing controller tests**

Create `libs/api-courses/src/lib/enrollment/enrollment.controller.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedRequest } from '@learnwren/api-auth';
import type { CourseId, Enrollment, UserId } from '@learnwren/shared-data-models';

import { EnrollmentController } from './enrollment.controller';
import type { EnrollmentService } from './enrollment.service';

const UID = 'student-1' as UserId;
const CID = 'course-1' as CourseId;

function reqAs(uid: UserId): AuthenticatedRequest {
  return { user: { uid } } as AuthenticatedRequest;
}

describe('EnrollmentController', () => {
  let svc: {
    enroll: ReturnType<typeof vi.fn>;
    unenroll: ReturnType<typeof vi.fn>;
    getEnrollmentStatus: ReturnType<typeof vi.fn>;
  };
  let controller: EnrollmentController;

  beforeEach(() => {
    svc = {
      enroll: vi.fn().mockResolvedValue({ id: 'e1' } as Enrollment),
      unenroll: vi.fn().mockResolvedValue(undefined),
      getEnrollmentStatus: vi.fn().mockResolvedValue({ enrollment: null, isOwner: false }),
    };
    controller = new EnrollmentController(svc as unknown as EnrollmentService);
  });

  it('POST /enrollments enrols the caller in the body-supplied course', async () => {
    await controller.enroll({ courseId: CID }, reqAs(UID));
    expect(svc.enroll).toHaveBeenCalledWith(UID, CID);
  });

  it('DELETE /enrollments/:courseId unenrols the caller from the path course', async () => {
    await controller.unenroll(CID, reqAs(UID));
    expect(svc.unenroll).toHaveBeenCalledWith(UID, CID);
  });

  it('GET /enrollments/:courseId reports the caller status for that course', async () => {
    await controller.getStatus(CID, reqAs(UID));
    expect(svc.getEnrollmentStatus).toHaveBeenCalledWith(UID, CID);
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — `enrollment.controller.ts` does not exist.

- [ ] **Step 3: Implement the controller**

Create `libs/api-courses/src/lib/enrollment/enrollment.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import { FirebaseSessionGuard } from '@learnwren/api-auth';
import type { AuthenticatedRequest } from '@learnwren/api-auth';
import type {
  CourseId,
  Enrollment,
  EnrollmentStatusView,
} from '@learnwren/shared-data-models';

import { CoursesExceptionFilter } from '../courses.exception-filter';
import { EnrollCourseDto } from './dto/enroll-course.dto';
import { EnrollmentService } from './enrollment.service';

/**
 * Authenticated enrolment surface. The caller's uid always comes from the
 * session — never from the body or path — so a caller can only ever act on
 * their own enrolment.
 */
@Controller('enrollments')
@UseFilters(CoursesExceptionFilter)
@UseGuards(FirebaseSessionGuard)
export class EnrollmentController {
  constructor(private readonly svc: EnrollmentService) {}

  @Post()
  enroll(
    @Body() body: EnrollCourseDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<Enrollment> {
    return this.svc.enroll(req.user!.uid, body.courseId);
  }

  @Delete(':courseId')
  @HttpCode(204)
  async unenroll(
    @Param('courseId') courseId: CourseId,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.svc.unenroll(req.user!.uid, courseId);
  }

  @Get(':courseId')
  getStatus(
    @Param('courseId') courseId: CourseId,
    @Req() req: AuthenticatedRequest,
  ): Promise<EnrollmentStatusView> {
    return this.svc.getEnrollmentStatus(req.user!.uid, courseId);
  }
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `pnpm nx test api-courses`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/enrollment/enrollment.controller.ts libs/api-courses/src/lib/enrollment/enrollment.controller.spec.ts
git commit -m "feat(api-courses): EnrollmentController with three authenticated endpoints

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Register enrolment in CoursesModule and seed enrollmentCount

**Files:**
- Modify: `libs/api-courses/src/lib/courses.module.ts`
- Modify: `libs/api-courses/src/lib/courses.service.ts:59-75` (`createCourse`)
- Modify: `libs/api-courses/src/lib/courses.service.spec.ts` (`createCourse` test)

- [ ] **Step 1: Add the failing createCourse assertion**

In `libs/api-courses/src/lib/courses.service.spec.ts`, inside the `createCourse` test `it('writes a new DRAFT course with generated id and instructor ownership', ...)`, add one assertion before `expect(repo.createCourse).toHaveBeenCalledWith(out);`:

```ts
      expect(out.enrollmentCount).toBe(0);
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — `out.enrollmentCount` is `undefined`.

- [ ] **Step 3: Seed `enrollmentCount` in `createCourse`**

In `libs/api-courses/src/lib/courses.service.ts`, in the `createCourse` method, add one line to the `course` object literal, immediately after `status: 'DRAFT',`:

```ts
      enrollmentCount: 0,
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `pnpm nx test api-courses`
Expected: PASS.

- [ ] **Step 5: Register the enrolment providers in CoursesModule**

In `libs/api-courses/src/lib/courses.module.ts`:

a. Add imports near the other `./` imports:

```ts
import { EnrollmentController } from './enrollment/enrollment.controller';
import { EnrollmentRepository } from './enrollment/enrollment.repository';
import { EnrollmentService } from './enrollment/enrollment.service';
```

b. Add `EnrollmentController` to the `controllers` array (after `CatalogController`).

c. Add `EnrollmentService` and `EnrollmentRepository` to the `providers` array (after `InstructorDirectory`).

d. Add `EnrollmentRepository` to the `exports` array, so it reads:

```ts
  exports: [CoursesRepository, CourseOwnerGuard, EnrollmentRepository],
```

- [ ] **Step 6: Run the api-courses test suite and build**

Run: `pnpm nx test api-courses && pnpm nx build api-courses`
Expected: PASS — the module compiles with the new controller and providers.

- [ ] **Step 7: Smoke-check the API boots**

Run: `pnpm nx build api`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add libs/api-courses/src/lib/courses.module.ts libs/api-courses/src/lib/courses.service.ts libs/api-courses/src/lib/courses.service.spec.ts
git commit -m "feat(api-courses): wire enrolment into CoursesModule, seed enrollmentCount

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Wire EnrollmentOrOwnerGuard to grant enrolled-student access

**Files:**
- Modify: `libs/api-courses/src/lib/video/playback/enrollment-or-owner.guard.ts`
- Modify: `libs/api-courses/src/lib/video/playback/enrollment-or-owner.guard.spec.ts`

- [ ] **Step 1: Rewrite the guard spec**

Replace the entire contents of `libs/api-courses/src/lib/video/playback/enrollment-or-owner.guard.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import type { Video, VideoId } from '@learnwren/shared-data-models';

import type { EnrollmentRepository } from '../../enrollment/enrollment.repository';
import {
  NotVideoOwnerException,
  VideoNotFoundException,
  VideoNotReadyException,
} from '../errors/video.exception';
import type { VideoRepository } from '../video.repository';
import { EnrollmentOrOwnerGuard } from './enrollment-or-owner.guard';

function ctxFor(req: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as Parameters<EnrollmentOrOwnerGuard['canActivate']>[0];
}

function makeRepo(video: Video | null): VideoRepository {
  return { getVideo: vi.fn().mockResolvedValue(video) } as unknown as VideoRepository;
}

function makeEnrollment(isEnrolled: boolean): EnrollmentRepository {
  return {
    isEnrolled: vi.fn().mockResolvedValue(isEnrolled),
  } as unknown as EnrollmentRepository;
}

const readyVideo: Video = {
  id: 'v1' as VideoId,
  ownerInstructorId: 'u1' as Video['ownerInstructorId'],
  courseId: 'c1' as Video['courseId'],
  lessonId: 'l1' as Video['lessonId'],
  state: 'READY',
  source: { bucket: 'src', path: 'p' },
  output: { bucket: 'out', manifestPath: 'videos/v1/hls/manifest.m3u8', durationSec: 60 },
  keyId: 'k1' as Video['keyId'],
  createdAt: 'now' as Video['createdAt'],
  updatedAt: 'now' as Video['updatedAt'],
};

describe('EnrollmentOrOwnerGuard', () => {
  it('throws VIDEO_NOT_FOUND when :vid is missing from params', async () => {
    const guard = new EnrollmentOrOwnerGuard(makeRepo(null), makeEnrollment(false));
    await expect(
      guard.canActivate(ctxFor({ params: {}, user: { uid: 'u1' } })),
    ).rejects.toBeInstanceOf(VideoNotFoundException);
  });

  it('throws VIDEO_NOT_FOUND when the video does not exist', async () => {
    const guard = new EnrollmentOrOwnerGuard(makeRepo(null), makeEnrollment(false));
    await expect(
      guard.canActivate(ctxFor({ params: { vid: 'v1' }, user: { uid: 'u1' } })),
    ).rejects.toBeInstanceOf(VideoNotFoundException);
  });

  it('throws VIDEO_NOT_READY when state is not READY', async () => {
    const transcoding = { ...readyVideo, state: 'TRANSCODING' as const };
    const guard = new EnrollmentOrOwnerGuard(makeRepo(transcoding), makeEnrollment(false));
    await expect(
      guard.canActivate(ctxFor({ params: { vid: 'v1' }, user: { uid: 'u1' } })),
    ).rejects.toBeInstanceOf(VideoNotReadyException);
  });

  it('attaches video and returns true when the requester is the owner', async () => {
    const enrollment = makeEnrollment(false);
    const guard = new EnrollmentOrOwnerGuard(makeRepo(readyVideo), enrollment);
    const req: Record<string, unknown> = { params: { vid: 'v1' }, user: { uid: 'u1' } };
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req['video']).toEqual(readyVideo);
    // The owner check short-circuits — no enrolment lookup needed.
    expect(enrollment.isEnrolled).not.toHaveBeenCalled();
  });

  it('attaches video and returns true for an ACTIVE-enrolled non-owner', async () => {
    const enrollment = makeEnrollment(true);
    const guard = new EnrollmentOrOwnerGuard(makeRepo(readyVideo), enrollment);
    const req: Record<string, unknown> = { params: { vid: 'v1' }, user: { uid: 'u2' } };
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req['video']).toEqual(readyVideo);
    expect(enrollment.isEnrolled).toHaveBeenCalledWith('u2', 'c1');
  });

  it('throws NOT_VIDEO_OWNER for a non-owner who is not enrolled', async () => {
    const guard = new EnrollmentOrOwnerGuard(makeRepo(readyVideo), makeEnrollment(false));
    await expect(
      guard.canActivate(ctxFor({ params: { vid: 'v1' }, user: { uid: 'u2' } })),
    ).rejects.toBeInstanceOf(NotVideoOwnerException);
  });

  it('throws NOT_VIDEO_OWNER (not TypeError) when req.user is entirely missing', async () => {
    const guard = new EnrollmentOrOwnerGuard(makeRepo(readyVideo), makeEnrollment(false));
    await expect(
      guard.canActivate(ctxFor({ params: { vid: 'v1' } })),
    ).rejects.toBeInstanceOf(NotVideoOwnerException);
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — `EnrollmentOrOwnerGuard` constructor takes one argument.

- [ ] **Step 3: Wire the guard**

Replace the entire contents of `libs/api-courses/src/lib/video/playback/enrollment-or-owner.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { VideoId } from '@learnwren/shared-data-models';

import { EnrollmentRepository } from '../../enrollment/enrollment.repository';
import {
  NotVideoOwnerException,
  VideoNotFoundException,
  VideoNotReadyException,
} from '../errors/video.exception';
import type { VideoScopedRequest } from '../types/loaded-video';
import { VideoRepository } from '../video.repository';

@Injectable()
export class EnrollmentOrOwnerGuard implements CanActivate {
  constructor(
    private readonly repo: VideoRepository,
    private readonly enrollment: EnrollmentRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<VideoScopedRequest>();
    const vid = req.params?.['vid'] as VideoId | undefined;
    if (!vid) throw new VideoNotFoundException();

    const video = await this.repo.getVideo(vid);
    if (!video) throw new VideoNotFoundException();
    if (video.state !== 'READY') throw new VideoNotReadyException(video.state);

    if (video.ownerInstructorId === req.user?.uid) {
      req.video = video;
      return true;
    }

    if (req.user && (await this.enrollment.isEnrolled(req.user.uid, video.courseId))) {
      req.video = video;
      return true;
    }

    throw new NotVideoOwnerException();
  }
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `pnpm nx test api-courses`
Expected: PASS.

- [ ] **Step 5: Build api-courses to confirm `VideoModule` DI resolves**

Run: `pnpm nx build api-courses`
Expected: PASS. (`VideoModule` already imports `forwardRef(() => CoursesModule)`, which now exports `EnrollmentRepository`.)

- [ ] **Step 6: Commit**

```bash
git add libs/api-courses/src/lib/video/playback/enrollment-or-owner.guard.ts libs/api-courses/src/lib/video/playback/enrollment-or-owner.guard.spec.ts
git commit -m "feat(api-courses): grant enrolled-student video access in EnrollmentOrOwnerGuard

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Wire MaterialAccessGuard to grant enrolled-student access

**Files:**
- Modify: `libs/api-courses/src/lib/materials/material-access.guard.ts`
- Modify: `libs/api-courses/src/lib/materials/material-access.guard.spec.ts`

- [ ] **Step 1: Rewrite the guard spec**

Replace the entire contents of `libs/api-courses/src/lib/materials/material-access.guard.spec.ts`:

```ts
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { Material } from '@learnwren/shared-data-models';

import type { EnrollmentRepository } from '../enrollment/enrollment.repository';
import { MaterialAccessGuard } from './material-access.guard';
import type { MaterialsRepository } from './materials.repository';
import type { MaterialScopedRequest } from './types/loaded-material';

const material = { id: 'm1', ownerInstructorId: 'owner-uid', courseId: 'c1' } as Material;

function ctxFor(req: Partial<MaterialScopedRequest>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as ExecutionContext;
}

function repo(found: Material | null): MaterialsRepository {
  return { get: vi.fn().mockResolvedValue(found) } as unknown as MaterialsRepository;
}

function enrollment(isEnrolled: boolean): EnrollmentRepository {
  return {
    isEnrolled: vi.fn().mockResolvedValue(isEnrolled),
  } as unknown as EnrollmentRepository;
}

describe('MaterialAccessGuard', () => {
  it('passes for the course owner', async () => {
    const guard = new MaterialAccessGuard(repo(material), enrollment(false));
    const req: Partial<MaterialScopedRequest> = {
      params: { matId: 'm1' },
      user: { uid: 'owner-uid' } as MaterialScopedRequest['user'],
    };
    expect(await guard.canActivate(ctxFor(req))).toBe(true);
    expect(req.material).toBe(material);
  });

  it('passes for an ACTIVE-enrolled non-owner', async () => {
    const enr = enrollment(true);
    const guard = new MaterialAccessGuard(repo(material), enr);
    const req: Partial<MaterialScopedRequest> = {
      params: { matId: 'm1' },
      user: { uid: 'student-uid' } as MaterialScopedRequest['user'],
    };
    expect(await guard.canActivate(ctxFor(req))).toBe(true);
    expect(req.material).toBe(material);
    expect(enr.isEnrolled).toHaveBeenCalledWith('student-uid', 'c1');
  });

  it('throws NOT_MATERIAL_OWNER for a non-owner who is not enrolled', async () => {
    const guard = new MaterialAccessGuard(repo(material), enrollment(false));
    await expect(
      guard.canActivate(
        ctxFor({
          params: { matId: 'm1' },
          user: { uid: 'student-uid' } as MaterialScopedRequest['user'],
        }),
      ),
    ).rejects.toThrow(/access/i);
  });

  it('throws MATERIAL_NOT_FOUND when the material does not exist', async () => {
    const guard = new MaterialAccessGuard(repo(null), enrollment(false));
    await expect(
      guard.canActivate(ctxFor({ params: { matId: 'm1' } })),
    ).rejects.toThrow(/not found/i);
  });

  it('throws MATERIAL_NOT_FOUND when the matId param is missing', async () => {
    const guard = new MaterialAccessGuard(repo(material), enrollment(false));
    await expect(guard.canActivate(ctxFor({ params: {} }))).rejects.toThrow(/not found/i);
  });

  it('throws NOT_MATERIAL_OWNER when req.user is undefined (unauthenticated request)', async () => {
    const guard = new MaterialAccessGuard(repo(material), enrollment(false));
    await expect(
      guard.canActivate(ctxFor({ params: { matId: 'm1' } })),
    ).rejects.toThrow(/access/i);
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — `MaterialAccessGuard` constructor takes one argument.

- [ ] **Step 3: Wire the guard**

Replace the entire contents of `libs/api-courses/src/lib/materials/material-access.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { MaterialId } from '@learnwren/shared-data-models';

import { EnrollmentRepository } from '../enrollment/enrollment.repository';
import {
  MaterialNotFoundException,
  NotMaterialOwnerException,
} from './errors/material.exception';
import { MaterialsRepository } from './materials.repository';
import type { MaterialScopedRequest } from './types/loaded-material';

/** Gates the material download endpoint: the course owner or an ACTIVE-enrolled student. */
@Injectable()
export class MaterialAccessGuard implements CanActivate {
  constructor(
    private readonly repo: MaterialsRepository,
    private readonly enrollment: EnrollmentRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<MaterialScopedRequest>();
    const matId = req.params?.['matId'] as MaterialId | undefined;
    if (!matId) throw new MaterialNotFoundException();

    const material = await this.repo.get(matId);
    if (!material) throw new MaterialNotFoundException();

    if (material.ownerInstructorId === req.user?.uid) {
      req.material = material;
      return true;
    }

    if (req.user && (await this.enrollment.isEnrolled(req.user.uid, material.courseId))) {
      req.material = material;
      return true;
    }

    throw new NotMaterialOwnerException();
  }
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `pnpm nx test api-courses`
Expected: PASS.

- [ ] **Step 5: Build api-courses to confirm `MaterialsModule` DI resolves**

Run: `pnpm nx build api-courses && pnpm nx build api`
Expected: PASS. (`MaterialsModule` already imports `forwardRef(() => CoursesModule)`.)

- [ ] **Step 6: Commit**

```bash
git add libs/api-courses/src/lib/materials/material-access.guard.ts libs/api-courses/src/lib/materials/material-access.guard.spec.ts
git commit -m "feat(api-courses): grant enrolled-student material access in MaterialAccessGuard

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: POPULAR catalogue sort

**Files:**
- Modify: `libs/api-courses/src/lib/catalog/catalog.service.ts` (`sortCourses`)
- Modify: `libs/api-courses/src/lib/catalog/catalog.service.spec.ts`
- Modify: `libs/api-courses/src/lib/catalog/dto/dto.spec.ts`
- Modify: `apps/api-e2e/src/catalog.e2e-spec.ts:71-74`

- [ ] **Step 1: Add the failing POPULAR sort test**

In `libs/api-courses/src/lib/catalog/catalog.service.spec.ts`, add a new `describe` block at the end of the file (the `course()` helper and `makeService()` already exist in this file):

```ts
describe('CatalogService.listCatalogue — POPULAR sort', () => {
  it('orders by enrollmentCount descending, treating a missing count as 0', async () => {
    const svc = makeService([
      course({ id: 'c-low' as CourseId, enrollmentCount: 2 }),
      course({ id: 'c-high' as CourseId, enrollmentCount: 9 }),
      course({ id: 'c-none' as CourseId }), // no enrollmentCount field
    ]);

    const page = await svc.listCatalogue({ sort: 'POPULAR' });

    expect(page.items.map((i) => i.id)).toEqual(['c-high', 'c-low', 'c-none']);
  });
});
```

- [ ] **Step 2: Fix the catalog DTO test that used POPULAR as its invalid example**

In `libs/api-courses/src/lib/catalog/dto/dto.spec.ts`, the test `it('rejects an unknown sort value', ...)` uses `'POPULAR'`, which is now valid. Change the value to a genuinely-unknown one:

```ts
  it('rejects an unknown sort value', () => {
    const dto = plainToInstance(CatalogQueryDto, { sort: 'TRENDING' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
```

- [ ] **Step 3: Run the tests — verify the new test fails**

Run: `pnpm nx test api-courses`
Expected: FAIL — `catalog.service.spec.ts` POPULAR test fails (no POPULAR branch; courses come back in seed/Newest order). The `dto.spec.ts` change should already pass (`TRENDING` is invalid).

- [ ] **Step 4: Add the POPULAR branch to `sortCourses`**

In `libs/api-courses/src/lib/catalog/catalog.service.ts`, replace the `sortCourses` function:

```ts
function sortCourses(courses: Course[], sort: CatalogSort): Course[] {
  const copy = [...courses];
  if (sort === 'ALPHABETICAL') {
    copy.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  } else if (sort === 'POPULAR') {
    copy.sort(
      (a, b) => (b.enrollmentCount ?? 0) - (a.enrollmentCount ?? 0) || compareNewest(a, b),
    );
  } else {
    copy.sort(compareNewest);
  }
  return copy;
}
```

- [ ] **Step 5: Run the test — verify it passes**

Run: `pnpm nx test api-courses`
Expected: PASS.

- [ ] **Step 6: Fix the api-e2e invalid-sort test**

In `apps/api-e2e/src/catalog.e2e-spec.ts`, the test `'GET /catalog rejects an invalid sort with 400'` sends `sort=POPULAR`, which is now a valid sort. Replace that test body so it uses a genuinely-invalid value:

```ts
test('GET /catalog rejects an invalid sort with 400', async ({ request }) => {
  const res = await request.get(`${API_BASE}/catalog?sort=TRENDING`);
  expect(res.status()).toBe(400);
});
```

- [ ] **Step 7: Commit**

```bash
git add libs/api-courses/src/lib/catalog/ apps/api-e2e/src/catalog.e2e-spec.ts
git commit -m "feat(api-courses): POPULAR catalogue sort by enrollmentCount

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Firestore rules for the enrollments collection

**Files:**
- Modify: `firestore.rules`
- Modify: `firestore.emulator.rules`

Both files are deny-by-default for all collections (all access is Admin-SDK-mediated). Add an explicit `enrollments` block to each, mirroring the existing `materials` block, so the collection is documented.

- [ ] **Step 1: Add the block to `firestore.rules`**

In `firestore.rules`, immediately after the `match /materials/{materialId} { ... }` block, add:

```
    match /enrollments/{enrollmentId} {
      allow read, write: if false;
    }
```

- [ ] **Step 2: Add the same block to `firestore.emulator.rules`**

In `firestore.emulator.rules`, immediately after the `match /materials/{materialId} { ... }` block, add the identical block:

```
    match /enrollments/{enrollmentId} {
      allow read, write: if false;
    }
```

- [ ] **Step 3: Add a Firestore rules e2e test**

In `apps/api-e2e/src/firestore-rules.e2e-spec.ts`, add a test at the end of the file:

```ts
test('authenticated client cannot read or write /enrollments/{id}', async () => {
  const ctx = testEnv.authenticatedContext('student-A', { role: 'STUDENT' });
  const ref = doc(ctx.firestore(), 'enrollments', 'student-A__course-1');
  await assertFails(getDoc(ref));
  await assertFails(
    setDoc(ref, { id: 'student-A__course-1', userId: 'student-A', courseId: 'course-1' }),
  );
});
```

- [ ] **Step 4: Verify the rules files parse**

Run: `pnpm nx build api`
Expected: PASS. (This task has no unit test; the rules e2e in Step 3 runs in the `api-e2e` suite — Task 16 runs the full suite. A quick local check: `pnpm emulators` then confirm no rules-compile error in the emulator output.)

- [ ] **Step 5: Commit**

```bash
git add firestore.rules firestore.emulator.rules apps/api-e2e/src/firestore-rules.e2e-spec.ts
git commit -m "feat: deny-by-default Firestore rules for the enrollments collection

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Scaffold web-enrollment library and EnrollmentService

**Files:**
- Create: `libs/web-enrollment/**` (generated)
- Create: `libs/web-enrollment/src/lib/enrollment.service.ts`
- Create: `libs/web-enrollment/src/lib/enrollment.service.spec.ts`
- Modify: `libs/web-enrollment/src/index.ts`

- [ ] **Step 1: Scaffold the library**

Use the `nx-generate` skill to generate an Angular library. Target outcome: a buildable Angular library named **`web-enrollment`** at `libs/web-enrollment`, import path `@learnwren/web-enrollment`, unit-test runner **Vitest**, **no default component** — its setup must match `libs/web-catalog` (compare `tsconfig.json`, `vite.config.mts`, `eslint.config.mjs`, `project.json`).

After generation, delete any generated placeholder component/spec under `libs/web-enrollment/src/lib/` so only `index.ts` remains there.

- [ ] **Step 2: Verify the scaffold**

Run: `pnpm nx test web-enrollment`
Expected: PASS (no tests yet, or an empty suite) — confirms the project is wired into Nx.

Also confirm `@learnwren/web-enrollment` was added to `tsconfig.base.json` `paths` by the generator.

- [ ] **Step 3: Write the failing EnrollmentService test**

Create `libs/web-enrollment/src/lib/enrollment.service.spec.ts`:

```ts
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { EnrollmentService } from './enrollment.service';

describe('EnrollmentService', () => {
  let service: EnrollmentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EnrollmentService);
    http = TestBed.inject(HttpTestingController);
  });

  it('GET /api/enrollments/:courseId for enrolment status', async () => {
    const promise = service.getEnrollmentStatus('c-1');
    http.expectOne('/api/enrollments/c-1').flush({ enrollment: null, isOwner: false });
    expect((await promise).isOwner).toBe(false);
  });

  it('POST /api/enrollments with the courseId in the body', async () => {
    const promise = service.enroll('c-1');
    const req = http.expectOne('/api/enrollments');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ courseId: 'c-1' });
    req.flush({ id: 'c-1__e' });
    await promise;
  });

  it('DELETE /api/enrollments/:courseId to unenrol', async () => {
    const promise = service.unenroll('c-1');
    const req = http.expectOne('/api/enrollments/c-1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    await promise;
  });
});
```

- [ ] **Step 4: Run the test — verify it fails**

Run: `pnpm nx test web-enrollment`
Expected: FAIL — `enrollment.service.ts` does not exist.

- [ ] **Step 5: Implement the service**

Create `libs/web-enrollment/src/lib/enrollment.service.ts`:

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { Enrollment, EnrollmentStatusView } from '@learnwren/shared-data-models';

@Injectable({ providedIn: 'root' })
export class EnrollmentService {
  private readonly http = inject(HttpClient);

  getEnrollmentStatus(courseId: string): Promise<EnrollmentStatusView> {
    return firstValueFrom(
      this.http.get<EnrollmentStatusView>(`/api/enrollments/${courseId}`),
    );
  }

  enroll(courseId: string): Promise<Enrollment> {
    return firstValueFrom(this.http.post<Enrollment>('/api/enrollments', { courseId }));
  }

  unenroll(courseId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/enrollments/${courseId}`));
  }
}
```

- [ ] **Step 6: Export the service**

Set `libs/web-enrollment/src/index.ts` to:

```ts
export { EnrollmentService } from './lib/enrollment.service';
```

- [ ] **Step 7: Run the test — verify it passes**

Run: `pnpm nx test web-enrollment`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add libs/web-enrollment tsconfig.base.json
git commit -m "feat(web-enrollment): scaffold library and EnrollmentService

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Make the login page honour the `redirect` query param

**Files:**
- Modify: `libs/web-auth/src/lib/login-page/login-page.component.ts` (`submit`)
- Modify: `libs/web-auth/src/lib/login-page/login-page.component.spec.ts`

The login page currently always navigates to `/dashboard` after a successful login, ignoring the `redirect` query param that `authGuard` already sets. This fixes that and enables the guest auto-enrol return trip.

- [ ] **Step 1: Write the failing redirect tests**

In `libs/web-auth/src/lib/login-page/login-page.component.spec.ts`, add `Router` to the `@angular/router` import, add `vi` is already imported, and append a new `describe` block at the end of the file:

```ts
describe('LoginPageComponent post-login navigation', () => {
  async function loginOk(queryParamMap: Map<string, string>) {
    const { fixture, httpMock } = setup(queryParamMap);
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ email: 'a@b.c', password: 'Aa1!aaaaaaaa' });
    const submitPromise = cmp.submit();
    httpMock.expectOne('/api/auth/login').flush({});
    httpMock.expectOne('/api/auth/me').flush({
      uid: 'u1', email: 'a@b.c', displayName: 'A', role: 'STUDENT', emailVerified: true,
    });
    await submitPromise;
    return navSpy;
  }

  it('navigates to the redirect param after a successful login', async () => {
    const navSpy = await loginOk(new Map([['redirect', '/catalog/c-1?enroll=1']]));
    expect(navSpy).toHaveBeenCalledWith('/catalog/c-1?enroll=1');
  });

  it('navigates to /dashboard when there is no redirect param', async () => {
    const navSpy = await loginOk(new Map());
    expect(navSpy).toHaveBeenCalledWith('/dashboard');
  });

  it('ignores a redirect value that does not start with /', async () => {
    const navSpy = await loginOk(new Map([['redirect', 'http://evil.example.com']]));
    expect(navSpy).toHaveBeenCalledWith('/dashboard');
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `pnpm nx test web-auth`
Expected: FAIL — the redirect test expects `/catalog/c-1?enroll=1` but the page navigates to `/dashboard`.

- [ ] **Step 3: Honour the redirect param in `submit()`**

In `libs/web-auth/src/lib/login-page/login-page.component.ts`, replace the success branch of `submit()`. The current code is:

```ts
      if (result.ok) {
        await this.router.navigateByUrl('/dashboard');
        return;
      }
```

Replace it with:

```ts
      if (result.ok) {
        const redirect = this.queryParams()?.get('redirect');
        const target = redirect && redirect.startsWith('/') ? redirect : '/dashboard';
        await this.router.navigateByUrl(target);
        return;
      }
```

(The `queryParams` signal already exists on this component.)

- [ ] **Step 4: Run the test — verify it passes**

Run: `pnpm nx test web-auth`
Expected: PASS — all existing login tests plus the three new ones.

- [ ] **Step 5: Commit**

```bash
git add libs/web-auth/src/lib/login-page/
git commit -m "fix(web-auth): honour the redirect query param after login

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: CourseEnrollmentPanelComponent

**Files:**
- Create: `libs/web-enrollment/src/lib/course-enrollment-panel/course-enrollment-panel.component.ts`
- Create: `libs/web-enrollment/src/lib/course-enrollment-panel/course-enrollment-panel.component.html`
- Create: `libs/web-enrollment/src/lib/course-enrollment-panel/course-enrollment-panel.component.spec.ts`
- Modify: `libs/web-enrollment/src/index.ts`

The panel renders the right control for the caller's state, owns the enrol/unenrol calls, the leave-course confirmation dialog, and the guest/auto-enrol flow. It treats an `undefined` or `null` `currentUser()` as "guest" and makes no HTTP call in that case — the app's `provideAppInitializer` resolves auth before any route renders.

- [ ] **Step 1: Write the failing component spec**

Create `libs/web-enrollment/src/lib/course-enrollment-panel/course-enrollment-panel.component.spec.ts`:

```ts
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@learnwren/web-auth';

import { CourseEnrollmentPanelComponent } from './course-enrollment-panel.component';

type User = { uid: string } | null | undefined;

function configure(opts: { user: User; enroll?: string | null }) {
  const navigate = vi.fn().mockResolvedValue(true);
  TestBed.configureTestingModule({
    imports: [CourseEnrollmentPanelComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: { currentUser: () => opts.user } },
      { provide: Router, useValue: { navigate } },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { queryParamMap: convertToParamMap(opts.enroll ? { enroll: opts.enroll } : {}) },
        },
      },
    ],
  });
  return { navigate };
}

function create(courseId = 'c-1'): {
  fixture: ComponentFixture<CourseEnrollmentPanelComponent>;
  http: HttpTestingController;
} {
  const fixture = TestBed.createComponent(CourseEnrollmentPanelComponent);
  (fixture.componentRef as ComponentRef<CourseEnrollmentPanelComponent>).setInput(
    'courseId',
    courseId,
  );
  fixture.detectChanges();
  return { fixture, http: TestBed.inject(HttpTestingController) };
}

const text = (f: ComponentFixture<unknown>) =>
  (f.nativeElement as HTMLElement).textContent ?? '';

describe('CourseEnrollmentPanelComponent — guest', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows Enrol and makes no HTTP call when there is no user', async () => {
    configure({ user: null });
    const { fixture, http } = create();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Enrol');
    http.expectNone(() => true);
  });

  it('navigates to /login with a redirect back to this course (enroll=1)', async () => {
    const { navigate } = configure({ user: null });
    const { fixture } = create('c-9');
    await fixture.whenStable();
    fixture.componentInstance.goToLogin();
    expect(navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { redirect: '/catalog/c-9?enroll=1' },
    });
  });
});

describe('CourseEnrollmentPanelComponent — authenticated', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the owner note when the caller owns the course', async () => {
    configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    http.expectOne('/api/enrollments/c-1').flush({ enrollment: null, isOwner: true });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('You own this course');
  });

  it('shows the Enrolled state for an ACTIVE enrolment', async () => {
    configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    http
      .expectOne('/api/enrollments/c-1')
      .flush({ enrollment: { status: 'ACTIVE' }, isOwner: false });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Enrolled');
    expect(text(fixture)).toContain('Leave course');
  });

  it('shows Enrol for a WITHDRAWN enrolment', async () => {
    configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    http
      .expectOne('/api/enrollments/c-1')
      .flush({ enrollment: { status: 'WITHDRAWN' }, isOwner: false });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Enrol');
    expect(text(fixture)).not.toContain('Leave course');
  });

  it('enrols on click and transitions to the Enrolled state', async () => {
    configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    http.expectOne('/api/enrollments/c-1').flush({ enrollment: null, isOwner: false });
    await fixture.whenStable();
    fixture.detectChanges();

    void fixture.componentInstance.enroll();
    const post = http.expectOne('/api/enrollments');
    expect(post.request.method).toBe('POST');
    post.flush({ id: 'c-1__u1', status: 'ACTIVE' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Leave course');
  });

  it('redirects to /catalog when enrol fails with COURSE_NOT_AVAILABLE', async () => {
    const { navigate } = configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    http.expectOne('/api/enrollments/c-1').flush({ enrollment: null, isOwner: false });
    await fixture.whenStable();

    void fixture.componentInstance.enroll();
    http
      .expectOne('/api/enrollments')
      .flush(
        { error: { code: 'COURSE_NOT_AVAILABLE' } },
        { status: 409, statusText: 'Conflict' },
      );
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/catalog']);
  });

  it('shows an inline error when enrol fails for another reason', async () => {
    configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    http.expectOne('/api/enrollments/c-1').flush({ enrollment: null, isOwner: false });
    await fixture.whenStable();

    void fixture.componentInstance.enroll();
    http
      .expectOne('/api/enrollments')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Something went wrong');
  });

  it('leaves the course after confirmation and returns to the Enrol state', async () => {
    configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    http
      .expectOne('/api/enrollments/c-1')
      .flush({ enrollment: { status: 'ACTIVE' }, isOwner: false });
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentInstance.openConfirm();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Leave this course?');

    void fixture.componentInstance.confirmLeave();
    http.expectOne('/api/enrollments/c-1').flush(null);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Enrol');
    expect(text(fixture)).not.toContain('Leave this course?');
  });

  it('shows a load error with a retry when the status request fails', async () => {
    configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    http
      .expectOne('/api/enrollments/c-1')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain("Couldn't load");
    expect(text(fixture)).toContain('Retry');
  });

  it('auto-enrols when enroll=1 is present and the caller is enrollable', async () => {
    const { navigate } = configure({ user: { uid: 'u1' }, enroll: '1' });
    const { fixture, http } = create();
    http.expectOne('/api/enrollments/c-1').flush({ enrollment: null, isOwner: false });
    await fixture.whenStable();

    const post = http.expectOne('/api/enrollments');
    expect(post.request.body).toEqual({ courseId: 'c-1' });
    post.flush({ id: 'c-1__u1', status: 'ACTIVE' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Leave course');
    // enroll=1 is stripped from the URL after a successful auto-enrol.
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { enroll: null }, replaceUrl: true }),
    );
  });

  it('does not auto-enrol an owner even when enroll=1 is present', async () => {
    configure({ user: { uid: 'u1' }, enroll: '1' });
    const { fixture, http } = create();
    http.expectOne('/api/enrollments/c-1').flush({ enrollment: null, isOwner: true });
    await fixture.whenStable();
    http.expectNone('/api/enrollments');
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `pnpm nx test web-enrollment`
Expected: FAIL — `course-enrollment-panel.component.ts` does not exist.

- [ ] **Step 3: Implement the component class**

Create `libs/web-enrollment/src/lib/course-enrollment-panel/course-enrollment-panel.component.ts`:

```ts
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '@learnwren/web-auth';
import { LwButtonDirective } from '@learnwren/web-ui';

import { EnrollmentService } from '../enrollment.service';

type PanelState = 'LOADING' | 'GUEST' | 'OWNER' | 'ENROLLABLE' | 'ENROLLED' | 'LOAD_ERROR';

@Component({
  selector: 'lib-course-enrollment-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LwButtonDirective],
  templateUrl: './course-enrollment-panel.component.html',
})
export class CourseEnrollmentPanelComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly enrollments = inject(EnrollmentService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly courseId = input.required<string>();

  readonly state = signal<PanelState>('LOADING');
  readonly busy = signal(false);
  readonly actionError = signal<string | null>(null);
  readonly showConfirm = signal(false);

  async ngOnInit(): Promise<void> {
    // undefined (auth not yet resolved, e.g. in a unit test) or null (guest)
    // are both treated as guest — the app resolves auth before routes render.
    if (!this.auth.currentUser()) {
      this.state.set('GUEST');
      return;
    }
    await this.resolveStatus();
    if (
      this.state() === 'ENROLLABLE' &&
      this.route.snapshot.queryParamMap.get('enroll') === '1'
    ) {
      await this.enroll();
      if (this.state() === 'ENROLLED') this.clearEnrollParam();
    }
  }

  private async resolveStatus(): Promise<void> {
    try {
      const view = await this.enrollments.getEnrollmentStatus(this.courseId());
      if (view.isOwner) {
        this.state.set('OWNER');
      } else if (view.enrollment?.status === 'ACTIVE') {
        this.state.set('ENROLLED');
      } else {
        this.state.set('ENROLLABLE');
      }
    } catch {
      this.state.set('LOAD_ERROR');
    }
  }

  /** Guest Enrol click — go to login, return to this course with enroll=1. */
  goToLogin(): void {
    void this.router.navigate(['/login'], {
      queryParams: { redirect: `/catalog/${this.courseId()}?enroll=1` },
    });
  }

  async enroll(): Promise<void> {
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await this.enrollments.enroll(this.courseId());
      this.state.set('ENROLLED');
    } catch (err) {
      if (
        err instanceof HttpErrorResponse &&
        this.errorCode(err) === 'COURSE_NOT_AVAILABLE'
      ) {
        void this.router.navigate(['/catalog']);
        return;
      }
      this.actionError.set('Something went wrong. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }

  openConfirm(): void {
    this.actionError.set(null);
    this.showConfirm.set(true);
  }

  cancelConfirm(): void {
    this.showConfirm.set(false);
  }

  async confirmLeave(): Promise<void> {
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await this.enrollments.unenroll(this.courseId());
      this.showConfirm.set(false);
      this.state.set('ENROLLABLE');
    } catch {
      this.actionError.set('Could not leave the course. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }

  retry(): void {
    this.state.set('LOADING');
    void this.resolveStatus();
  }

  private clearEnrollParam(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { enroll: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private errorCode(err: HttpErrorResponse): string | undefined {
    return (err.error as { error?: { code?: string } } | null)?.error?.code;
  }
}
```

- [ ] **Step 4: Implement the template**

Create `libs/web-enrollment/src/lib/course-enrollment-panel/course-enrollment-panel.component.html`:

```html
<div class="flex flex-col items-start gap-2">
  @switch (state()) {
    @case ('LOADING') {
      <button lwButton variant="primary" type="button" disabled>Loading…</button>
    }
    @case ('GUEST') {
      <button lwButton variant="primary" type="button" (click)="goToLogin()">Enrol</button>
    }
    @case ('OWNER') {
      <p class="text-sm text-ink-2">You own this course.</p>
    }
    @case ('ENROLLABLE') {
      <button
        lwButton
        variant="primary"
        type="button"
        [disabled]="busy()"
        (click)="enroll()"
      >
        Enrol
      </button>
    }
    @case ('ENROLLED') {
      <p class="text-sm font-medium text-ink">Enrolled ✓</p>
      <button lwButton type="button" [disabled]="busy()" (click)="openConfirm()">
        Leave course
      </button>
    }
    @case ('LOAD_ERROR') {
      <p class="text-sm text-ink-2">Couldn't load enrolment status.</p>
      <button lwButton type="button" (click)="retry()">Retry</button>
    }
  }

  @if (actionError(); as msg) {
    <p class="text-sm text-bad" role="alert">{{ msg }}</p>
  }
</div>

@if (showConfirm()) {
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    role="dialog"
    aria-modal="true"
  >
    <div class="w-full max-w-md rounded-lg border border-line bg-bg p-6">
      <h2 class="mb-3 text-lg text-ink">Leave this course?</h2>
      <p class="mb-5 text-sm text-ink-2">
        You will lose access to videos and materials immediately. Your progress will be
        saved for 90 days in case you re-enrol.
      </p>
      <div class="flex justify-end gap-3">
        <button lwButton type="button" (click)="cancelConfirm()">Cancel</button>
        <button
          lwButton
          variant="primary"
          type="button"
          [disabled]="busy()"
          (click)="confirmLeave()"
        >
          Leave course
        </button>
      </div>
    </div>
  </div>
}
```

- [ ] **Step 5: Export the component**

Update `libs/web-enrollment/src/index.ts`:

```ts
export { EnrollmentService } from './lib/enrollment.service';
export { CourseEnrollmentPanelComponent } from './lib/course-enrollment-panel/course-enrollment-panel.component';
```

- [ ] **Step 6: Run the test — verify it passes**

Run: `pnpm nx test web-enrollment`
Expected: PASS — all panel tests green.

- [ ] **Step 7: Lint**

Run: `pnpm nx lint web-enrollment`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add libs/web-enrollment/src
git commit -m "feat(web-enrollment): CourseEnrollmentPanelComponent

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Render the panel on the course detail page

**Files:**
- Modify: `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.ts`
- Modify: `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.html`
- Modify: `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.spec.ts`

- [ ] **Step 1: Update the detail-page spec**

In `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.spec.ts`:

a. Add `provideRouter` to the `@angular/router` import line, so it reads:

```ts
import { ActivatedRoute, convertToParamMap, provideRouter, type ParamMap } from '@angular/router';
```

b. In the `setup()` function's `providers` array, add `provideRouter([])` as the **first** entry (before `provideHttpClient()`), so the panel can inject `Router`. The custom `ActivatedRoute` provider stays last so it still wins:

```ts
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: { paramMap: paramMap.asObservable() } },
    ],
```

c. In the test `it('renders the course detail with the module outline', ...)`, after `await fixture.whenStable();` and the final `fixture.detectChanges();`, add one assertion:

```ts
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('lib-course-enrollment-panel'),
    ).not.toBeNull();
```

> Note: the panel reads `AuthService.currentUser()`, which is `undefined` in this test (no auth bootstrap). The panel treats that as "guest" and makes **no** HTTP call, so the existing `http.expectOne('/api/catalog/...')` assertions are unaffected.

- [ ] **Step 2: Run the test — verify it fails**

Run: `pnpm nx test web-catalog`
Expected: FAIL — the new assertion finds no `lib-course-enrollment-panel` element.

- [ ] **Step 3: Import the panel in the detail-page component**

In `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.ts`:

a. Add the import:

```ts
import { CourseEnrollmentPanelComponent } from '@learnwren/web-enrollment';
```

b. Add `CourseEnrollmentPanelComponent` to the `imports` array of the `@Component` decorator.

- [ ] **Step 4: Render the panel in the detail-page template**

In `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.html`, inside the `<header>` element, immediately after the closing `</div>` of the pills row and before the closing `</header>`, add:

```html
        <lib-course-enrollment-panel [courseId]="course()!.id" />
```

- [ ] **Step 5: Run the test — verify it passes**

Run: `pnpm nx test web-catalog`
Expected: PASS.

- [ ] **Step 6: Lint to confirm the Nx module boundary allows the new edge**

Run: `pnpm nx lint web-catalog`
Expected: PASS — `web-catalog → web-enrollment` is an allowed dependency (both are web-scoped libraries, like the existing `web-catalog → web-ui` edge). If lint reports a missing tag/boundary error, add the same Nx tags `web-catalog` carries to `libs/web-enrollment/project.json`.

- [ ] **Step 7: Commit**

```bash
git add libs/web-catalog/src/lib/course-detail-page/
git commit -m "feat(web-catalog): render the enrolment panel on the course detail page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Full unit-suite + lint + build gate

**Files:** none (verification only)

- [ ] **Step 1: Run the affected gate**

Run: `pnpm affected`
Expected: PASS — lint + test + build + typecheck for every project touched. If anything fails, fix it before continuing.

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`
Expected: PASS — no regressions in `api-auth`, `web-courses`, `web-video`, or any other project.

- [ ] **Step 3: Commit (only if fixes were needed)**

```bash
git add -A
git commit -m "test: fix regressions surfaced by the full slice-B gate

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

(If no fixes were needed, skip this commit.)

---

## Task 17: api-e2e enrolment suite

**Files:**
- Create: `apps/api-e2e/src/enrollment.e2e-spec.ts`

This suite needs the emulator and API running. The `_helpers/auth.ts` module provides `registerStudent`, `registerAndPromoteInstructor`, `API_BASE`, and `initAdmin`.

- [ ] **Step 1: Write the enrolment e2e spec**

Create `apps/api-e2e/src/enrollment.e2e-spec.ts`:

```ts
// NOTE: Run `pnpm emulators` and `pnpm start:api` before executing this suite.
import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

import {
  API_BASE,
  initAdmin,
  registerAndPromoteInstructor,
  registerStudent,
} from './_helpers/auth';

initAdmin();

/** Seed a course document straight into Firestore. */
async function seedCourse(
  status: 'DRAFT' | 'PUBLISHED',
  instructorId: string,
  enrollmentCount = 0,
): Promise<string> {
  const id = `enr-e2e-${status}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();
  await admin
    .firestore()
    .collection('courses')
    .doc(id)
    .set({
      id,
      title: 'Enrolment e2e course',
      description: 'course',
      instructorId,
      status,
      enrollmentCount,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  return id;
}

test('enrol then read status reflects ACTIVE and increments the course counter', async ({
  request,
}) => {
  const student = await registerStudent(request);
  const courseId = await seedCourse('PUBLISHED', 'some-instructor', 4);

  const post = await request.post(`${API_BASE}/enrollments`, {
    headers: { cookie: student.cookieHeader },
    data: { courseId },
  });
  expect(post.status()).toBe(201);
  expect((await post.json()).status).toBe('ACTIVE');

  const get = await request.get(`${API_BASE}/enrollments/${courseId}`, {
    headers: { cookie: student.cookieHeader },
  });
  expect(get.status()).toBe(200);
  const view = await get.json();
  expect(view.enrollment.status).toBe('ACTIVE');
  expect(view.isOwner).toBe(false);

  const courseSnap = await admin.firestore().collection('courses').doc(courseId).get();
  expect(courseSnap.data()?.['enrollmentCount']).toBe(5);
});

test('unenrol soft-deletes the enrolment and re-enrol restores it', async ({ request }) => {
  const student = await registerStudent(request);
  const courseId = await seedCourse('PUBLISHED', 'some-instructor');

  await request.post(`${API_BASE}/enrollments`, {
    headers: { cookie: student.cookieHeader },
    data: { courseId },
  });

  const del = await request.delete(`${API_BASE}/enrollments/${courseId}`, {
    headers: { cookie: student.cookieHeader },
  });
  expect(del.status()).toBe(204);

  const afterDelete = await request.get(`${API_BASE}/enrollments/${courseId}`, {
    headers: { cookie: student.cookieHeader },
  });
  expect((await afterDelete.json()).enrollment.status).toBe('WITHDRAWN');

  const reEnrol = await request.post(`${API_BASE}/enrollments`, {
    headers: { cookie: student.cookieHeader },
    data: { courseId },
  });
  expect(reEnrol.status()).toBe(201);
  expect((await reEnrol.json()).status).toBe('ACTIVE');
});

test('enrol on an unpublished course is rejected with 409', async ({ request }) => {
  const student = await registerStudent(request);
  const courseId = await seedCourse('DRAFT', 'some-instructor');

  const res = await request.post(`${API_BASE}/enrollments`, {
    headers: { cookie: student.cookieHeader },
    data: { courseId },
  });
  expect(res.status()).toBe(409);
  expect((await res.json()).error.code).toBe('COURSE_NOT_AVAILABLE');
});

test('the course owner cannot enrol in their own course', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const courseId = await seedCourse('PUBLISHED', instructor.uid);

  const res = await request.post(`${API_BASE}/enrollments`, {
    headers: { cookie: instructor.cookieHeader },
    data: { courseId },
  });
  expect(res.status()).toBe(409);
  expect((await res.json()).error.code).toBe('CANNOT_ENROLL_OWN_COURSE');
});

test('unenrol when not enrolled is rejected with 404', async ({ request }) => {
  const student = await registerStudent(request);
  const courseId = await seedCourse('PUBLISHED', 'some-instructor');

  const res = await request.delete(`${API_BASE}/enrollments/${courseId}`, {
    headers: { cookie: student.cookieHeader },
  });
  expect(res.status()).toBe(404);
  expect((await res.json()).error.code).toBe('NOT_ENROLLED');
});

test('all enrolment endpoints reject an unauthenticated caller with 401', async ({
  request,
}) => {
  const courseId = await seedCourse('PUBLISHED', 'some-instructor');

  expect((await request.post(`${API_BASE}/enrollments`, { data: { courseId } })).status()).toBe(
    401,
  );
  expect((await request.get(`${API_BASE}/enrollments/${courseId}`)).status()).toBe(401);
  expect((await request.delete(`${API_BASE}/enrollments/${courseId}`)).status()).toBe(401);
});
```

- [ ] **Step 2: Add a guard-wiring regression to the materials e2e flow**

Append two tests to `apps/api-e2e/src/enrollment.e2e-spec.ts` that prove `MaterialAccessGuard` now grants enrolled-student access. Seed a `READY` material directly:

```ts
/** Seed a READY material straight into Firestore. */
async function seedMaterial(courseId: string, ownerInstructorId: string): Promise<string> {
  const id = `enr-e2e-mat-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();
  await admin
    .firestore()
    .collection('materials')
    .doc(id)
    .set({
      id,
      ownerInstructorId,
      courseId,
      lessonId: 'enr-e2e-lesson',
      displayName: 'Notes',
      originalFilename: 'notes.pdf',
      extension: 'pdf',
      contentType: 'application/pdf',
      sizeBytes: 1024,
      state: 'READY',
      storage: { bucket: 'demo-learnwren.appspot.com', path: `materials/${id}/source.pdf` },
      createdAt: now,
      updatedAt: now,
    });
  return id;
}

test('an enrolled student can reach the material download-url endpoint', async ({
  request,
}) => {
  const student = await registerStudent(request);
  const courseId = await seedCourse('PUBLISHED', 'some-instructor');
  const matId = await seedMaterial(courseId, 'some-instructor');

  await request.post(`${API_BASE}/enrollments`, {
    headers: { cookie: student.cookieHeader },
    data: { courseId },
  });

  const res = await request.get(`${API_BASE}/materials/${matId}/download-url`, {
    headers: { cookie: student.cookieHeader },
  });
  // The guard must let the enrolled student through — never a 403.
  expect(res.status()).not.toBe(403);
});

test('a non-enrolled non-owner is 403 from the material download-url endpoint', async ({
  request,
}) => {
  const student = await registerStudent(request);
  const courseId = await seedCourse('PUBLISHED', 'some-instructor');
  const matId = await seedMaterial(courseId, 'some-instructor');

  const res = await request.get(`${API_BASE}/materials/${matId}/download-url`, {
    headers: { cookie: student.cookieHeader },
  });
  expect(res.status()).toBe(403);
});
```

- [ ] **Step 3: Run the api-e2e suite**

Start the emulator and API in separate terminals (`pnpm emulators`, then `pnpm start:api`), then run:

Run: `pnpm nx e2e api-e2e`
Expected: PASS — the new `enrollment.e2e-spec.ts` and the updated `firestore-rules.e2e-spec.ts` (Task 11) and `catalog.e2e-spec.ts` (Task 10) all pass. Pre-existing quarantined video tests (`test.fixme`) remain skipped.

- [ ] **Step 4: Commit**

```bash
git add apps/api-e2e/src/enrollment.e2e-spec.ts
git commit -m "test(api-e2e): cover the enrolment endpoints and guard wiring

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 18: web-e2e enrolment journeys

**Files:**
- Create: `apps/web-e2e/src/enrollment.spec.ts`

- [ ] **Step 1: Write the web-e2e enrolment journeys**

Create `apps/web-e2e/src/enrollment.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099';
  process.env['FIRESTORE_EMULATOR_HOST'] = '127.0.0.1:8080';
  admin.initializeApp({ projectId: 'demo-learnwren' });
}

const API_BASE = 'http://localhost:3333/api';

/** Register a STUDENT and mark the address verified so they can log in. */
async function registerVerifiedStudent(): Promise<{ email: string; password: string }> {
  const email = `web-e2e-enr-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
  const password = 'Aa1!aaaaaaaa';
  const reg = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName: 'S' }),
  });
  expect(reg.status).toBe(201);
  const { uid } = (await reg.json()) as { uid: string };
  await admin.auth().updateUser(uid, { emailVerified: true });
  return { email, password };
}

/** Seed a PUBLISHED course straight into Firestore and return its id. */
async function seedPublishedCourse(): Promise<string> {
  const id = `web-e2e-enr-course-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();
  await admin
    .firestore()
    .collection('courses')
    .doc(id)
    .set({
      id,
      title: 'Enrolment Journey Course',
      description: 'A course to enrol in.',
      instructorId: 'web-e2e-enr-instructor',
      status: 'PUBLISHED',
      enrollmentCount: 0,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  return id;
}

test('a logged-in student can enrol and then leave a course', async ({ page }) => {
  const { email, password } = await registerVerifiedStudent();
  const courseId = await seedPublishedCourse();

  // Log in via the web login page.
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });

  // Open the course and enrol.
  await page.goto(`/catalog/${courseId}`);
  await page.getByRole('button', { name: 'Enrol' }).click();
  await expect(page.getByText('Enrolled', { exact: false })).toBeVisible({ timeout: 10_000 });

  // Leave the course via the confirmation dialog.
  await page.getByRole('button', { name: 'Leave course' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave course' }).click();
  await expect(page.getByRole('button', { name: 'Enrol' })).toBeVisible({ timeout: 10_000 });
});

test('a guest who clicks Enrol is sent to login and auto-enrolled on return', async ({
  page,
}) => {
  const { email, password } = await registerVerifiedStudent();
  const courseId = await seedPublishedCourse();

  // Visit the course as a guest and click Enrol.
  await page.goto(`/catalog/${courseId}`);
  await page.getByRole('button', { name: 'Enrol' }).click();
  await page.waitForURL(/\/login/, { timeout: 10_000 });

  // Log in — the page should return to the course and auto-enrol.
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  await page.waitForURL(new RegExp(`/catalog/${courseId}`), { timeout: 10_000 });
  await expect(page.getByText('Enrolled', { exact: false })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Leave course' })).toBeVisible();
});
```

- [ ] **Step 2: Run the web-e2e suite**

With `pnpm emulators` and `pnpm start` running, run:

Run: `pnpm nx e2e web-e2e`
Expected: PASS — the two new enrolment journeys and all existing web-e2e specs pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web-e2e/src/enrollment.spec.ts
git commit -m "test(web-e2e): cover the enrol/leave and guest auto-enrol journeys

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 19: Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/USER_GUIDE.md`
- Modify: `docs/use-cases/05-course-discovery-and-enrollment.md`

- [ ] **Step 1: Update the README**

In `README.md`:

a. In the `PROJECT STATUS` note, update the EP-05 line. Replace the sentence "Enrolment (EP-05 Slice B — UC-05-04/05) and enrolled-student playback (EP-06) remain deferred." with:

```
**EP-05 Slice B (Course Enrolment) complete:** logged-in students enrol in and leave published courses; enrolment grants video/material access and feeds a Most Popular catalogue sort; guests who click Enrol are sent to login and auto-enrolled on return. Enrolled-student playback UI (EP-06) remains deferred.
```

b. In the Monorepo Layout `libs/` block, add a line after `web-catalog`:

```
│   ├── web-catalog/        # Angular standalone components for public course discovery (catalogue, search, course detail)
│   └── web-enrollment/     # Angular enrol/leave panel for the course detail page
```

c. In the project table, add a row after the `web-catalog` row:

```
| `web-enrollment` | Library | Angular standalone `EnrollmentService` + `CourseEnrollmentPanelComponent` |
```

d. Add a new API table after the "EP-05 Slice A" table:

```
The API endpoints exposed by EP-05 Slice B (course enrolment — session cookie required):

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/enrollments` | Enrol the caller in the body-supplied course (restores a withdrawn enrolment). |
| `DELETE` | `/api/enrollments/:courseId` | Unenrol the caller (soft-delete; progress retained 90 days). |
| `GET` | `/api/enrollments/:courseId` | The caller's enrolment status for that course, plus whether they own it. |
```

e. Add a deferred-items note near the EP-05 status, recording the two non-goals:

```
> EP-05 Slice B deferred follow-ups: the 90-day purge of withdrawn enrolments (soft-delete + restore-on-re-enrol ship; the scheduled hard-delete does not), and access revocation when a course is unpublished after enrolment.
```

- [ ] **Step 2: Update the USER_GUIDE**

In `docs/USER_GUIDE.md`, add a section documenting enrolment: how a student enrols from a course detail page, how leaving a course works (confirmation, 90-day progress retention), and that a guest who clicks Enrol is sent to log in and is enrolled automatically on return. Match the document's existing heading style and "what is deferred" framing — note that the lesson player itself arrives with EP-06.

- [ ] **Step 3: Update the use-case drift banner**

In `docs/use-cases/05-course-discovery-and-enrollment.md`, update the `> [!NOTE]` drift banner near the top. It currently says EP-05 is entirely deferred. Replace it with a note that UC-05-01..05 are now implemented (Slice A: discovery; Slice B: enrolment), the `Enrollment` type is now backed by behaviour, and the `POPULAR` sort named in UC-05-01 extension 2c now exists.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/USER_GUIDE.md docs/use-cases/05-course-discovery-and-enrollment.md
git commit -m "docs: record EP-05 Slice B course enrolment

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 20: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full gate**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: PASS for every project.

- [ ] **Step 2: E2E gate**

With `pnpm emulators` and `pnpm start` running:

Run: `pnpm e2e`
Expected: PASS — `api-e2e` and `web-e2e` both green (quarantined video `test.fixme` tests remain skipped).

- [ ] **Step 3: Manual smoke (optional but recommended)**

With the emulator and apps running: register a student, verify the email via the Auth emulator UI, publish a course as an instructor, then as the student open `/catalog/:id`, click **Enrol**, confirm the page shows **Enrolled** and **Leave course**, then leave the course and confirm it returns to **Enrol**. Open the catalogue and confirm the **POPULAR** sort option appears and orders by enrolment count.

- [ ] **Step 4: Integrate the branch**

The slice is complete. Use the `superpowers:finishing-a-development-branch` skill to land `feat/ep-05-slice-b-enrolment` — per the project's branch-isolation preference, this is a local `--no-ff` merge to `main`.

---

## Spec Coverage Check

| Spec requirement | Task(s) |
| :--- | :--- |
| `Enrollment` model: `status`, `withdrawnAt`, `EnrollmentStatus`, `EnrollmentStatusView` | 1 |
| `Course.enrollmentCount` (optional) | 1 |
| `enrollments` collection, composite ID, transactional counter | 3 |
| Enrol transaction (create / restore / idempotent / PUBLISHED check) | 3 |
| Unenrol transaction (soft-delete, counter decrement, floor at 0) | 3 |
| `isEnrolled` / `getEnrollment` | 3 |
| Owner-self-enrol rejection | 4 |
| `EnrollCourseDto` | 5 |
| Three endpoints, session-derived uid, `FirebaseSessionGuard` | 6 |
| `CoursesModule` wiring, `enrollmentCount: 0` seed | 7 |
| `EnrollmentOrOwnerGuard` wired | 8 |
| `MaterialAccessGuard` wired | 9 |
| `POPULAR` sort | 1 (const), 10 (service + tests) |
| Error codes `COURSE_NOT_AVAILABLE` / `CANNOT_ENROLL_OWN_COURSE` / `NOT_ENROLLED` | 2 |
| Firestore rules for `enrollments` | 11 |
| `web-enrollment` library + `EnrollmentService` | 12 |
| Login page honours `redirect` | 13 |
| `CourseEnrollmentPanelComponent` (states, enrol, leave+dialog, auto-enrol, errors) | 14 |
| Panel rendered on the course detail page | 15 |
| api-e2e enrolment + guard-wiring + rules | 16 (rules run), 17 |
| web-e2e enrol/leave + guest auto-enrol journeys | 18 |
| Documentation (README, USER_GUIDE, drift banner, deferred follow-ups) | 19 |
