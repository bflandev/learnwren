# US-08-01 Slice B — Role Management (promote / demote) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an Administrator promote a Student to Instructor or demote an Instructor to Student from the existing `admin/users/:uid` detail page, with demotion revoking the user's session immediately.

**Architecture:** Two ADMIN-only POST endpoints (`/api/admin/users/:uid/promote`, `/:uid/demote`) added to the existing `users/` submodule in `libs/api-profile`. A new `AdminUserRoleService` reads the user's persisted role (via the existing read-only `AdminUsersRepository`), validates the transition (rejecting any non-`STUDENT→INSTRUCTOR` / `INSTRUCTOR→STUDENT` move — which also protects every `ADMIN` account), then applies the effect: promote reuses the shared `promoteUserToInstructor` helper; demote uses a new Nest-free `demoteInstructorToStudent` helper that sets the claim, writes `users/{uid}.role`, and `revokeRefreshTokens`. The web detail page gains role-driven Promote/Demote affordances (inline confirm on demote) that update the role in place.

**Tech Stack:** NestJS 11 + Firebase Admin SDK (Firestore + Auth) on the API; Angular 21 standalone signals + Tailwind on the web; Vitest unit tests; Playwright for `api-e2e` (emulator-backed) and `web-e2e` (hermetic, `page.route` stubs). Nx monorepo (pnpm).

**Spec:** `docs/superpowers/specs/2026-06-03-us-08-01-slice-b-role-management-design.md`

**Conventions for every task below:**
- Work in an isolated git worktree branched from local `HEAD` (created via `superpowers:using-git-worktrees`), landed to `main` via a `--no-ff` merge at the end. Build/typecheck with `NX_DAEMON=false` to avoid the stale-`dist` hazard.
- Every `git commit` message ends with the trailer: `-m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"` (shown in each commit step).
- Run a single test file with: `pnpm exec nx test <project> -- --run <relative/path/to/spec>` (Vitest). Run an e2e suite with the project's `e2e` target (see Tasks 6 & 9).

---

## File structure (what each new/changed file is responsible for)

**API (`libs/api-profile/src/lib/users/`):**
- `role-mutation.ts` (new) — the Nest-free `demoteInstructorToStudent` effect (claim + Firestore role write + token revoke). Sibling to the existing `instructor-application/instructor-promotion.ts` (promote).
- `admin-user-role.service.ts` (new) — orchestration: read current role, validate transition, delegate to the promote/demote effects, return `{ id, role }`.
- `errors/admin-users.exception.ts` (modify) — add `InvalidRoleTransitionException`.
- `admin-users.controller.ts` (modify) — add the two POST routes, inject the role service.
- `admin-users.exception-filter.spec.ts` (modify) — assert the new 409 renders.

**Shared (`libs/shared-data-models/src/lib/`):**
- `admin-user.ts` (modify) — add `AdminUserRoleResponse`.
- `api-error.ts` (modify) — add `INVALID_ROLE_TRANSITION` to `AdminUsersErrorCode`.

**Module:** `libs/api-profile/src/lib/profile.module.ts` (modify) — register `AdminUserRoleService`.

**Web (`libs/web-admin/src/lib/`):**
- `admin-users.service.ts` (modify) — `promote`/`demote` HTTP wrappers.
- `admin-user-detail-page/admin-user-detail-page.component.ts` + `.html` (modify) — buttons, inline confirm, mutation state.

**E2E:** `apps/api-e2e/src/admin-users.e2e-spec.ts` (modify), `apps/web-e2e/src/admin-users.spec.ts` (modify).

**Docs:** `README.md` (modify — feature record).

---

## Task 1: Shared types — `AdminUserRoleResponse` + `INVALID_ROLE_TRANSITION` code

**Files:**
- Modify: `libs/shared-data-models/src/lib/admin-user.ts`
- Modify: `libs/shared-data-models/src/lib/api-error.ts:69`

> Pure type/union additions — verified by typecheck, not a runtime test.

- [ ] **Step 1: Add the response interface to `admin-user.ts`**

Append to the end of `libs/shared-data-models/src/lib/admin-user.ts` (the `UserId` and `UserRole` imports already exist at the top of the file):

```ts
/** Result of an admin role change (POST /api/admin/users/:uid/promote | .../demote). */
export interface AdminUserRoleResponse {
  id: UserId;
  role: UserRole;
}
```

- [ ] **Step 2: Add the error code to the union in `api-error.ts`**

Change line 69 from:

```ts
export type AdminUsersErrorCode = 'USER_NOT_FOUND' | 'INTERNAL';
```

to:

```ts
export type AdminUsersErrorCode = 'USER_NOT_FOUND' | 'INVALID_ROLE_TRANSITION' | 'INTERNAL';
```

(`AdminUsersApiErrorCode` derives from this, so no further change.)

- [ ] **Step 3: Typecheck the shared lib**

Run: `NX_DAEMON=false pnpm exec nx build shared-data-models`
Expected: build succeeds (no tsc errors).

- [ ] **Step 4: Commit**

