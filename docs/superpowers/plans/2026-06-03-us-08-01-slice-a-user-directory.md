# US-08-01 Slice A — User Directory (read-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an ADMIN-only, read-only user directory — a searchable/paginated list of all users (`GET /api/admin/users`) and a per-user detail page (`GET /api/admin/users/:uid`) showing profile, role, registration date, enrollment history, and authored courses — surfaced in the existing `web-admin` lib.

**Architecture:** A new `users/` submodule in `libs/api-profile` (controller + service + repository + per-feature exception filter), guarded by the existing `FirebaseSessionGuard` + `AdminRoleGuard`. The whole-collection user scan is added to `libs/api-firebase`'s `user-profile.reader.ts` (the single source of truth for reading the `users` collection); enrollment/course joins are read directly via Firestore in a local `AdminUsersRepository` (no dependency on `api-courses`). The service holds all pure logic (substring filter, sort, pagination, cap detection, join, fallbacks) and is unit-tested against a stubbed repository. The web side extends `web-admin` with two lazy pages under the already-guarded `admin` route and a `Users` nav link.

**Tech Stack:** Nx monorepo (pnpm), NestJS 11 + firebase-admin (api), Angular 21 standalone/OnPush/signals (web), Firestore, vitest (unit), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-06-03-us-08-01-slice-a-user-directory-design.md`

**Execution note (workspace isolation):** Per the team's branch-isolation preference, execute this plan in a git worktree branched from local `HEAD` (e.g. `git worktree add ../lw-ep08-us0801a -b feat/ep08-us-08-01-slice-a HEAD`), symlink `node_modules` to the parent, and land via a local `--no-ff` merge to `main` at the end. **Never `git add -A`** (the `node_modules` symlink evades `.gitignore`). Stage explicit paths in every commit. The build/typecheck gate matters here: vitest masks tsc errors in this repo, so the final gate runs `pnpm nx build api` and `pnpm nx build web`, not just unit tests.

**Commit convention:** Conventional Commits. Every commit message ends with the trailer:
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```
The trailer is shown in Task 1's commit and omitted from later commit examples for brevity — include it every time.

**Type/wiring facts (verified against current code, do not re-derive):**
- `AdminRoleGuard` + `FirebaseSessionGuard` are exported from `@learnwren/api-auth`; apply as `@UseGuards(FirebaseSessionGuard, AdminRoleGuard)` (order matters — session guard first populates `req.user`).
- `AuthException` + `InsufficientRoleException` are exported from `@learnwren/api-auth`. `InsufficientRoleException` → `{ code: 'INSUFFICIENT_ROLE', message: 'Insufficient role.', status: 403 }`.
- `handleException(host, exception, logger)` is exported from `@learnwren/api-http-errors`; per-feature filters delegate to it entirely.
- `FIRESTORE` token + `FirestoreHandle` type + `readStoredUserProfiles` + `StoredUserProfile` are exported from `@learnwren/api-firebase`.
- The `users/{uid}` doc persists `{ id, email, displayName, biography, role, createdAt, updatedAt }` (written at registration).
- `FieldPath` for `documentId()` ordering: `import { FieldPath } from 'firebase-admin/firestore';` then `.orderBy(FieldPath.documentId())`. (No existing `FieldPath`/`documentId()` usage in the repo — this is the first.)
- A user doc's `id` is the document KEY, not a body field on `StoredUserProfile` — combine `d.id` when mapping a scan.
- `api-profile` & `web-admin` `project.json` are nearly empty; `test`/`typecheck`/`build`/`lint` targets are inferred. Run via `pnpm nx <target> <project>`; scope a single test file with `pnpm nx test <project> -- <file>`.

---

## Task 1: shared-data-models — admin-user view types + error-code unions

**Files:**
- Create: `libs/shared-data-models/src/lib/admin-user.ts`
- Create: `libs/shared-data-models/src/lib/admin-user.spec.ts`
- Modify: `libs/shared-data-models/src/index.ts` (append barrel export)
- Modify: `libs/shared-data-models/src/lib/api-error.ts` (append error-code unions)

- [ ] **Step 1: Write the failing spec** (`libs/shared-data-models/src/lib/admin-user.spec.ts`)

```ts
import { describe, expect, it } from 'vitest';

import type { CourseId, ISODateString, UserId } from './common';
import type {
  AdminAuthoredCourseRow,
  AdminUserDetail,
  AdminUserEnrollmentRow,
  AdminUserListResponse,
  AdminUserListRow,
} from './admin-user';

describe('admin-user model', () => {
  it('accepts a fully-populated AdminUserListRow', () => {
    const row: AdminUserListRow = {
      id: 'u1' as UserId,
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      role: 'STUDENT',
      createdAt: '2026-06-01T00:00:00.000Z' as ISODateString,
    };
    expect(row.role).toBe('STUDENT');
  });

  it('accepts an AdminUserListResponse with paging + capped', () => {
    const res: AdminUserListResponse = {
      users: [],
      total: 0,
      page: 1,
      pageSize: 20,
      capped: false,
    };
    expect(res.capped).toBe(false);
  });

  it('accepts an AdminUserDetail with enrollment + authored sections', () => {
    const enrolment: AdminUserEnrollmentRow = {
      courseId: 'c1' as CourseId,
      courseTitle: 'Intro',
      status: 'ACTIVE',
      enrolledAt: '2026-06-02T00:00:00.000Z' as ISODateString,
    };
    const authored: AdminAuthoredCourseRow = {
      courseId: 'c2' as CourseId,
      title: 'Advanced',
      status: 'PUBLISHED',
    };
    const detail: AdminUserDetail = {
      id: 'u1' as UserId,
      displayName: 'Ada',
      email: 'ada@example.com',
      biography: '',
      role: 'INSTRUCTOR',
      createdAt: '2026-06-01T00:00:00.000Z' as ISODateString,
      enrollments: [enrolment],
      authoredCourses: [authored],
    };
    expect(detail.enrollments[0]?.status).toBe('ACTIVE');
    expect(detail.authoredCourses[0]?.status).toBe('PUBLISHED');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx test shared-data-models -- admin-user.spec.ts`
Expected: FAIL — cannot find module `./admin-user`.

- [ ] **Step 3: Create the types** (`libs/shared-data-models/src/lib/admin-user.ts`)

```ts
import type { CourseId, ISODateString, UserId } from './common';
import type { UserRole } from './user';
import type { CourseStatus } from './course';
import type { EnrollmentStatus } from './enrollment';

/** One row of the admin user directory (GET /api/admin/users). */
export interface AdminUserListRow {
  id: UserId;
  /** '(no display name)' fallback applied server-side when the stored name is blank. */
  displayName: string;
  email: string;
  role: UserRole;
  createdAt: ISODateString;
}

/** Response of GET /api/admin/users. */
export interface AdminUserListResponse {
  users: AdminUserListRow[];
  /** Count after the search filter, before paging. */
  total: number;
  page: number;
  pageSize: number;
  /** True when the users collection exceeded the admin scan cap. */
  capped: boolean;
}

/** One enrollment in a user's history (any status). */
export interface AdminUserEnrollmentRow {
  courseId: CourseId;
  /** '(course deleted)' when the referenced course no longer exists. */
  courseTitle: string;
  status: EnrollmentStatus;
  /** Enrollment.createdAt. */
  enrolledAt: ISODateString;
}

/** One course authored by the user (instructors only). */
export interface AdminAuthoredCourseRow {
  courseId: CourseId;
  title: string;
  status: CourseStatus;
}

/** Response of GET /api/admin/users/:uid. */
export interface AdminUserDetail {
  id: UserId;
  displayName: string;
  email: string;
  biography: string;
  photoUrl?: string;
  role: UserRole;
  createdAt: ISODateString;
  /** Enrollment history (ACTIVE + WITHDRAWN), newest first. */
  enrollments: AdminUserEnrollmentRow[];
  /** Courses this user authored; empty unless they own some. */
  authoredCourses: AdminAuthoredCourseRow[];
}
```