```bash
git add libs/shared-data-models/src/lib/admin-user.ts libs/shared-data-models/src/lib/api-error.ts
git commit -m "feat(shared): add AdminUserRoleResponse + INVALID_ROLE_TRANSITION code" \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `InvalidRoleTransitionException` (+ filter renders 409)

**Files:**
- Modify: `libs/api-profile/src/lib/users/errors/admin-users.exception.ts`
- Test: `libs/api-profile/src/lib/users/errors/admin-users.exception.spec.ts`
- Test: `libs/api-profile/src/lib/users/admin-users.exception-filter.spec.ts`

- [ ] **Step 1: Write the failing exception test**

Append to `libs/api-profile/src/lib/users/errors/admin-users.exception.spec.ts` (inside the existing `describe('AdminUsersException', ...)` block, and update the import line to include the new class):

Update the import:

```ts
import {
  AdminUsersException,
  InvalidRoleTransitionException,
  UserNotFoundException,
} from './admin-users.exception';
```

Add the test:

```ts
  it('InvalidRoleTransitionException carries code INVALID_ROLE_TRANSITION, status 409, details', () => {
    const err = new InvalidRoleTransitionException('ADMIN', 'INSTRUCTOR');
    expect(err).toBeInstanceOf(AdminUsersException);
    expect(err.code).toBe('INVALID_ROLE_TRANSITION');
    expect(err.status).toBe(409);
    expect(err.message).toBe('Invalid role transition.');
    expect(err.details).toEqual({ currentRole: 'ADMIN', attempted: 'INSTRUCTOR' });
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec nx test api-profile -- --run src/lib/users/errors/admin-users.exception.spec.ts`
Expected: FAIL — `InvalidRoleTransitionException` is not exported.

- [ ] **Step 3: Implement the exception**

In `libs/api-profile/src/lib/users/errors/admin-users.exception.ts`, update the import to add `UserRole`, and add the class after `UserNotFoundException`:

```ts
import type { AdminUsersErrorCode, UserRole } from '@learnwren/shared-data-models';
```

```ts
export class InvalidRoleTransitionException extends AdminUsersException {
  constructor(currentRole: UserRole, attempted: UserRole) {
    super('INVALID_ROLE_TRANSITION', 'Invalid role transition.', 409, { currentRole, attempted });
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec nx test api-profile -- --run src/lib/users/errors/admin-users.exception.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing filter test (proves 409 + details render)**

In `libs/api-profile/src/lib/users/admin-users.exception-filter.spec.ts`, update the import of the errors module to include the new class:

```ts
import { InvalidRoleTransitionException, UserNotFoundException } from './errors/admin-users.exception';
```

Add this test inside the `describe('AdminUsersExceptionFilter', ...)` block:

```ts
  it('renders InvalidRoleTransitionException as HTTP 409 with code + details', () => {
    const { host, status, json } = mockHost();
    new AdminUsersExceptionFilter().catch(
      new InvalidRoleTransitionException('STUDENT', 'STUDENT'),
      host,
    );
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'INVALID_ROLE_TRANSITION',
        message: 'Invalid role transition.',
        details: { currentRole: 'STUDENT', attempted: 'STUDENT' },
      },
    });
  });
```

- [ ] **Step 6: Run the filter test (passes with no filter change)**

Run: `pnpm exec nx test api-profile -- --run src/lib/users/admin-users.exception-filter.spec.ts`
Expected: PASS — the filter already `@Catch`es `AdminUsersException`, and `handleException` renders a domain-shaped exception's status/code/details. (No filter source change needed; this is a regression guard.)

- [ ] **Step 7: Commit**

```bash
git add libs/api-profile/src/lib/users/errors/admin-users.exception.ts \
  libs/api-profile/src/lib/users/errors/admin-users.exception.spec.ts \
  libs/api-profile/src/lib/users/admin-users.exception-filter.spec.ts
git commit -m "feat(api-profile): add InvalidRoleTransitionException (409)" \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `demoteInstructorToStudent` effect helper

**Files:**
- Create: `libs/api-profile/src/lib/users/role-mutation.ts`
- Test: `libs/api-profile/src/lib/users/role-mutation.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-profile/src/lib/users/role-mutation.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { UserId } from '@learnwren/shared-data-models';

import { demoteInstructorToStudent } from './role-mutation';

describe('demoteInstructorToStudent', () => {
  it('sets the STUDENT claim, writes users/{uid}.role, then revokes refresh tokens', async () => {
    const update = vi.fn(async () => undefined);
    const doc = vi.fn(() => ({ update }));
    const collection = vi.fn(() => ({ doc }));
    const firestore = { collection };
    const auth = {
      setCustomUserClaims: vi.fn(async () => undefined),
      revokeRefreshTokens: vi.fn(async () => undefined),
    };

    await demoteInstructorToStudent('u1' as UserId, auth, firestore);

    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u1', { role: 'STUDENT' });
    expect(collection).toHaveBeenCalledWith('users');
    expect(doc).toHaveBeenCalledWith('u1');
    expect(update).toHaveBeenCalledWith({ role: 'STUDENT' });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('u1');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec nx test api-profile -- --run src/lib/users/role-mutation.spec.ts`
Expected: FAIL — `./role-mutation` does not exist.

- [ ] **Step 3: Implement the helper**

Create `libs/api-profile/src/lib/users/role-mutation.ts`:

```ts
import type { UserId } from '@learnwren/shared-data-models';

/** Minimal structural slice of the Firebase Admin Auth handle used to demote. */
export interface DemotionAuthLike {
  setCustomUserClaims(uid: string, claims: object | null): Promise<unknown>;
  revokeRefreshTokens(uid: string): Promise<unknown>;
}

/** Minimal structural slice of the Firebase Admin Firestore handle used to demote. */
export interface DemotionFirestoreLike {
  collection(path: string): {
    doc(id: string): { update(data: Record<string, unknown>): Promise<unknown> };
  };
}

/**
 * Revoke the INSTRUCTOR role: set the STUDENT custom claim, update
 * `users/{uid}.role`, and revoke the user's refresh tokens so the change takes
 * effect on their next request (the session guard verifies cookies with
 * `checkRevoked = true`). Pure over the Admin-SDK handles so it stays
 * unit-testable and Nest-free, mirroring `promoteUserToInstructor`.
 */
export async function demoteInstructorToStudent(
  uid: UserId,
  auth: DemotionAuthLike,
  firestore: DemotionFirestoreLike,
): Promise<void> {
  await auth.setCustomUserClaims(uid, { role: 'STUDENT' });
  await firestore.collection('users').doc(uid).update({ role: 'STUDENT' });
  await auth.revokeRefreshTokens(uid);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec nx test api-profile -- --run src/lib/users/role-mutation.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-profile/src/lib/users/role-mutation.ts libs/api-profile/src/lib/users/role-mutation.spec.ts
git commit -m "feat(api-profile): add demoteInstructorToStudent effect" \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `AdminUserRoleService` (promote + demote orchestration)

**Files:**
- Create: `libs/api-profile/src/lib/users/admin-user-role.service.ts`
- Test: `libs/api-profile/src/lib/users/admin-user-role.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-profile/src/lib/users/admin-user-role.service.spec.ts`. It mocks the two effect modules (via `vi.hoisted`, the vitest-safe pattern) so the test isolates the service's validation + delegation:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserId } from '@learnwren/shared-data-models';

import { AdminUserRoleService } from './admin-user-role.service';
import { InvalidRoleTransitionException, UserNotFoundException } from './errors/admin-users.exception';
import type { AdminUsersRepository } from './admin-users.repository';

const { promoteMock, demoteMock } = vi.hoisted(() => ({
  promoteMock: vi.fn(),
  demoteMock: vi.fn(),
}));
vi.mock('../instructor-application/instructor-promotion', () => ({
  promoteUserToInstructor: promoteMock,
}));
vi.mock('./role-mutation', () => ({
  demoteInstructorToStudent: demoteMock,
}));

describe('AdminUserRoleService', () => {
  let repo: { getUser: ReturnType<typeof vi.fn> };
  let auth: Record<string, unknown>;
  let firestore: Record<string, unknown>;
  let svc: AdminUserRoleService;

  beforeEach(() => {
    promoteMock.mockReset().mockResolvedValue(undefined);
    demoteMock.mockReset().mockResolvedValue(undefined);
    repo = { getUser: vi.fn() };
    auth = {};
    firestore = {};
    svc = new AdminUserRoleService(
      firestore as never,
      auth as never,
      repo as unknown as AdminUsersRepository,
    );
  });

  describe('promote', () => {
    it('throws UserNotFoundException when the user is missing', async () => {
      repo.getUser.mockResolvedValue(null);
      await expect(svc.promote('nope' as UserId)).rejects.toBeInstanceOf(UserNotFoundException);
      expect(promoteMock).not.toHaveBeenCalled();
    });

    it('throws InvalidRoleTransitionException when the user is already an INSTRUCTOR', async () => {
      repo.getUser.mockResolvedValue({ id: 'u1', role: 'INSTRUCTOR' });
      await expect(svc.promote('u1' as UserId)).rejects.toBeInstanceOf(InvalidRoleTransitionException);
      expect(promoteMock).not.toHaveBeenCalled();
    });

    it('throws InvalidRoleTransitionException when the user is an ADMIN', async () => {
      repo.getUser.mockResolvedValue({ id: 'u1', role: 'ADMIN' });
      await expect(svc.promote('u1' as UserId)).rejects.toBeInstanceOf(InvalidRoleTransitionException);
      expect(promoteMock).not.toHaveBeenCalled();
    });

    it('promotes a STUDENT via the shared effect and returns the new role', async () => {
      repo.getUser.mockResolvedValue({ id: 'u1', role: 'STUDENT' });
      const res = await svc.promote('u1' as UserId);
      expect(promoteMock).toHaveBeenCalledTimes(1);
      expect(promoteMock.mock.calls[0][0]).toBe('u1');
      expect(promoteMock.mock.calls[0][1]).toBe(auth);
      expect(res).toEqual({ id: 'u1', role: 'INSTRUCTOR' });
    });
  });

  describe('demote', () => {
    it('throws UserNotFoundException when the user is missing', async () => {
      repo.getUser.mockResolvedValue(null);
      await expect(svc.demote('nope' as UserId)).rejects.toBeInstanceOf(UserNotFoundException);
      expect(demoteMock).not.toHaveBeenCalled();
    });

    it('throws InvalidRoleTransitionException when the user is a STUDENT', async () => {
      repo.getUser.mockResolvedValue({ id: 'u1', role: 'STUDENT' });
      await expect(svc.demote('u1' as UserId)).rejects.toBeInstanceOf(InvalidRoleTransitionException);
      expect(demoteMock).not.toHaveBeenCalled();
    });

    it('throws InvalidRoleTransitionException when the user is an ADMIN', async () => {
      repo.getUser.mockResolvedValue({ id: 'u1', role: 'ADMIN' });
      await expect(svc.demote('u1' as UserId)).rejects.toBeInstanceOf(InvalidRoleTransitionException);
      expect(demoteMock).not.toHaveBeenCalled();
    });

    it('demotes an INSTRUCTOR via the demote effect and returns the new role', async () => {
      repo.getUser.mockResolvedValue({ id: 'u1', role: 'INSTRUCTOR' });
      const res = await svc.demote('u1' as UserId);
      expect(demoteMock).toHaveBeenCalledTimes(1);
      expect(demoteMock.mock.calls[0][0]).toBe('u1');
      expect(demoteMock.mock.calls[0][1]).toBe(auth);
      expect(res).toEqual({ id: 'u1', role: 'STUDENT' });
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec nx test api-profile -- --run src/lib/users/admin-user-role.service.spec.ts`
Expected: FAIL — `admin-user-role.service` does not exist.

- [ ] **Step 3: Implement the service**

Create `libs/api-profile/src/lib/users/admin-user-role.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';

import {
  FIRESTORE,
  type FirestoreHandle,
  FIREBASE_AUTH,
  type FirebaseAuthHandle,
} from '@learnwren/api-firebase';
import { nowIso } from '@learnwren/shared-data-models';
import type { AdminUserRoleResponse, UserId, UserRole } from '@learnwren/shared-data-models';

import { AdminUsersRepository } from './admin-users.repository';
import { InvalidRoleTransitionException, UserNotFoundException } from './errors/admin-users.exception';
import {
  promoteUserToInstructor,
  type PromotionFirestoreLike,
} from '../instructor-application/instructor-promotion';
import { demoteInstructorToStudent, type DemotionFirestoreLike } from './role-mutation';

@Injectable()
export class AdminUserRoleService {
  constructor(
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle,
    private readonly repo: AdminUsersRepository,
  ) {}

  async promote(uid: UserId): Promise<AdminUserRoleResponse> {
    const user = await this.repo.getUser(uid);
    if (!user) {
      throw new UserNotFoundException();
    }
    if (user.role !== 'STUDENT') {
      throw new InvalidRoleTransitionException((user.role ?? 'STUDENT') as UserRole, 'INSTRUCTOR');
    }
    await promoteUserToInstructor(
      uid,
      this.auth,
      this.firestore as unknown as PromotionFirestoreLike,
      nowIso(),
    );
    return { id: uid, role: 'INSTRUCTOR' };
  }

  async demote(uid: UserId): Promise<AdminUserRoleResponse> {
    const user = await this.repo.getUser(uid);
    if (!user) {
      throw new UserNotFoundException();
    }
    if (user.role !== 'INSTRUCTOR') {
      throw new InvalidRoleTransitionException((user.role ?? 'STUDENT') as UserRole, 'STUDENT');
    }
    await demoteInstructorToStudent(
      uid,
      this.auth,
      this.firestore as unknown as DemotionFirestoreLike,
    );
    return { id: uid, role: 'STUDENT' };
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec nx test api-profile -- --run src/lib/users/admin-user-role.service.spec.ts`
Expected: PASS (all 8 cases).

- [ ] **Step 5: Commit**

```bash
git add libs/api-profile/src/lib/users/admin-user-role.service.ts \
  libs/api-profile/src/lib/users/admin-user-role.service.spec.ts
git commit -m "feat(api-profile): add AdminUserRoleService (promote/demote)" \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Wire the two POST routes into the controller + module

**Files:**
- Modify: `libs/api-profile/src/lib/users/admin-users.controller.ts`
- Modify: `libs/api-profile/src/lib/users/admin-users.controller.spec.ts`
- Modify: `libs/api-profile/src/lib/profile.module.ts`

- [ ] **Step 1: Update the failing controller test**

In `libs/api-profile/src/lib/users/admin-users.controller.spec.ts`:

(a) Add the role-service type import below the existing imports:

```ts
import type { AdminUserRoleService } from './admin-user-role.service';
```

(b) The controller constructor gains a second argument, so update **all three** existing `new AdminUsersController(...)` calls to pass a role-service stub as the 2nd arg. For the three existing tests, change:

```ts
const ctrl = new AdminUsersController(svc as unknown as AdminUsersService);
```

to:

```ts
const ctrl = new AdminUsersController(
  svc as unknown as AdminUsersService,
  {} as unknown as AdminUserRoleService,
);
```

(c) Add two new tests at the end of the `describe` block:

```ts
  it('promote delegates to the role service with the path uid', async () => {
    const roleSvc = {
      promote: vi.fn(async () => ({ id: 'u1', role: 'INSTRUCTOR' })),
      demote: vi.fn(),
    };
    const ctrl = new AdminUsersController(
      {} as unknown as AdminUsersService,
      roleSvc as unknown as AdminUserRoleService,
    );
    await ctrl.promote('u1');
    expect(roleSvc.promote).toHaveBeenCalledWith('u1');
  });

  it('demote delegates to the role service with the path uid', async () => {
    const roleSvc = {
      promote: vi.fn(),
      demote: vi.fn(async () => ({ id: 'u1', role: 'STUDENT' })),
    };
    const ctrl = new AdminUsersController(
      {} as unknown as AdminUsersService,
      roleSvc as unknown as AdminUserRoleService,
    );
    await ctrl.demote('u1');
    expect(roleSvc.demote).toHaveBeenCalledWith('u1');
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec nx test api-profile -- --run src/lib/users/admin-users.controller.spec.ts`
Expected: FAIL — `ctrl.promote`/`ctrl.demote` are not functions / constructor arity mismatch.

- [ ] **Step 3: Implement the controller routes**

In `libs/api-profile/src/lib/users/admin-users.controller.ts`:

(a) Add `Post` to the `@nestjs/common` import and `AdminUserRoleResponse` to the shared-types import:

```ts
import { Controller, Get, Param, Post, Query, UseFilters, UseGuards } from '@nestjs/common';
```

```ts
import type {
  AdminUserDetail,
  AdminUserListResponse,
  AdminUserRoleResponse,
  UserId,
} from '@learnwren/shared-data-models';
```

(b) Import the role service:

```ts
import { AdminUserRoleService } from './admin-user-role.service';
```

(c) Inject it and add the routes (constructor + two methods):

```ts
  constructor(
    private readonly svc: AdminUsersService,
    private readonly roleSvc: AdminUserRoleService,
  ) {}
```

Add after `getOne`:

```ts
  @Post(':uid/promote')
  promote(@Param('uid') uid: string): Promise<AdminUserRoleResponse> {
    return this.roleSvc.promote(uid as UserId);
  }

  @Post(':uid/demote')
  demote(@Param('uid') uid: string): Promise<AdminUserRoleResponse> {
    return this.roleSvc.demote(uid as UserId);
  }
```

- [ ] **Step 4: Register the service in the module**

In `libs/api-profile/src/lib/profile.module.ts`, add the import near the other `users/` imports:

```ts
import { AdminUserRoleService } from './users/admin-user-role.service';
```

and add `AdminUserRoleService` to the `providers` array (next to `AdminUsersService`, `AdminUsersRepository`, `AdminUsersExceptionFilter`):

```ts
    AdminUsersService,
    AdminUserRoleService,
    AdminUsersRepository,
    AdminUsersExceptionFilter,
```

- [ ] **Step 5: Run the controller test + typecheck the API**

Run: `pnpm exec nx test api-profile -- --run src/lib/users/admin-users.controller.spec.ts`
Expected: PASS.

Run: `NX_DAEMON=false pnpm exec nx build api`
Expected: build succeeds (DI graph resolves; no tsc errors).

- [ ] **Step 6: Commit**

```bash
git add libs/api-profile/src/lib/users/admin-users.controller.ts \
  libs/api-profile/src/lib/users/admin-users.controller.spec.ts \
  libs/api-profile/src/lib/profile.module.ts
git commit -m "feat(api-profile): expose POST admin/users/:uid/promote|demote" \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: API e2e (emulator-backed)

**Files:**
- Modify: `apps/api-e2e/src/admin-users.e2e-spec.ts`

> Prereq: `pnpm emulators` and `pnpm start:api` running (see the NOTE at the top of the spec). Reuses the `registerStudent` / `registerAndPromoteInstructor` / `registerAndPromoteAdmin` helpers; each registers a fresh, unique user (shared emulator), so assert per-user role via the by-uid detail endpoint — never page-1 membership.

- [ ] **Step 1: Add the deterministic role-change e2e tests**

Append to `apps/api-e2e/src/admin-users.e2e-spec.ts` (the `import { ... } from './_helpers/auth'` block already includes the three helpers used here):

```ts
test('admin promotes a student to instructor', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const student = await registerStudent(ctx);
    const adminSession = await registerAndPromoteAdmin(ctx);
    const hdr = { Cookie: adminSession.cookieHeader };

    const res = await ctx.post(`${API_BASE}/admin/users/${student.uid}/promote`, { headers: hdr });
    expect(res.status()).toBe(201);
    expect((await res.json()).role).toBe('INSTRUCTOR');

    const detail = await ctx.get(`${API_BASE}/admin/users/${student.uid}`, { headers: hdr });
    expect((await detail.json()).role).toBe('INSTRUCTOR');
  } finally {
    await ctx.dispose();
  }
});

test('admin demotes an instructor to student', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const instructor = await registerAndPromoteInstructor(ctx);
    const adminSession = await registerAndPromoteAdmin(ctx);
    const hdr = { Cookie: adminSession.cookieHeader };

    const res = await ctx.post(`${API_BASE}/admin/users/${instructor.uid}/demote`, { headers: hdr });
    expect(res.status()).toBe(201);
    expect((await res.json()).role).toBe('STUDENT');

    const detail = await ctx.get(`${API_BASE}/admin/users/${instructor.uid}`, { headers: hdr });
    expect((await detail.json()).role).toBe('STUDENT');
  } finally {
    await ctx.dispose();
  }
});

test('promote on a non-student is 409 INVALID_ROLE_TRANSITION', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const instructor = await registerAndPromoteInstructor(ctx);
    const adminSession = await registerAndPromoteAdmin(ctx);
    const res = await ctx.post(`${API_BASE}/admin/users/${instructor.uid}/promote`, {
      headers: { Cookie: adminSession.cookieHeader },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe('INVALID_ROLE_TRANSITION');
  } finally {
    await ctx.dispose();
  }
});

test('demote on a non-instructor is 409 INVALID_ROLE_TRANSITION', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const student = await registerStudent(ctx);
    const adminSession = await registerAndPromoteAdmin(ctx);
    const res = await ctx.post(`${API_BASE}/admin/users/${student.uid}/demote`, {
      headers: { Cookie: adminSession.cookieHeader },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe('INVALID_ROLE_TRANSITION');
  } finally {
    await ctx.dispose();
  }
});

test('non-admin cannot promote or demote (403)', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const instructor = await registerAndPromoteInstructor(ctx);
    const student = await registerStudent(ctx);
    const res = await ctx.post(`${API_BASE}/admin/users/${student.uid}/promote`, {
      headers: { Cookie: instructor.cookieHeader },
    });
    expect(res.status()).toBe(403);
  } finally {
    await ctx.dispose();
  }
});
```

- [ ] **Step 2: (Optional, timing-sensitive) Add the revoke-immediacy test**

Append this test. If it passes inconsistently against the Auth emulator (second-granularity `validSince`), change `test(` to `test.skip(` with a comment pointing to the `revokeRefreshTokens` unit assertion in `role-mutation.spec.ts`, and record it as a manual-verify item — do not let it gate the slice.

```ts
test('demotion revokes the instructor session (next request 401) [timing-sensitive]', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const instructor = await registerAndPromoteInstructor(ctx);
    const adminSession = await registerAndPromoteAdmin(ctx);

    // The live instructor session can reach a FirebaseSessionGuard-protected route.
    const before = await ctx.get(`${API_BASE}/profile`, { headers: { Cookie: instructor.cookieHeader } });
    expect(before.status()).toBe(200);

    await ctx.post(`${API_BASE}/admin/users/${instructor.uid}/demote`, {
      headers: { Cookie: adminSession.cookieHeader },
    });

    // After revocation, the same cookie fails verifySessionCookie(checkRevoked=true).
    const after = await ctx.get(`${API_BASE}/profile`, { headers: { Cookie: instructor.cookieHeader } });
    expect(after.status()).toBe(401);
  } finally {
    await ctx.dispose();
  }
});
```

- [ ] **Step 3: Run the api-e2e suite for this spec**

Run: `pnpm exec nx e2e api-e2e -- --grep "promote|demote|revokes"`
Expected: the 5 deterministic tests PASS (and the optional one passes or is skipped).

- [ ] **Step 4: Commit**

```bash
git add apps/api-e2e/src/admin-users.e2e-spec.ts
git commit -m "test(api-e2e): cover admin promote/demote (+409, 403, revoke)" \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Web `AdminUsersService` — promote/demote wrappers

**Files:**
- Modify: `libs/web-admin/src/lib/admin-users.service.ts`
- Test: `libs/web-admin/src/lib/admin-users.service.spec.ts`

- [ ] **Step 1: Write the failing test**

In `libs/web-admin/src/lib/admin-users.service.spec.ts`, the existing `beforeEach` mocks HttpClient with only `{ get }`. Add a `post` mock and two tests. Replace the `beforeEach` body's provider with one that includes `post`, and add the tests:

Update the `beforeEach`:

```ts
  let get: ReturnType<typeof vi.fn>;
  let post: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    get = vi.fn(() => of({ users: [], total: 0, page: 1, pageSize: 20, capped: false }));
    post = vi.fn(() => of({ id: 'u1', role: 'INSTRUCTOR' }));
    TestBed.configureTestingModule({
      providers: [{ provide: HttpClient, useValue: { get, post } }],
    });
  });
```

Add the tests:

```ts
  it('promote() POSTs /api/admin/users/:uid/promote', async () => {
    const svc = TestBed.inject(AdminUsersService);
    await svc.promote('u1');
    expect(post).toHaveBeenCalledWith('/api/admin/users/u1/promote', {});
  });

  it('demote() POSTs /api/admin/users/:uid/demote', async () => {
    post = vi.fn(() => of({ id: 'u1', role: 'STUDENT' }));
    TestBed.overrideProvider(HttpClient, { useValue: { get, post } });
    const svc = TestBed.inject(AdminUsersService);
    await svc.demote('u1');
    expect(post).toHaveBeenCalledWith('/api/admin/users/u1/demote', {});
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec nx test web-admin -- --run src/lib/admin-users.service.spec.ts`
Expected: FAIL — `svc.promote`/`svc.demote` are not functions.

- [ ] **Step 3: Implement the wrappers**

In `libs/web-admin/src/lib/admin-users.service.ts`, add `AdminUserRoleResponse` to the type import and the two methods:

```ts
import type {
  AdminUserDetail,
  AdminUserListResponse,
  AdminUserRoleResponse,
} from '@learnwren/shared-data-models';
```

Add inside the class, after `getDetail`:

```ts
  promote(uid: string): Promise<AdminUserRoleResponse> {
    return firstValueFrom(this.http.post<AdminUserRoleResponse>(`${BASE}/${uid}/promote`, {}));
  }

  demote(uid: string): Promise<AdminUserRoleResponse> {
    return firstValueFrom(this.http.post<AdminUserRoleResponse>(`${BASE}/${uid}/demote`, {}));
  }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec nx test web-admin -- --run src/lib/admin-users.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-admin/src/lib/admin-users.service.ts libs/web-admin/src/lib/admin-users.service.spec.ts
git commit -m "feat(web-admin): add promote/demote HTTP wrappers" \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Web detail page — role actions + inline confirm

**Files:**
- Modify: `libs/web-admin/src/lib/admin-user-detail-page/admin-user-detail-page.component.ts`
- Modify: `libs/web-admin/src/lib/admin-user-detail-page/admin-user-detail-page.component.html`
- Test: `libs/web-admin/src/lib/admin-user-detail-page/admin-user-detail-page.component.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append these tests to the `describe('AdminUserDetailPageComponent', ...)` block in `admin-user-detail-page.component.spec.ts`. The existing `detail()` factory defaults `role: 'INSTRUCTOR'`; tests below override `role` as needed and add a `promote`/`demote` to the `svc` stub.

First, extend the `svc` type and `beforeEach` to include `promote`/`demote`:

```ts
  let svc: {
    getDetail: ReturnType<typeof vi.fn>;
    promote: ReturnType<typeof vi.fn>;
    demote: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    svc = {
      getDetail: vi.fn(async () => detail()),
      promote: vi.fn(async () => ({ id: 'u1', role: 'INSTRUCTOR' })),
      demote: vi.fn(async () => ({ id: 'u1', role: 'STUDENT' })),
    };
  });
```

Then add the tests:

```ts
  it('shows Promote for a STUDENT and no Demote', async () => {
    svc.getDetail = vi.fn(async () => detail({ role: 'STUDENT' }));
    const fixture = await setup();
    expect(fixture.nativeElement.querySelector('[data-testid="promote-btn"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="demote-btn"]')).toBeNull();
  });

  it('shows Demote for an INSTRUCTOR and no Promote', async () => {
    svc.getDetail = vi.fn(async () => detail({ role: 'INSTRUCTOR' }));
    const fixture = await setup();
    expect(fixture.nativeElement.querySelector('[data-testid="demote-btn"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="promote-btn"]')).toBeNull();
  });

  it('shows no role actions for an ADMIN', async () => {
    svc.getDetail = vi.fn(async () => detail({ role: 'ADMIN' }));
    const fixture = await setup();
    expect(fixture.nativeElement.querySelector('[data-testid="promote-btn"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="demote-btn"]')).toBeNull();
  });

  it('promotes a student and swaps the action to Demote + shows success', async () => {
    svc.getDetail = vi.fn(async () => detail({ role: 'STUDENT' }));
    const fixture = await setup();
    fixture.nativeElement.querySelector('[data-testid="promote-btn"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(svc.promote).toHaveBeenCalledWith('u1');
    expect(fixture.nativeElement.querySelector('[data-testid="demote-btn"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="action-success"]')?.textContent).toContain('Promoted');
  });

  it('demote requires the inline confirm before calling the service', async () => {
    svc.getDetail = vi.fn(async () => detail({ role: 'INSTRUCTOR' }));
    const fixture = await setup();
    fixture.nativeElement.querySelector('[data-testid="demote-btn"]').click();
    fixture.detectChanges();
    expect(svc.demote).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[data-testid="demote-confirm"]')).toBeTruthy();

    fixture.nativeElement.querySelector('[data-testid="demote-confirm-btn"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(svc.demote).toHaveBeenCalledWith('u1');
    expect(fixture.nativeElement.querySelector('[data-testid="promote-btn"]')).toBeTruthy();
  });

  it('renders a "changed elsewhere" error on INVALID_ROLE_TRANSITION', async () => {
    svc.getDetail = vi.fn(async () => detail({ role: 'STUDENT' }));
    svc.promote = vi.fn(async () => {
      throw { error: { error: { code: 'INVALID_ROLE_TRANSITION' } } };
    });
    const fixture = await setup();
    fixture.nativeElement.querySelector('[data-testid="promote-btn"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="action-error"]')?.textContent).toContain('changed elsewhere');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec nx test web-admin -- --run src/lib/admin-user-detail-page/admin-user-detail-page.component.spec.ts`
Expected: FAIL — buttons/`data-testid`s not present; `promote`/`demote` methods missing.

- [ ] **Step 3: Implement the component logic**

In `admin-user-detail-page.component.ts`, add the `AdminUserRoleResponse` type import:

```ts
import type { AdminUserDetail, AdminUserRoleResponse } from '@learnwren/shared-data-models';
```

Add these signals next to the existing `user`/`loading`/`notFound`:

```ts
  readonly busy = signal(false);
  readonly actionError = signal<string | undefined>(undefined);
  readonly actionSuccess = signal<string | undefined>(undefined);
  readonly confirmingDemote = signal(false);
```

Add these methods to the class:

```ts
  startDemote(): void {
    this.actionError.set(undefined);
    this.actionSuccess.set(undefined);
    this.confirmingDemote.set(true);
  }

  cancelDemote(): void {
    this.confirmingDemote.set(false);
  }

  async promote(): Promise<void> {
    await this.changeRole(() => this.svc.promote(this.user()!.id), 'Promoted to Instructor.');
  }

  async confirmDemote(): Promise<void> {
    await this.changeRole(() => this.svc.demote(this.user()!.id), 'Demoted to Student.');
  }

  private async changeRole(
    action: () => Promise<AdminUserRoleResponse>,
    successMsg: string,
  ): Promise<void> {
    this.busy.set(true);
    this.actionError.set(undefined);
    this.actionSuccess.set(undefined);
    try {
      const res = await action();
      this.user.update((u) => (u ? { ...u, role: res.role } : u));
      this.confirmingDemote.set(false);
      this.actionSuccess.set(successMsg);
    } catch (err) {
      this.actionError.set(this.messageFor(err));
    } finally {
      this.busy.set(false);
    }
  }

  private messageFor(err: unknown): string {
    const code = (err as { error?: { error?: { code?: string } } })?.error?.error?.code;
    if (code === 'INVALID_ROLE_TRANSITION') {
      return "This user's role changed elsewhere. Refresh to see the current role.";
    }
    if (code === 'USER_NOT_FOUND') {
      return 'This user no longer exists.';
    }
    return 'Something went wrong. Please try again.';
  }
```

- [ ] **Step 4: Implement the template**

In `admin-user-detail-page.component.html`, insert the role-actions block **immediately after the header `<div class="mt-6 flex items-center gap-4">…</div>`** (the block that closes with the role badge `<span …>{{ u.role }}</span></div>`), before the `<dl …>` element:

```html
    <div class="mt-4 flex flex-col gap-2" data-testid="role-actions">
      @if (u.role === 'STUDENT') {
        <div>
          <button
            type="button"
            class="lw-btn lw-btn-primary"
            data-testid="promote-btn"
            [disabled]="busy()"
            (click)="promote()"
          >
            Promote to Instructor
          </button>
        </div>
      } @else if (u.role === 'INSTRUCTOR') {
        @if (confirmingDemote()) {
          <div class="rounded bg-bg-2 p-3" data-testid="demote-confirm">
            <p class="text-sm text-ink">
              Demote {{ u.displayName }} to Student?
              @if (u.authoredCourses.length > 0) {
                They will keep {{ u.authoredCourses.length }} authored course(s) but lose the
                ability to edit or create courses.
              }
            </p>
            <div class="mt-2 flex gap-2">
              <button
                type="button"
                class="lw-btn lw-btn-primary"
                data-testid="demote-confirm-btn"
                [disabled]="busy()"
                (click)="confirmDemote()"
              >
                Confirm demotion
              </button>
              <button
                type="button"
                class="lw-btn lw-btn-ghost"
                data-testid="demote-cancel-btn"
                [disabled]="busy()"
                (click)="cancelDemote()"
              >
                Cancel
              </button>
            </div>
          </div>
        } @else {
          <div>
            <button
              type="button"
              class="lw-btn lw-btn-secondary"
              data-testid="demote-btn"
              [disabled]="busy()"
              (click)="startDemote()"
            >
              Demote to Student
            </button>
          </div>
        }
      }
      @if (actionSuccess(); as msg) {
        <p class="text-sm text-green-800" data-testid="action-success">{{ msg }}</p>
      }
      @if (actionError(); as msg) {
        <p class="text-sm text-red-600" role="alert" data-testid="action-error">{{ msg }}</p>
      }
    </div>
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm exec nx test web-admin -- --run src/lib/admin-user-detail-page/admin-user-detail-page.component.spec.ts`
Expected: PASS (all new + existing tests).

- [ ] **Step 6: Commit**

```bash
git add libs/web-admin/src/lib/admin-user-detail-page/admin-user-detail-page.component.ts \
  libs/web-admin/src/lib/admin-user-detail-page/admin-user-detail-page.component.html \
  libs/web-admin/src/lib/admin-user-detail-page/admin-user-detail-page.component.spec.ts
git commit -m "feat(web-admin): promote/demote actions on the user detail page" \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Web e2e (hermetic)

**Files:**
- Modify: `apps/web-e2e/src/admin-users.spec.ts`

> Reminder: Playwright matches `page.route` handlers in **reverse registration order** — register the broad `**/api/admin/users**` glob FIRST, the specific detail/promote/demote routes LAST, so the specific ones win.

- [ ] **Step 1: Add the role-action e2e tests**

Append to `apps/web-e2e/src/admin-users.spec.ts` (the `ADMIN_ME_STUB` and helpers are already defined at the top of the file):

```ts
test('admin promotes a student from the detail page', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_ME_STUB) });
  });
  await page.route('**/api/admin/users**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIST_RESPONSE) });
  });
  await page.route('**/api/admin/users/u1', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...DETAIL_RESPONSE, role: 'STUDENT' }),
    });
  });
  await page.route('**/api/admin/users/u1/promote', (route) => {
    void route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'u1', role: 'INSTRUCTOR' }),
    });
  });

  await page.goto('/admin/users/u1');
  await expect(page.getByTestId('promote-btn')).toBeVisible();
  await page.getByTestId('promote-btn').click();
  await expect(page.getByTestId('demote-btn')).toBeVisible();
  await expect(page.getByTestId('action-success')).toContainText('Promoted to Instructor');
});