(Note: `updatedAt` from the spec's sketch is intentionally omitted — the detail UI renders only the registration date, so it is YAGNI and keeps the user reader from needing an extra field.)

- [ ] **Step 4: Append the error-code unions** to the END of `libs/shared-data-models/src/lib/api-error.ts` (after the `ApiAuthErrorBody` export):

```ts

/** Authoritative admin-users-domain error codes (the `code` of every AdminUsersException). */
export type AdminUsersErrorCode = 'USER_NOT_FOUND' | 'INTERNAL';

/**
 * Codes a web client may receive from an admin-users endpoint: the domain codes
 * plus the cross-cutting guard codes those ADMIN-guarded routes surface.
 */
export type AdminUsersApiErrorCode = AdminUsersErrorCode | 'INSUFFICIENT_ROLE' | 'UNAUTHENTICATED';

export type AdminUsersApiErrorBody = ApiErrorBody<AdminUsersApiErrorCode>;
```

- [ ] **Step 5: Register the new model file in the barrel** — append to `libs/shared-data-models/src/index.ts` (after the existing last line `export * from './lib/api-error';`):

```ts
export * from './lib/admin-user';
```

- [ ] **Step 6: Run the spec to verify it passes**

Run: `pnpm nx test shared-data-models -- admin-user.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add libs/shared-data-models/src/lib/admin-user.ts \
        libs/shared-data-models/src/lib/admin-user.spec.ts \
        libs/shared-data-models/src/lib/api-error.ts \
        libs/shared-data-models/src/index.ts
git commit -m "$(cat <<'EOF'
feat(shared-data-models): add admin-user directory view types + error codes

US-08-01 Slice A: AdminUserListRow/Response, AdminUserDetail with
enrollment + authored-course rows, and the AdminUsersErrorCode /
AdminUsersApiErrorCode unions.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: api-firebase — extend StoredUserProfile + add the all-users scan reader

**Files:**
- Modify: `libs/api-firebase/src/lib/user-profile.reader.ts` (extend interface, add scan fn, edit the "ONLY place" comment)
- Modify: `libs/api-firebase/src/index.ts` (export `scanStoredUserProfiles` + `StoredUserRecord`)
- Test: `libs/api-firebase/src/lib/user-profile.reader.spec.ts` (add scan tests)

- [ ] **Step 1: Write the failing test** — append these cases to `libs/api-firebase/src/lib/user-profile.reader.spec.ts` (keep existing imports; add `scanStoredUserProfiles`, `type StoredUserRecord` to the import from `./user-profile.reader`):

```ts
describe('scanStoredUserProfiles', () => {
  function fakeFirestore(docs: Array<{ id: string; data: Record<string, unknown> }>) {
    let capturedLimit = -1;
    const handle = {
      collection: () => ({
        orderBy: () => ({
          limit: (n: number) => {
            capturedLimit = n;
            return {
              get: async () => ({
                docs: docs.slice(0, n).map((d) => ({ id: d.id, data: () => d.data })),
              }),
            };
          },
        }),
      }),
      // expose for assertion
      get capturedLimit() {
        return capturedLimit;
      },
    };
    return handle as unknown as Parameters<typeof scanStoredUserProfiles>[0] & {
      capturedLimit: number;
    };
  }

  it('maps each doc to a record carrying the doc key as id plus its fields', async () => {
    const fs = fakeFirestore([
      { id: 'u1', data: { displayName: 'Ada', email: 'ada@x.com', role: 'STUDENT', createdAt: '2026-06-01T00:00:00.000Z' } },
      { id: 'u2', data: { displayName: 'Bob', email: 'bob@x.com', role: 'INSTRUCTOR', createdAt: '2026-06-02T00:00:00.000Z' } },
    ]);
    const records: StoredUserRecord[] = await scanStoredUserProfiles(fs, 5001);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ id: 'u1', displayName: 'Ada', role: 'STUDENT' });
    expect(records[1]?.id).toBe('u2');
    expect(fs.capturedLimit).toBe(5001);
  });

  it('honours the limit argument', async () => {
    const fs = fakeFirestore(
      Array.from({ length: 10 }, (_, i) => ({ id: `u${i}`, data: { email: `u${i}@x.com` } })),
    );
    const records = await scanStoredUserProfiles(fs, 3);
    expect(records).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx test api-firebase -- user-profile.reader.spec.ts`
Expected: FAIL — `scanStoredUserProfiles` / `StoredUserRecord` not exported.

- [ ] **Step 3: Edit `libs/api-firebase/src/lib/user-profile.reader.ts`** — three edits:

(a) Add the FieldPath import at the top (next to the existing imports):

```ts
import { FieldPath } from 'firebase-admin/firestore';
```

(b) Extend `StoredUserProfile` with two optional fields (add inside the interface):

```ts
  /** Persisted role; absent on very old/partial docs. */
  role?: import('@learnwren/shared-data-models').UserRole;
  /** Account registration timestamp. */
  createdAt?: import('@learnwren/shared-data-models').ISODateString;
```

(c) Update the doc comment so the "ONLY place" claim stays true — change the enumeration line that lists `(roster, instructor directory, admin application review)` to:

```
 * directory, admin application review, admin user management).
```

(d) Append the record type + scan function at the end of the file:

```ts
/** A scanned user profile combined with its document key (the uid). */
export interface StoredUserRecord extends StoredUserProfile {
  id: string;
}

/**
 * Scan up to `limit` `users/{uid}` documents ordered by document id. The cap
 * bounds the cost of the ADMIN user directory until cursor pagination is wired
 * in; callers detect truncation by requesting one past their page size. The
 * uid is the document key (not a stored field), so it is merged in here.
 */
export async function scanStoredUserProfiles(
  firestore: FirestoreHandle,
  limit: number,
): Promise<StoredUserRecord[]> {
  const snap = await firestore.collection(USERS).orderBy(FieldPath.documentId()).limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as StoredUserProfile) }));
}
```

- [ ] **Step 4: Export from the barrel** — edit `libs/api-firebase/src/index.ts`, changing the user-profile reader export line to add the new symbols:

```ts
export {
  readStoredUserProfiles,
  scanStoredUserProfiles,
  type StoredUserProfile,
  type StoredUserRecord,
} from './lib/user-profile.reader';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm nx test api-firebase -- user-profile.reader.spec.ts`
Expected: PASS (existing tests + 2 new scan tests).

- [ ] **Step 6: Typecheck the lib** (it now imports from shared-data-models via inline `import('...')`):

Run: `pnpm nx typecheck api-firebase`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add libs/api-firebase/src/lib/user-profile.reader.ts \
        libs/api-firebase/src/lib/user-profile.reader.spec.ts \
        libs/api-firebase/src/index.ts
git commit -m "feat(api-firebase): add scanStoredUserProfiles + role/createdAt on StoredUserProfile

US-08-01 Slice A: whole-collection user scan (orderBy documentId, capped)
for the admin directory, kept in the single users-reader source of truth.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: api-profile — AdminUsersException

**Files:**
- Create: `libs/api-profile/src/lib/users/errors/admin-users.exception.ts`
- Create: `libs/api-profile/src/lib/users/errors/admin-users.exception.spec.ts`

- [ ] **Step 1: Write the failing test** (`admin-users.exception.spec.ts`)

```ts
import { describe, expect, it } from 'vitest';

import { AdminUsersException, UserNotFoundException } from './admin-users.exception';

describe('AdminUsersException', () => {
  it('UserNotFoundException carries code USER_NOT_FOUND and status 404', () => {
    const err = new UserNotFoundException();
    expect(err).toBeInstanceOf(AdminUsersException);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('USER_NOT_FOUND');
    expect(err.status).toBe(404);
    expect(err.message).toBe('No such user.');
    expect(err.name).toBe('AdminUsersException');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx test api-profile -- admin-users.exception.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the exception** (`admin-users.exception.ts`)

```ts
import type { AdminUsersErrorCode } from '@learnwren/shared-data-models';

export class AdminUsersException extends Error {
  constructor(
    public readonly code: AdminUsersErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AdminUsersException';
  }
}

export class UserNotFoundException extends AdminUsersException {
  constructor() {
    super('USER_NOT_FOUND', 'No such user.', 404);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm nx test api-profile -- admin-users.exception.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-profile/src/lib/users/errors/admin-users.exception.ts \
        libs/api-profile/src/lib/users/errors/admin-users.exception.spec.ts
git commit -m "feat(api-profile): add AdminUsersException (USER_NOT_FOUND -> 404)"
```

---

## Task 4: api-profile — AdminUsersExceptionFilter

**Files:**
- Create: `libs/api-profile/src/lib/users/admin-users.exception-filter.ts`
- Create: `libs/api-profile/src/lib/users/admin-users.exception-filter.spec.ts`

- [ ] **Step 1: Write the failing test** (`admin-users.exception-filter.spec.ts`)

```ts
import { describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';

import { AuthException, InsufficientRoleException } from '@learnwren/api-auth';

import { AdminUsersExceptionFilter } from './admin-users.exception-filter';
import { UserNotFoundException } from './errors/admin-users.exception';

function mockHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AdminUsersExceptionFilter', () => {
  it('renders UserNotFoundException as HTTP 404 with USER_NOT_FOUND', () => {
    const { host, status, json } = mockHost();
    new AdminUsersExceptionFilter().catch(new UserNotFoundException(), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'USER_NOT_FOUND', message: 'No such user.' },
    });
  });

  it('maps the AdminRoleGuard rejection (InsufficientRoleException) to 403', () => {
    const { host, status, json } = mockHost();
    new AdminUsersExceptionFilter().catch(new InsufficientRoleException(), host);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INSUFFICIENT_ROLE', message: 'Insufficient role.' },
    });
  });

  it('maps a guard 401 (AuthException) to its status code', () => {
    const { host, status, json } = mockHost();
    new AdminUsersExceptionFilter().catch(
      new AuthException('UNAUTHENTICATED', 'Not authenticated.', 401),
      host,
    );
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHENTICATED', message: 'Not authenticated.' },
    });
  });

  it('maps a generic HttpException to its status code', () => {
    const { host, status, json } = mockHost();
    new AdminUsersExceptionFilter().catch(new HttpException('nope', 403), host);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: { code: 'FORBIDDEN', message: 'nope' } });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx test api-profile -- admin-users.exception-filter.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the filter** (`admin-users.exception-filter.ts`)

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { handleException } from '@learnwren/api-http-errors';
import { AuthException } from '@learnwren/api-auth';

import { AdminUsersException } from './errors/admin-users.exception';

@Catch(AdminUsersException, AuthException, HttpException)
export class AdminUsersExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('AdminUsersExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm nx test api-profile -- admin-users.exception-filter.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add libs/api-profile/src/lib/users/admin-users.exception-filter.ts \
        libs/api-profile/src/lib/users/admin-users.exception-filter.spec.ts
git commit -m "feat(api-profile): add AdminUsersExceptionFilter (guard 401/403 + USER_NOT_FOUND)"
```

---

## Task 5: api-profile — AdminUsersRepository

**Files:**
- Create: `libs/api-profile/src/lib/users/admin-users.repository.ts`
- Create: `libs/api-profile/src/lib/users/admin-users.repository.spec.ts`

- [ ] **Step 1: Write the failing test** (`admin-users.repository.spec.ts`)

```ts
import { describe, expect, it } from 'vitest';
import type { FirestoreHandle } from '@learnwren/api-firebase';
import type { CourseId, UserId } from '@learnwren/shared-data-models';

import { AdminUsersRepository } from './admin-users.repository';

/**
 * Minimal Firestore fake covering the calls AdminUsersRepository makes:
 *  - collection(name).where(field,'==',value).get() -> { docs }
 *  - collection(name).doc(id).get() -> { exists, data() }
 */
function fakeFirestore(opts: {
  enrollments?: Array<Record<string, unknown>>;
  authored?: Array<Record<string, unknown>>;
  coursesById?: Record<string, Record<string, unknown> | undefined>;
  usersById?: Record<string, Record<string, unknown> | undefined>;
}): FirestoreHandle {
  return {
    collection: (name: string) => ({
      where: (_field: string, _op: string, _value: unknown) => ({
        get: async () => ({
          docs:
            name === 'enrollments'
              ? (opts.enrollments ?? []).map((d) => ({ data: () => d }))
              : (opts.authored ?? []).map((d) => ({ data: () => d })),
        }),
      }),
      doc: (id: string) => ({
        get: async () => {
          const map = name === 'courses' ? opts.coursesById : opts.usersById;
          const data = map?.[id];
          return { exists: data !== undefined, data: () => data };
        },
      }),
    }),
  } as unknown as FirestoreHandle;
}

describe('AdminUsersRepository', () => {
  it('listEnrollmentsByUser maps enrollment docs', async () => {
    const repo = new AdminUsersRepository(
      fakeFirestore({
        enrollments: [
          { id: 'u1__c1', userId: 'u1', courseId: 'c1', status: 'ACTIVE', createdAt: '2026-06-02T00:00:00.000Z' },
        ],
      }),
    );
    const rows = await repo.listEnrollmentsByUser('u1' as UserId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.courseId).toBe('c1');
  });

  it('getCourseTitle returns the title when the course exists', async () => {
    const repo = new AdminUsersRepository(
      fakeFirestore({ coursesById: { c1: { id: 'c1', title: 'Intro', status: 'PUBLISHED' } } }),
    );
    expect(await repo.getCourseTitle('c1' as CourseId)).toBe('Intro');
  });

  it('getCourseTitle returns null for a deleted course', async () => {
    const repo = new AdminUsersRepository(fakeFirestore({ coursesById: {} }));
    expect(await repo.getCourseTitle('gone' as CourseId)).toBeNull();
  });

  it('listAuthoredCourses maps course docs', async () => {
    const repo = new AdminUsersRepository(
      fakeFirestore({ authored: [{ id: 'c2', title: 'Adv', status: 'DRAFT', instructorId: 'u1' }] }),
    );
    const rows = await repo.listAuthoredCourses('u1' as UserId);
    expect(rows[0]?.id).toBe('c2');
  });

  it('getUser returns the record with id merged when the user exists', async () => {
    const repo = new AdminUsersRepository(
      fakeFirestore({ usersById: { u1: { displayName: 'Ada', email: 'ada@x.com', role: 'STUDENT' } } }),
    );
    const rec = await repo.getUser('u1' as UserId);
    expect(rec).toMatchObject({ id: 'u1', displayName: 'Ada' });
  });

  it('getUser returns null when the user doc is missing', async () => {
    const repo = new AdminUsersRepository(fakeFirestore({ usersById: {} }));
    expect(await repo.getUser('nope' as UserId)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx test api-profile -- admin-users.repository.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the repository** (`admin-users.repository.ts`)

```ts
import { Inject, Injectable } from '@nestjs/common';

import {
  FIRESTORE,
  type FirestoreHandle,
  readStoredUserProfiles,
  scanStoredUserProfiles,
  type StoredUserRecord,
} from '@learnwren/api-firebase';
import type { Course, CourseId, Enrollment, UserId } from '@learnwren/shared-data-models';

const ENROLLMENTS = 'enrollments';
const COURSES = 'courses';

/** All direct reads for the admin user directory live here (no api-courses dependency). */
@Injectable()
export class AdminUsersRepository {
  constructor(@Inject(FIRESTORE) private readonly firestore: FirestoreHandle) {}

  /** Up to `limit` users ordered by document id (capped scan). */
  scanUsers(limit: number): Promise<StoredUserRecord[]> {
    return scanStoredUserProfiles(this.firestore, limit);
  }

  /** A single user's stored profile (with id), or null when the doc is missing. */
  async getUser(uid: UserId): Promise<StoredUserRecord | null> {
    const map = await readStoredUserProfiles(this.firestore, [uid]);
    const profile = map.get(uid);
    return profile ? { id: uid, ...profile } : null;
  }

  /** Every enrollment for a user, any status. */
  async listEnrollmentsByUser(uid: UserId): Promise<Enrollment[]> {
    const snap = await this.firestore.collection(ENROLLMENTS).where('userId', '==', uid).get();
    return snap.docs.map((d) => d.data() as Enrollment);
  }

  /** A course's title, or null when the course no longer exists (dangling enrollment). */
  async getCourseTitle(courseId: CourseId): Promise<string | null> {
    const snap = await this.firestore.collection(COURSES).doc(courseId).get();
    if (snap.exists === false) return null;
    const data = snap.data() as Course | undefined;
    return data?.title ?? null;
  }

  /** Courses authored by a user (no orderBy — sorted in memory by the service). */
  async listAuthoredCourses(uid: UserId): Promise<Course[]> {
    const snap = await this.firestore.collection(COURSES).where('instructorId', '==', uid).get();
    return snap.docs.map((d) => d.data() as Course);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm nx test api-profile -- admin-users.repository.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add libs/api-profile/src/lib/users/admin-users.repository.ts \
        libs/api-profile/src/lib/users/admin-users.repository.spec.ts
git commit -m "feat(api-profile): add AdminUsersRepository (user scan + enrollment/course joins)"
```

---

## Task 6: api-profile — AdminUsersService (core logic)

**Files:**
- Create: `libs/api-profile/src/lib/users/admin-users.service.ts`
- Create: `libs/api-profile/src/lib/users/admin-users.service.spec.ts`

- [ ] **Step 1: Write the failing test** (`admin-users.service.spec.ts`)

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CourseId, UserId } from '@learnwren/shared-data-models';

import { AdminUsersService } from './admin-users.service';
import { UserNotFoundException } from './errors/admin-users.exception';
import type { AdminUsersRepository } from './admin-users.repository';

function userRecord(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    displayName: `Name ${id}`,
    email: `${id}@example.com`,
    role: 'STUDENT',
    createdAt: '2026-06-01T00:00:00.000Z',
    biography: '',
    ...over,
  };
}

describe('AdminUsersService', () => {
  let repo: {
    scanUsers: ReturnType<typeof vi.fn>;
    getUser: ReturnType<typeof vi.fn>;
    listEnrollmentsByUser: ReturnType<typeof vi.fn>;
    getCourseTitle: ReturnType<typeof vi.fn>;
    listAuthoredCourses: ReturnType<typeof vi.fn>;
  };
  let svc: AdminUsersService;

  beforeEach(() => {
    repo = {
      scanUsers: vi.fn(async () => [userRecord('aaa'), userRecord('bbb')]),
      getUser: vi.fn(),
      listEnrollmentsByUser: vi.fn(async () => []),
      getCourseTitle: vi.fn(async () => null),
      listAuthoredCourses: vi.fn(async () => []),
    };
    svc = new AdminUsersService(repo as unknown as AdminUsersRepository);
  });

  describe('list', () => {
    it('returns all users sorted by displayName with paging metadata', async () => {
      repo.scanUsers = vi.fn(async () => [
        userRecord('z', { displayName: 'Zoe' }),
        userRecord('a', { displayName: 'aaron' }),
      ]);
      const res = await svc.list('', 1, 20);
      expect(res.users.map((u) => u.displayName)).toEqual(['aaron', 'Zoe']); // case-insensitive
      expect(res.total).toBe(2);
      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(20);
      expect(res.capped).toBe(false);
    });

    it('filters by case-insensitive substring on displayName OR email', async () => {
      repo.scanUsers = vi.fn(async () => [
        userRecord('1', { displayName: 'Ada Lovelace', email: 'ada@x.com' }),
        userRecord('2', { displayName: 'Bob', email: 'bob@example.com' }),
        userRecord('3', { displayName: 'Carol', email: 'carol@x.com' }),
      ]);
      const byName = await svc.list('ADA', 1, 20);
      expect(byName.users.map((u) => u.id)).toEqual(['1']);
      const byEmail = await svc.list('example', 1, 20);
      expect(byEmail.users.map((u) => u.id)).toEqual(['2']);
    });

    it('paginates: total reflects the full filtered set, users is the page slice', async () => {
      repo.scanUsers = vi.fn(async () =>
        Array.from({ length: 25 }, (_, i) =>
          userRecord(String(i).padStart(2, '0'), { displayName: `User ${String(i).padStart(2, '0')}` }),
        ),
      );
      const page2 = await svc.list('', 2, 10);
      expect(page2.total).toBe(25);
      expect(page2.users).toHaveLength(10);
      expect(page2.users[0]?.displayName).toBe('User 10');
    });

    it('sets capped + drops the overflow doc when the scan exceeds the cap', async () => {
      repo.scanUsers = vi.fn(async (limit: number) =>
        Array.from({ length: limit }, (_, i) => userRecord(`u${i}`)),
      );
      const res = await svc.list('', 1, 20);
      // scan asked for 5001; 5001 returned => capped, bounded to 5000
      expect(repo.scanUsers).toHaveBeenCalledWith(5001);
      expect(res.capped).toBe(true);
      expect(res.total).toBe(5000);
    });

    it('falls back to "(no display name)" for blank names', async () => {
      repo.scanUsers = vi.fn(async () => [userRecord('x', { displayName: '   ' })]);
      const res = await svc.list('', 1, 20);
      expect(res.users[0]?.displayName).toBe('(no display name)');
    });

    it('clamps page to >=1 and pageSize to [1,100]', async () => {
      const res = await svc.list('', 0, 1000);
      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(100);
    });
  });

  describe('getDetail', () => {
    it('throws UserNotFoundException when the user is missing', async () => {
      repo.getUser = vi.fn(async () => null);
      await expect(svc.getDetail('nope' as UserId)).rejects.toBeInstanceOf(UserNotFoundException);
    });

    it('joins enrollments (newest first) with course titles and tolerates deleted courses', async () => {
      repo.getUser = vi.fn(async () => userRecord('u1', { role: 'STUDENT', biography: 'bio' }));
      repo.listEnrollmentsByUser = vi.fn(async () => [
        { courseId: 'c1', status: 'ACTIVE', createdAt: '2026-06-01T00:00:00.000Z' },
        { courseId: 'gone', status: 'WITHDRAWN', createdAt: '2026-06-05T00:00:00.000Z' },
      ]);
      repo.getCourseTitle = vi.fn(async (cid: CourseId) => (cid === 'c1' ? 'Intro' : null));
      const detail = await svc.getDetail('u1' as UserId);
      expect(detail.enrollments[0]?.courseId).toBe('gone'); // newest first
      expect(detail.enrollments[0]?.courseTitle).toBe('(course deleted)');
      expect(detail.enrollments[1]?.courseTitle).toBe('Intro');
      expect(detail.biography).toBe('bio');
    });

    it('includes authored courses sorted by title', async () => {
      repo.getUser = vi.fn(async () => userRecord('u1', { role: 'INSTRUCTOR' }));
      repo.listAuthoredCourses = vi.fn(async () => [
        { id: 'c2', title: 'Zebra', status: 'DRAFT' },
        { id: 'c1', title: 'Apple', status: 'PUBLISHED' },
      ]);
      const detail = await svc.getDetail('u1' as UserId);
      expect(detail.authoredCourses.map((c) => c.title)).toEqual(['Apple', 'Zebra']);
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx test api-profile -- admin-users.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the service** (`admin-users.service.ts`)

```ts
import { Injectable } from '@nestjs/common';

import type {
  AdminAuthoredCourseRow,
  AdminUserDetail,
  AdminUserEnrollmentRow,
  AdminUserListResponse,
  AdminUserListRow,
  ISODateString,
  UserId,
  UserRole,
} from '@learnwren/shared-data-models';

import { AdminUsersRepository } from './admin-users.repository';
import { UserNotFoundException } from './errors/admin-users.exception';

/** Cap on the all-users scan; one extra is read (CAP + 1) to detect overflow. */
const ADMIN_USER_SCAN_CAP = 5000;
const FALLBACK_DISPLAY_NAME = '(no display name)';
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

@Injectable()
export class AdminUsersService {
  constructor(private readonly repo: AdminUsersRepository) {}

  async list(search = '', page = 1, pageSize = DEFAULT_PAGE_SIZE): Promise<AdminUserListResponse> {
    const safePage = clamp(page, 1, Number.MAX_SAFE_INTEGER);
    const safePageSize = clamp(pageSize, 1, MAX_PAGE_SIZE);

    const records = await this.repo.scanUsers(ADMIN_USER_SCAN_CAP + 1);
    const capped = records.length > ADMIN_USER_SCAN_CAP;
    const bounded = capped ? records.slice(0, ADMIN_USER_SCAN_CAP) : records;

    const rows: AdminUserListRow[] = bounded.map((r) => ({
      id: r.id as UserId,
      displayName: (r.displayName ?? '').trim() || FALLBACK_DISPLAY_NAME,
      email: r.email ?? '',
      role: (r.role ?? 'STUDENT') as UserRole,
      createdAt: (r.createdAt ?? '') as ISODateString,
    }));

    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter(
          (u) => u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
        )
      : rows;

    filtered.sort((a, b) => {
      const byName = a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
      return byName !== 0 ? byName : a.email.localeCompare(b.email);
    });

    const total = filtered.length;
    const start = (safePage - 1) * safePageSize;
    const users = filtered.slice(start, start + safePageSize);

    return { users, total, page: safePage, pageSize: safePageSize, capped };
  }

  async getDetail(uid: UserId): Promise<AdminUserDetail> {
    const rec = await this.repo.getUser(uid);
    if (!rec) {
      throw new UserNotFoundException();
    }

    const rawEnrollments = await this.repo.listEnrollmentsByUser(uid);
    const titles = await Promise.all(
      rawEnrollments.map((e) => this.repo.getCourseTitle(e.courseId)),
    );
    const enrollments: AdminUserEnrollmentRow[] = rawEnrollments
      .map((e, i) => ({
        courseId: e.courseId,
        courseTitle: titles[i] ?? '(course deleted)',
        status: e.status,
        enrolledAt: e.createdAt,
      }))
      .sort((a, b) => b.enrolledAt.localeCompare(a.enrolledAt));

    const rawAuthored = await this.repo.listAuthoredCourses(uid);
    const authoredCourses: AdminAuthoredCourseRow[] = rawAuthored
      .map((c) => ({ courseId: c.id, title: c.title, status: c.status }))
      .sort((a, b) => a.title.localeCompare(b.title));

    return {
      id: rec.id as UserId,
      displayName: (rec.displayName ?? '').trim() || FALLBACK_DISPLAY_NAME,
      email: rec.email ?? '',
      biography: rec.biography ?? '',
      photoUrl: rec.photoUrl,
      role: (rec.role ?? 'STUDENT') as UserRole,
      createdAt: (rec.createdAt ?? '') as ISODateString,
      enrollments,
      authoredCourses,
    };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm nx test api-profile -- admin-users.service.spec.ts`
Expected: PASS (all list + getDetail cases).

- [ ] **Step 5: Commit**

```bash
git add libs/api-profile/src/lib/users/admin-users.service.ts \
        libs/api-profile/src/lib/users/admin-users.service.spec.ts
git commit -m "feat(api-profile): add AdminUsersService (search/sort/paginate/cap + detail join)"
```

---

## Task 7: api-profile — AdminUsersController + module wiring

**Files:**
- Create: `libs/api-profile/src/lib/users/admin-users.controller.ts`
- Create: `libs/api-profile/src/lib/users/admin-users.controller.spec.ts`
- Modify: `libs/api-profile/src/lib/profile.module.ts`

- [ ] **Step 1: Write the failing test** (`admin-users.controller.spec.ts`)

```ts
import { describe, expect, it, vi } from 'vitest';
import type { UserId } from '@learnwren/shared-data-models';

import { AdminUsersController } from './admin-users.controller';
import type { AdminUsersService } from './admin-users.service';

describe('AdminUsersController', () => {
  it('list delegates to the service with parsed query params', async () => {
    const svc = { list: vi.fn(async () => ({ users: [], total: 0, page: 2, pageSize: 10, capped: false })) };
    const ctrl = new AdminUsersController(svc as unknown as AdminUsersService);
    await ctrl.list('ada', '2', '10');
    expect(svc.list).toHaveBeenCalledWith('ada', 2, 10);
  });

  it('list defaults missing query params (search="", page=1, pageSize=20)', async () => {
    const svc = { list: vi.fn(async () => ({ users: [], total: 0, page: 1, pageSize: 20, capped: false })) };
    const ctrl = new AdminUsersController(svc as unknown as AdminUsersService);
    await ctrl.list(undefined, undefined, undefined);
    expect(svc.list).toHaveBeenCalledWith('', 1, 20);
  });

  it('getOne casts the route param to UserId and delegates', async () => {
    const detail = { id: 'u1' as UserId };
    const svc = { getDetail: vi.fn(async () => detail) };
    const ctrl = new AdminUsersController(svc as unknown as AdminUsersService);
    await ctrl.getOne('u1');
    expect(svc.getDetail).toHaveBeenCalledWith('u1');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx test api-profile -- admin-users.controller.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the controller** (`admin-users.controller.ts`)

```ts
import { Controller, Get, Param, Query, UseFilters, UseGuards } from '@nestjs/common';

import { FirebaseSessionGuard, AdminRoleGuard } from '@learnwren/api-auth';
import type { AdminUserDetail, AdminUserListResponse, UserId } from '@learnwren/shared-data-models';

import { AdminUsersExceptionFilter } from './admin-users.exception-filter';
import { AdminUsersService } from './admin-users.service';

@Controller('admin/users')
@UseFilters(AdminUsersExceptionFilter)
@UseGuards(FirebaseSessionGuard, AdminRoleGuard)
export class AdminUsersController {
  constructor(private readonly svc: AdminUsersService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<AdminUserListResponse> {
    return this.svc.list(search ?? '', Number(page) || 1, Number(pageSize) || 20);
  }

  @Get(':uid')
  getOne(@Param('uid') uid: string): Promise<AdminUserDetail> {
    return this.svc.getDetail(uid as UserId);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm nx test api-profile -- admin-users.controller.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Register in `libs/api-profile/src/lib/profile.module.ts`** — three edits:

(a) Add import lines near the other instructor-application imports:

```ts
import { AdminUsersController } from './users/admin-users.controller';
import { AdminUsersExceptionFilter } from './users/admin-users.exception-filter';
import { AdminUsersRepository } from './users/admin-users.repository';
import { AdminUsersService } from './users/admin-users.service';
```

(b) Append `AdminUsersController` to the `controllers` array.

(c) Append to the `providers` array:

```ts
    AdminUsersService,
    AdminUsersRepository,
    AdminUsersExceptionFilter,
```

- [ ] **Step 6: Verify the whole api-profile lib still tests + builds**

Run: `pnpm nx test api-profile`
Expected: PASS (all suites).
Run: `pnpm nx build api-profile`
Expected: PASS (tsc clean — proves the shared-type additions compile here).

- [ ] **Step 7: Commit**

```bash
git add libs/api-profile/src/lib/users/admin-users.controller.ts \
        libs/api-profile/src/lib/users/admin-users.controller.spec.ts \
        libs/api-profile/src/lib/profile.module.ts
git commit -m "feat(api-profile): wire AdminUsersController + providers into ProfileModule"
```

---

## Task 8: web-admin — AdminUsersService (HTTP wrapper)

**Files:**
- Create: `libs/web-admin/src/lib/admin-users.service.ts`
- Create: `libs/web-admin/src/lib/admin-users.service.spec.ts`

- [ ] **Step 1: Write the failing test** (`admin-users.service.spec.ts`)

```ts
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';

import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService', () => {
  let get: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    get = vi.fn(() => of({ users: [], total: 0, page: 1, pageSize: 20, capped: false }));
    TestBed.configureTestingModule({
      providers: [{ provide: HttpClient, useValue: { get } }],
    });
  });

  it('list() GETs /api/admin/users with search/page/pageSize params', async () => {
    const svc = TestBed.inject(AdminUsersService);
    await svc.list('ada', 2, 10);
    expect(get).toHaveBeenCalledWith('/api/admin/users', {
      params: { search: 'ada', page: '2', pageSize: '10' },
    });
  });

  it('getDetail() GETs /api/admin/users/:uid', async () => {
    get = vi.fn(() => of({ id: 'u1' }));
    TestBed.overrideProvider(HttpClient, { useValue: { get } });
    const svc = TestBed.inject(AdminUsersService);
    await svc.getDetail('u1');
    expect(get).toHaveBeenCalledWith('/api/admin/users/u1');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx test web-admin -- admin-users.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the service** (`admin-users.service.ts`)

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { AdminUserDetail, AdminUserListResponse } from '@learnwren/shared-data-models';

const BASE = '/api/admin/users';

@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  private readonly http = inject(HttpClient);

  list(search: string, page: number, pageSize: number): Promise<AdminUserListResponse> {
    return firstValueFrom(
      this.http.get<AdminUserListResponse>(BASE, {
        params: { search, page: String(page), pageSize: String(pageSize) },
      }),
    );
  }

  getDetail(uid: string): Promise<AdminUserDetail> {
    return firstValueFrom(this.http.get<AdminUserDetail>(`${BASE}/${uid}`));
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm nx test web-admin -- admin-users.service.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add libs/web-admin/src/lib/admin-users.service.ts \
        libs/web-admin/src/lib/admin-users.service.spec.ts
git commit -m "feat(web-admin): add AdminUsersService HTTP wrapper"
```

---

## Task 9: web-admin — AdminUsersPageComponent (directory list)

**Files:**
- Create: `libs/web-admin/src/lib/admin-users-page/admin-users-page.component.ts`
- Create: `libs/web-admin/src/lib/admin-users-page/admin-users-page.component.html`
- Create: `libs/web-admin/src/lib/admin-users-page/admin-users-page.component.spec.ts`

- [ ] **Step 1: Write the failing test** (`admin-users-page.component.spec.ts`)

```ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminUsersService } from '../admin-users.service';
import { AdminUsersPageComponent } from './admin-users-page.component';

function user(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    displayName: `User ${id}`,
    email: `${id}@example.com`,
    role: 'STUDENT',
    createdAt: '2026-06-01T00:00:00.000Z',
    ...over,
  };
}

describe('AdminUsersPageComponent', () => {
  let svc: { list: ReturnType<typeof vi.fn> };

  async function setup() {
    TestBed.configureTestingModule({
      imports: [AdminUsersPageComponent],
      providers: [provideRouter([]), { provide: AdminUsersService, useValue: svc }],
    });
    const fixture = TestBed.createComponent(AdminUsersPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    svc = {
      list: vi.fn(async () => ({
        users: [user('u1'), user('u2')],
        total: 2,
        page: 1,
        pageSize: 20,
        capped: false,
      })),
    };
    vi.useRealTimers();
  });

  afterEach(() => vi.useRealTimers());

  it('loads and renders the user rows', async () => {
    const fixture = await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(svc.list).toHaveBeenCalledWith('', 1, 20);
    expect(text).toContain('u1@example.com');
    expect(text).toContain('u2@example.com');
  });

  it('shows the empty state when there are no users', async () => {
    svc.list = vi.fn(async () => ({ users: [], total: 0, page: 1, pageSize: 20, capped: false }));
    const fixture = await setup();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No users');
  });

  it('shows the capped banner when the result is capped', async () => {
    svc.list = vi.fn(async () => ({ users: [user('u1')], total: 1, page: 1, pageSize: 20, capped: true }));
    const fixture = await setup();
    expect(fixture.nativeElement.querySelector('[data-testid="capped-banner"]')).toBeTruthy();
  });

  it('renders the capped banner even when the filtered result is empty', async () => {
    svc.list = vi.fn(async () => ({ users: [], total: 0, page: 1, pageSize: 20, capped: true }));
    const fixture = await setup();
    expect(fixture.nativeElement.querySelector('[data-testid="capped-banner"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="empty-state"]')).toBeTruthy();
  });

  it('goToPage reloads with the new page', async () => {
    const fixture = await setup();
    const comp = fixture.componentInstance;
    svc.list.mockClear();
    await comp.goToPage(2);
    expect(svc.list).toHaveBeenCalledWith('', 2, 20);
  });

  it('debounced search resets to page 1 and reloads', async () => {
    vi.useFakeTimers();
    const fixture = await setup();
    const comp = fixture.componentInstance;
    svc.list.mockClear();
    comp.onSearchInput('ada');
    expect(svc.list).not.toHaveBeenCalled(); // debounced
    await vi.advanceTimersByTimeAsync(300);
    expect(svc.list).toHaveBeenCalledWith('ada', 1, 20);
  });

  it('computes totalPages and disables prev on the first page', async () => {
    svc.list = vi.fn(async () => ({ users: [user('u1')], total: 45, page: 1, pageSize: 20, capped: false }));
    const fixture = await setup();
    expect(fixture.componentInstance.totalPages()).toBe(3);
    expect(fixture.componentInstance.canPrev()).toBe(false);
    expect(fixture.componentInstance.canNext()).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx test web-admin -- admin-users-page.component.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the component** (`admin-users-page.component.ts`)

```ts
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import type { AdminUserListRow } from '@learnwren/shared-data-models';

import { AdminUsersService } from '../admin-users.service';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

@Component({
  selector: 'lib-admin-users-page',
  standalone: true,
  imports: [DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-users-page.component.html',
})
export class AdminUsersPageComponent implements OnInit, OnDestroy {
  private readonly svc = inject(AdminUsersService);

  readonly users = signal<AdminUserListRow[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly capped = signal(false);
  readonly loading = signal(true);
  readonly search = signal('');

  readonly pageSize = PAGE_SIZE;
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  canPrev(): boolean {
    return this.page() > 1;
  }

  canNext(): boolean {
    return this.page() < this.totalPages();
  }

  onSearchInput(value: string): void {
    this.search.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      void this.reload();
    }, SEARCH_DEBOUNCE_MS);
  }

  async goToPage(page: number): Promise<void> {
    if (page < 1 || page > this.totalPages()) return;
    this.page.set(page);
    await this.reload();
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await this.svc.list(this.search(), this.page(), PAGE_SIZE);
      this.users.set(res.users);
      this.total.set(res.total);
      this.capped.set(res.capped);
    } finally {
      this.loading.set(false);
    }
  }
}
```

- [ ] **Step 4: Create the template** (`admin-users-page.component.html`)

```html
<section class="mx-auto max-w-3xl px-6 py-8">
  <h1 class="text-xl font-semibold text-ink">Users</h1>

  <input
    type="search"
    class="mt-4 w-full rounded-lg border border-line px-3 py-2 text-sm"
    placeholder="Search by name or email"
    data-testid="user-search"
    [value]="search()"
    (input)="onSearchInput($any($event.target).value)"
  />

  @if (capped()) {
    <p class="mt-3 text-xs text-amber-700" role="status" data-testid="capped-banner">
      Showing the first {{ pageSize }} of a capped result set — more than 5000 users exist, so some
      may be omitted from search.
    </p>
  }

  @if (loading()) {
    <p class="mt-6 text-sm text-muted">Loading…</p>
  } @else if (users().length === 0) {
    <p class="mt-6 text-sm text-muted" data-testid="empty-state">No users found.</p>
  } @else {
    <ul class="mt-6 flex flex-col divide-y divide-line" data-testid="user-list">
      @for (u of users(); track u.id) {
        <li data-testid="user-row" [attr.data-uid]="u.id">
          <a [routerLink]="[u.id]" class="flex items-baseline justify-between gap-4 py-3 hover:bg-surface">
            <span>
              <span class="font-medium text-ink">{{ u.displayName }}</span>
              <span class="ml-2 text-sm text-muted">{{ u.email }}</span>
            </span>
            <span class="flex items-center gap-3">
              <span class="rounded bg-surface px-2 py-0.5 text-xs text-muted">{{ u.role }}</span>
              <span class="text-xs text-muted">{{ u.createdAt | date: 'mediumDate' }}</span>
            </span>
          </a>
        </li>
      }
    </ul>

    <div class="mt-6 flex items-center justify-between text-sm">
      <button
        type="button"
        class="lw-btn lw-btn-ghost"
        data-testid="prev-page"
        [disabled]="!canPrev()"
        (click)="goToPage(page() - 1)"
      >
        Previous
      </button>
      <span class="text-muted" data-testid="page-indicator">Page {{ page() }} of {{ totalPages() }}</span>
      <button
        type="button"
        class="lw-btn lw-btn-ghost"
        data-testid="next-page"
        [disabled]="!canNext()"
        (click)="goToPage(page() + 1)"
      >
        Next
      </button>
    </div>
  }
</section>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm nx test web-admin -- admin-users-page.component.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add libs/web-admin/src/lib/admin-users-page/
git commit -m "feat(web-admin): add AdminUsersPageComponent (search, pagination, capped banner)"
```

---

## Task 10: web-admin — AdminUserDetailPageComponent

**Files:**
- Create: `libs/web-admin/src/lib/admin-user-detail-page/admin-user-detail-page.component.ts`
- Create: `libs/web-admin/src/lib/admin-user-detail-page/admin-user-detail-page.component.html`
- Create: `libs/web-admin/src/lib/admin-user-detail-page/admin-user-detail-page.component.spec.ts`

- [ ] **Step 1: Write the failing test** (`admin-user-detail-page.component.spec.ts`)

```ts
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminUsersService } from '../admin-users.service';
import { AdminUserDetailPageComponent } from './admin-user-detail-page.component';

function detail(over: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    displayName: 'Ada Lovelace',
    email: 'ada@example.com',
    biography: 'Mathematician',
    role: 'INSTRUCTOR',
    createdAt: '2026-06-01T00:00:00.000Z',
    enrollments: [],
    authoredCourses: [],
    ...over,
  };
}

describe('AdminUserDetailPageComponent', () => {
  let svc: { getDetail: ReturnType<typeof vi.fn> };

  async function setup(uid = 'u1') {
    TestBed.configureTestingModule({
      imports: [AdminUserDetailPageComponent],
      providers: [
        provideRouter([]),
        { provide: AdminUsersService, useValue: svc },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ uid })) } },
      ],
    });
    const fixture = TestBed.createComponent(AdminUserDetailPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    svc = { getDetail: vi.fn(async () => detail()) };
  });

  it('loads the user by route param and renders profile + role', async () => {
    const fixture = await setup('u1');
    expect(svc.getDetail).toHaveBeenCalledWith('u1');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('ada@example.com');
    expect(text).toContain('INSTRUCTOR');
  });

  it('renders the enrollments section with a deleted-course fallback row', async () => {
    svc.getDetail = vi.fn(async () =>
      detail({
        enrollments: [
          { courseId: 'gone', courseTitle: '(course deleted)', status: 'WITHDRAWN', enrolledAt: '2026-06-05T00:00:00.000Z' },
        ],
      }),
    );
    const fixture = await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(fixture.nativeElement.querySelector('[data-testid="enrollments"]')).toBeTruthy();
    expect(text).toContain('(course deleted)');
  });

  it('hides the authored-courses section when empty', async () => {
    const fixture = await setup();
    expect(fixture.nativeElement.querySelector('[data-testid="authored-courses"]')).toBeNull();
  });

  it('shows a not-found state when the API returns USER_NOT_FOUND', async () => {
    svc.getDetail = vi.fn(async () => {
      throw { error: { error: { code: 'USER_NOT_FOUND' } } };
    });
    const fixture = await setup('nope');
    expect(fixture.nativeElement.querySelector('[data-testid="not-found"]')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx test web-admin -- admin-user-detail-page.component.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the component** (`admin-user-detail-page.component.ts`)

```ts
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { LwAvatarComponent } from '@learnwren/web-ui';
import type { AdminUserDetail } from '@learnwren/shared-data-models';

import { AdminUsersService } from '../admin-users.service';

@Component({
  selector: 'lib-admin-user-detail-page',
  standalone: true,
  imports: [DatePipe, RouterLink, LwAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-user-detail-page.component.html',
})
export class AdminUserDetailPageComponent implements OnInit, OnDestroy {
  private readonly svc = inject(AdminUsersService);
  private readonly route = inject(ActivatedRoute);

  readonly user = signal<AdminUserDetail | undefined>(undefined);
  readonly loading = signal(true);
  readonly notFound = signal(false);

  private sub?: Subscription;

  ngOnInit(): void {
    this.sub = this.route.paramMap.subscribe((params) => {
      const uid = params.get('uid');
      if (uid) void this.load(uid);
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private async load(uid: string): Promise<void> {
    this.loading.set(true);
    this.notFound.set(false);
    try {
      this.user.set(await this.svc.getDetail(uid));
    } catch (err) {
      const code = (err as { error?: { error?: { code?: string } } })?.error?.error?.code;
      if (code === 'USER_NOT_FOUND') {
        this.notFound.set(true);
      }
      this.user.set(undefined);
    } finally {
      this.loading.set(false);
    }
  }
}
```

- [ ] **Step 4: Create the template** (`admin-user-detail-page.component.html`)

```html
<section class="mx-auto max-w-3xl px-6 py-8">
  <a routerLink="/admin/users" class="text-sm text-muted hover:text-ink">← Back to users</a>

  @if (loading()) {
    <p class="mt-6 text-sm text-muted">Loading…</p>
  } @else if (notFound()) {
    <p class="mt-6 text-sm text-muted" data-testid="not-found">User not found.</p>
  } @else if (user(); as u) {
    <div class="mt-6 flex items-center gap-4">
      <lw-avatar [photoUrl]="u.photoUrl" [displayName]="u.displayName" [userId]="u.id" size="md" />
      <div>
        <h1 class="text-xl font-semibold text-ink">{{ u.displayName }}</h1>
        <p class="text-sm text-muted">{{ u.email }}</p>
      </div>
      <span class="ml-auto rounded bg-surface px-2 py-0.5 text-xs text-muted">{{ u.role }}</span>
    </div>

    <dl class="mt-6 grid grid-cols-[8rem_1fr] gap-2 text-sm">
      <dt class="text-muted">Registered</dt>
      <dd class="text-ink">{{ u.createdAt | date: 'mediumDate' }}</dd>
      <dt class="text-muted">Biography</dt>
      <dd class="text-ink">{{ u.biography || 'No biography.' }}</dd>
    </dl>

    @if (u.enrollments.length > 0) {
      <h2 class="mt-8 text-sm font-semibold text-ink">Enrollment history</h2>
      <ul class="mt-2 flex flex-col divide-y divide-line" data-testid="enrollments">
        @for (e of u.enrollments; track e.courseId) {
          <li class="flex items-baseline justify-between gap-4 py-2 text-sm">
            <span class="text-ink">{{ e.courseTitle }}</span>
            <span class="flex items-center gap-3">
              <span class="rounded bg-surface px-2 py-0.5 text-xs text-muted">{{ e.status }}</span>
              <span class="text-xs text-muted">{{ e.enrolledAt | date: 'mediumDate' }}</span>
            </span>
          </li>
        }
      </ul>
    }

    @if (u.authoredCourses.length > 0) {
      <h2 class="mt-8 text-sm font-semibold text-ink">Authored courses</h2>
      <ul class="mt-2 flex flex-col divide-y divide-line" data-testid="authored-courses">
        @for (c of u.authoredCourses; track c.courseId) {
          <li class="flex items-baseline justify-between gap-4 py-2 text-sm">
            <span class="text-ink">{{ c.title }}</span>
            <span class="rounded bg-surface px-2 py-0.5 text-xs text-muted">{{ c.status }}</span>
          </li>
        }
      </ul>
    }
  }
</section>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm nx test web-admin -- admin-user-detail-page.component.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add libs/web-admin/src/lib/admin-user-detail-page/
git commit -m "feat(web-admin): add AdminUserDetailPageComponent (profile, enrollments, authored)"
```

---

## Task 11: web-admin routes + app nav link

**Files:**
- Modify: `libs/web-admin/src/lib/admin.routes.ts`
- Modify: `apps/web/src/app/app.html`

- [ ] **Step 1: Add the two child routes** — edit `libs/web-admin/src/lib/admin.routes.ts`, inserting these two entries into the existing `children` array (before the `{ path: '', ... redirectTo }` entry):

```ts
      {
        path: 'users',
        loadComponent: () =>
          import('./admin-users-page/admin-users-page.component').then(
            (m) => m.AdminUsersPageComponent,
          ),
      },
      {
        path: 'users/:uid',
        loadComponent: () =>
          import('./admin-user-detail-page/admin-user-detail-page.component').then(
            (m) => m.AdminUserDetailPageComponent,
          ),
      },
```

- [ ] **Step 2: Add the nav link** — edit `apps/web/src/app/app.html`, adding a `Users` link inside the existing ADMIN gate so the block reads:

```html
        @if (auth.currentUser()?.role === 'ADMIN') {
          <a routerLink="/admin/instructor-applications" class="lw-btn lw-btn-ghost">Admin</a>
          <a routerLink="/admin/users" class="lw-btn lw-btn-ghost">Users</a>
        }
```

- [ ] **Step 3: Lint the touched projects**

Run: `pnpm nx lint web-admin && pnpm nx lint web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add libs/web-admin/src/lib/admin.routes.ts apps/web/src/app/app.html
git commit -m "feat(web-admin): route admin/users + admin/users/:uid and add Users nav link"
```

---

## Task 12: api-e2e — admin user directory (emulator-backed)

**Files:**
- Create: `apps/api-e2e/src/admin-users.e2e-spec.ts`

**Prerequisite:** the Firebase emulators must be running (`pnpm emulators`) before executing this suite; the api server is auto-booted by the e2e runner.

- [ ] **Step 1: Write the spec** (`admin-users.e2e-spec.ts`)

```ts
// NOTE: Run `pnpm emulators` and `pnpm start:api` before executing this suite.
import { test, expect, request as apiRequest } from '@playwright/test';
import * as admin from 'firebase-admin';

import {
  API_BASE,
  initAdmin,
  registerStudent,
  registerAndPromoteInstructor,
  registerAndPromoteAdmin,
} from './_helpers/auth';

test.beforeAll(() => initAdmin());

async function seedPublishedCourse(instructorId: string): Promise<string> {
  const cid = `admin-users-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();
  await admin.firestore().collection('courses').doc(cid).set({
    id: cid,
    title: 'Admin Users e2e course',
    description: 'course',
    instructorId,
    status: 'PUBLISHED',
    enrollmentCount: 0,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return cid;
}

test('admin lists users, searches, and opens a detail with enrollment + authored course', async () => {
  const ctx = await apiRequest.newContext();
  try {
    // An instructor who authors a course, and a student who enrolls in it.
    const instructor = await registerAndPromoteInstructor(ctx);
    const student = await registerStudent(ctx);
    const cid = await seedPublishedCourse(instructor.uid);
    const enroll = await ctx.post(`${API_BASE}/enrollments`, {
      headers: { Cookie: student.cookieHeader },
      data: { courseId: cid },
    });
    expect(enroll.status()).toBe(201);

    const adminSession = await registerAndPromoteAdmin(ctx);
    const hdr = { Cookie: adminSession.cookieHeader };

    // List returns users (including the student we just created).
    const list = await ctx.get(`${API_BASE}/admin/users`, { headers: hdr });
    expect(list.status()).toBe(200);
    const body = (await list.json()) as {
      users: Array<{ id: string; email: string; role: string }>;
      total: number;
      capped: boolean;
    };
    expect(body.users.some((u) => u.id === student.uid)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(body.capped).toBe(false);

    // Detail for the student shows their enrollment.
    const studentDetail = await ctx.get(`${API_BASE}/admin/users/${student.uid}`, { headers: hdr });
    expect(studentDetail.status()).toBe(200);
    const sd = (await studentDetail.json()) as {
      enrollments: Array<{ courseId: string; courseTitle: string }>;
    };
    expect(sd.enrollments.some((e) => e.courseId === cid)).toBe(true);

    // Detail for the instructor shows their authored course.
    const instructorDetail = await ctx.get(`${API_BASE}/admin/users/${instructor.uid}`, { headers: hdr });
    expect(instructorDetail.status()).toBe(200);
    const id = (await instructorDetail.json()) as {
      role: string;
      authoredCourses: Array<{ courseId: string }>;
    };
    expect(id.role).toBe('INSTRUCTOR');
    expect(id.authoredCourses.some((c) => c.courseId === cid)).toBe(true);
  } finally {
    await ctx.dispose();
  }
});

test('detail returns 404 USER_NOT_FOUND for an unknown uid', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const adminSession = await registerAndPromoteAdmin(ctx);
    const res = await ctx.get(`${API_BASE}/admin/users/does-not-exist`, {
      headers: { Cookie: adminSession.cookieHeader },
    });
    expect(res.status()).toBe(404);
    expect((await res.json()).error.code).toBe('USER_NOT_FOUND');
  } finally {
    await ctx.dispose();
  }
});

test('non-admin is forbidden from the user directory', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const instructor = await registerAndPromoteInstructor(ctx);
    const res = await ctx.get(`${API_BASE}/admin/users`, {
      headers: { Cookie: instructor.cookieHeader },
    });
    expect(res.status()).toBe(403);
  } finally {
    await ctx.dispose();
  }
});
```

- [ ] **Step 2: Run the suite** (emulators must be up)

Run: `pnpm nx e2e api-e2e`
(Or one-shot: `pnpm exec firebase emulators:exec --project demo-learnwren 'pnpm nx e2e api-e2e'`.)
Expected: the three `admin-users` tests PASS (alongside the rest of the suite).

- [ ] **Step 3: Commit**

```bash
git add apps/api-e2e/src/admin-users.e2e-spec.ts
git commit -m "test(api-e2e): admin user directory list/detail + 404 + non-admin 403"
```

---

## Task 13: web-e2e — admin user directory (hermetic)

**Files:**
- Create: `apps/web-e2e/src/admin-users.spec.ts`

- [ ] **Step 1: Write the spec** (`admin-users.spec.ts`)

```ts
/**
 * Hermetic Playwright specs for the admin user directory.
 *
 * All `/api` calls are intercepted via page.route so NO real backend or
 * Firebase emulators are required. The webServer in playwright.config.ts
 * starts the web SPA on :4200; these tests only drive that frontend.
 */
import { test, expect } from '@playwright/test';

const ADMIN_ME_STUB = {
  uid: 'test-uid-admin',
  email: 'admin@example.com',
  displayName: 'Admin User',
  role: 'ADMIN' as const,
  emailVerified: true,
};

const STUDENT_ME_STUB = {
  uid: 'test-uid-student',
  email: 'student@example.com',
  displayName: 'Student User',
  role: 'STUDENT' as const,
  emailVerified: true,
};

const LIST_RESPONSE = {
  users: [
    { id: 'u1', displayName: 'Ada Lovelace', email: 'ada@example.com', role: 'STUDENT', createdAt: '2026-06-01T00:00:00.000Z' },
    { id: 'u2', displayName: 'Bob Builder', email: 'bob@example.com', role: 'INSTRUCTOR', createdAt: '2026-06-02T00:00:00.000Z' },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
  capped: false,
};

const DETAIL_RESPONSE = {
  id: 'u1',
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  biography: 'Mathematician',
  role: 'STUDENT',
  createdAt: '2026-06-01T00:00:00.000Z',
  enrollments: [
    { courseId: 'c1', courseTitle: 'Intro to Logic', status: 'ACTIVE', enrolledAt: '2026-06-03T00:00:00.000Z' },
  ],
  authoredCourses: [],
};

test('admin sees the user directory and opens a user detail', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_ME_STUB) });
  });
  // Detail route is more specific — register it first so it shadows the list route.
  await page.route('**/api/admin/users/u1', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DETAIL_RESPONSE) });
  });
  await page.route('**/api/admin/users**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIST_RESPONSE) });
  });

  await page.goto('/admin/users');

  await expect(page.getByTestId('user-list')).toBeVisible();
  const row = page.getByTestId('user-row').filter({ hasText: 'Ada Lovelace' });
  await expect(row).toBeVisible();

  await row.click();
  await expect(page).toHaveURL(/\/admin\/users\/u1/);
  await expect(page.getByTestId('enrollments')).toBeVisible();
  await expect(page.getByText('Intro to Logic')).toBeVisible();
});

test('admin sees the empty state when there are no users', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_ME_STUB) });
  });
  await page.route('**/api/admin/users**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ users: [], total: 0, page: 1, pageSize: 20, capped: false }),
    });
  });

  await page.goto('/admin/users');
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await expect(page.getByTestId('user-list')).toHaveCount(0);
});

test('non-admin (STUDENT) navigating to /admin/users is redirected to /dashboard', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STUDENT_ME_STUB) });
  });

  await page.goto('/admin/users');
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
  await expect(page.getByTestId('user-list')).toHaveCount(0);
});
```

- [ ] **Step 2: Run the suite**

Run: `pnpm nx e2e web-e2e`
Expected: the three `admin-users` tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web-e2e/src/admin-users.spec.ts
git commit -m "test(web-e2e): hermetic admin user directory list/detail + non-admin redirect"
```

---

## Task 14: Full verification gate + docs

**Files:**
- Modify: `README.md` (authoritative feature record)

- [ ] **Step 1: Typecheck + build the consuming apps** (the real type gate — vitest masks tsc errors here)

Run: `pnpm nx build api && pnpm nx build web`
Expected: BOTH PASS. If `api`/`web` fail to find an admin-user type, the shared-data-models barrel export (Task 1, Step 5) or the api-firebase export (Task 2, Step 4) is missing.

- [ ] **Step 2: Lint + unit-test everything affected**

Run: `pnpm nx affected -t lint test`
Expected: PASS across `shared-data-models`, `api-firebase`, `api-profile`, `web-admin`, `web`, `api`.

- [ ] **Step 3: Update `README.md`** — in the section that records which slices are wired up, add a line under EP-08 / Platform Administration noting US-08-01 Slice A (read-only user directory: searchable/paginated list + user detail with enrollment history and authored courses) is shipped, mirroring the existing US-08-03 entry's wording and style. (Open `README.md`, locate the EP-08 / admin entry, and append the Slice A line; keep the table/list format identical to its neighbours.)

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: record US-08-01 Slice A user directory in the feature record"
```

- [ ] **Step 5: Land the branch** — per the team workflow, merge the worktree branch into `main` with a no-ff merge:

```bash
# from the main checkout (not the worktree):
git merge --no-ff feat/ep08-us-08-01-slice-a -m "Merge feat/ep08-us-08-01-slice-a: EP-08 Slice A user directory (US-08-01)"
```

Then remove the worktree (`git worktree remove ../lw-ep08-us0801a`).

---

## Self-Review (completed by plan author)

**Spec coverage:**
- AC1 searchable, paginated list → Tasks 6 (service list logic), 7 (controller), 8/9 (web service + page), 12/13 (e2e). ✓
- AC2 detail: profile, role, registration date, enrollment history (ACTIVE+WITHDRAWN) + authored courses → Tasks 5 (repo joins), 6 (getDetail), 10 (detail page), 12/13 (e2e). ✓
- Deterministic capped scan (`orderBy(documentId()).limit(5001)`) → Task 2 (reader) + Task 6 (cap detection). ✓
- Dangling-course title fallback `(course deleted)`, never 404 → Task 5 (`getCourseTitle` → null) + Task 6 (fallback) + tests. ✓
- Sort comparator (case-insensitive, email tiebreak) + blank-name fallback → Task 6 + tests. ✓
- Per-feature exception filter with AuthException branch (403) → Task 4. ✓
- Error code in `api-error.ts` (`AdminUsersErrorCode`/`AdminUsersApiErrorCode`) → Task 1. ✓
- Flat `Users` nav link → Task 11. ✓
- Read-only (no mutations) → no mutation endpoints anywhere. ✓
- "ONLY place reads users" comment kept true → Task 2 edit. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code; every run step has the exact command + expected result. ✓

**Type consistency:** `AdminUserListRow`/`AdminUserListResponse`/`AdminUserDetail`/`AdminUserEnrollmentRow`/`AdminAuthoredCourseRow` are defined in Task 1 and used unchanged in Tasks 5–10. `StoredUserRecord` defined in Task 2, consumed in Task 5. `AdminUsersRepository` method names (`scanUsers`/`getUser`/`listEnrollmentsByUser`/`getCourseTitle`/`listAuthoredCourses`) match between Tasks 5, 6, and their specs. Service method signatures (`list(search,page,pageSize)`, `getDetail(uid)`) match controller (Task 7) and web service (Task 8). ✓

**Deviation from spec (noted):** `AdminUserDetail.updatedAt` (in the spec sketch) is dropped — unused by the UI; this keeps `StoredUserProfile` from needing an extra field. Blank-name users sort by the `(no display name)` literal with an email tiebreak (deterministic) rather than by their email's alphabetical position — a minor simplification of the spec's fallback wording.