test('admin demotes an instructor via the inline confirm', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_ME_STUB) });
  });
  await page.route('**/api/admin/users**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIST_RESPONSE) });
  });
  await page.route('**/api/admin/users/u1', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...DETAIL_RESPONSE, role: 'INSTRUCTOR' }),
    });
  });
  await page.route('**/api/admin/users/u1/demote', (route) => {
    void route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'u1', role: 'STUDENT' }),
    });
  });

  await page.goto('/admin/users/u1');
  await page.getByTestId('demote-btn').click();
  await expect(page.getByTestId('demote-confirm')).toBeVisible();
  await page.getByTestId('demote-confirm-btn').click();
  await expect(page.getByTestId('promote-btn')).toBeVisible();
  await expect(page.getByTestId('action-success')).toContainText('Demoted to Student');
});

test('a stale role change surfaces an inline error', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_ME_STUB) });
  });
  await page.route('**/api/admin/users**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIST_RESPONSE) });
  });
  await page.route('**/api/admin/users/u1', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...DETAIL_RESPONSE, role: 'STUDENT' }),
    });
  });
  await page.route('**/api/admin/users/u1/promote', (route) => {
    void route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'INVALID_ROLE_TRANSITION', message: 'Invalid role transition.' } }),
    });
  });

  await page.goto('/admin/users/u1');
  await page.getByTestId('promote-btn').click();
  await expect(page.getByTestId('action-error')).toContainText('changed elsewhere');
});
```

- [ ] **Step 2: Run the web-e2e suite for this spec**

Run: `pnpm exec nx e2e web-e2e -- --grep "promote|demote|stale"`
Expected: the three tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web-e2e/src/admin-users.spec.ts
git commit -m "test(web-e2e): cover admin promote/demote detail-page flow" \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Build gate, lint/test sweep, README feature record

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the feature record**

Locate the EP-08 / admin-surface entry in `README.md`:

Run: `grep -n "US-08-01\|user directory\|Manage Users\|admin/users\|Slice A" README.md`

Beside the existing US-08-01 Slice A (read-only user directory) entry, add a concise line recording Slice B, matching the surrounding bullet/table style, e.g.:

> Admin role management (US-08-01 Slice B): an Administrator can promote a Student to Instructor or demote an Instructor to Student from `/admin/users/:uid` (`POST /api/admin/users/:uid/promote|demote`); demotion revokes the user's session immediately.

- [ ] **Step 2: Full affected build + lint + unit-test gate (no daemon)**

Run:

```bash
NX_DAEMON=false pnpm exec nx run-many -t build lint test \
  --projects=shared-data-models,api-profile,api,web-admin,web
```

Expected: all targets PASS. (The additive shared-types change can break `api-profile`/`api`/`web-admin` tsc while Vitest stays green — this build gate is the safety net.)

- [ ] **Step 3: Commit the docs update**

```bash
git add README.md
git commit -m "docs: record US-08-01 Slice B admin role management" \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Land the branch**

Merge the worktree branch to `main` with a non-fast-forward merge (per the repo's isolation workflow), e.g.:

```bash
git checkout main
git merge --no-ff feat/us-08-01-slice-b-role-management \
  -m "Merge feat/us-08-01-slice-b-role-management: EP-08 US-08-01 Slice B role management (promote/demote)"
```

---

## Self-review (performed against the spec)

**Spec coverage:**
- AC3 promote (STUDENT→INSTRUCTOR) → Tasks 4, 5, 6, 7, 8, 9. ✓
- AC3 demote (INSTRUCTOR→STUDENT) + immediate revoke → Tasks 3, 4, 5, 6, 8, 9. ✓
- Transition validation subsumes self/last-admin guard (ADMIN rejected) → Task 4 ADMIN-source tests. ✓
- Demotion leaves courses/applications untouched → demote effect (Task 3) only writes role/claim/revoke; no course or application writes. ✓
- No emails → no `EMAIL_TRANSPORT` injected anywhere in Tasks 3–5. ✓
- Two POST verbs, `AdminUserRoleResponse`, `INVALID_ROLE_TRANSITION`→409 → Tasks 1, 2, 5. ✓
- Web detail buttons (role-driven, inline demote confirm, in-place role swap, code-narrowed errors) → Task 8. ✓
- Build gate across affected projects + README → Task 10. ✓

**Placeholder scan:** none — every code/step block is complete.

**Type/name consistency:** `AdminUserRoleResponse { id, role }`, `InvalidRoleTransitionException(currentRole, attempted)`, `demoteInstructorToStudent(uid, auth, firestore)`, service methods `promote`/`demote`, web service `promote`/`demote`, component `promote`/`confirmDemote`/`startDemote`/`cancelDemote`, and `data-testid`s (`promote-btn`, `demote-btn`, `demote-confirm`, `demote-confirm-btn`, `demote-cancel-btn`, `action-success`, `action-error`) are used identically across the API, web, and e2e tasks. ✓
