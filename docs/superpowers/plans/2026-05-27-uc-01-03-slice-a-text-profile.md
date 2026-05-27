# UC-01-03 Slice A — Text Profile Editing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the smallest viable slice of UC-01-03: an authenticated user can navigate to `/settings/profile`, edit `displayName` and `biography`, save, and see the new display name immediately reflected in the header.

**Architecture:** New Nest feature lib `api-profile` exposes `GET /api/profile` and `PATCH /api/profile`, both gated by `FirebaseSessionGuard`. The PATCH returns an updated `MeResponse` (same shape `/api/auth/me` returns). New Angular feature lib `web-profile` owns the page and a thin HTTP-wrapper service; the page component calls a new `AuthService.setCurrentUser(...)` on success so the header refreshes without a reload. Biography is stored only — no read surfaces yet (deferred).

**Tech Stack:** NestJS 11, Angular 21, Firestore (collection `users`), Vitest, Playwright. Per-feature `ExceptionFilter` pattern (mirrors `CoverExceptionFilter`); HTTP-wrapper service pattern on the frontend (memory `feedback_web_service_pattern.md`).

**Spec:** [`docs/superpowers/specs/2026-05-27-uc-01-03-slice-a-text-profile-design.md`](../specs/2026-05-27-uc-01-03-slice-a-text-profile-design.md).

**Branching note:** The user prefers worktree isolation for feature work (memory `feedback_branch_isolation.md`). If not already in a worktree, set one up via `superpowers:using-git-worktrees` before starting Task 1; branch from local `HEAD` not `origin/main`; symlink `node_modules` into the new worktree.

---

## File Structure

**New files:**
- `libs/shared-data-models/src/lib/profile.ts` — `ProfileView`, `UpdateProfileInput`, `PROFILE_INVALID` error wire types.
- `libs/api-profile/` — new Nest lib (whole tree below).
  - `src/index.ts`
  - `src/lib/profile.module.ts`
  - `src/lib/profile.controller.ts` (+ `.spec.ts`)
  - `src/lib/profile.service.ts` (+ `.spec.ts`)
  - `src/lib/profile.exception-filter.ts` (+ `.spec.ts`)
  - `src/lib/dto/update-profile.dto.ts`
  - `src/lib/errors/profile.exception.ts`
  - `src/lib/errors/profile-error.codes.ts`
- `libs/web-profile/` — new Angular lib.
  - `src/index.ts`
  - `src/lib/profile.routes.ts`
  - `src/lib/profile.service.ts` (+ `.spec.ts`)
  - `src/lib/profile-page/profile-page.component.ts` (+ `.html`, `.spec.ts`)
- `apps/web-e2e/src/uc-01-03-text-profile.spec.ts` — Playwright golden path.

**Modified files:**
- `libs/shared-data-models/src/lib/user.ts` — add `biography: string`.
- `libs/shared-data-models/src/index.ts` — re-export profile types.
- `libs/api-auth/src/lib/auth.service.ts` — register flow writes `biography: ''` so new accounts have the field; existing-user reads tolerate missing field via `?? ''`.
- `libs/web-auth/src/lib/auth.service.ts` — add public `setCurrentUser(user: AuthenticatedUser): void`.
- `libs/web-auth/src/index.ts` — re-export `AuthenticatedUser` type (currently only auth-request's `AuthenticatedUser` is exported from api-auth; web-auth has its own).
- `apps/api/src/app/app.module.ts` — import and register `ProfileModule`.
- `apps/web/src/app/app.routes.ts` — spread `profileRoutes`.
- `apps/web/src/app/app.html` — convert initials chip into a `routerLink` to `/settings/profile`.
- `apps/web/src/app/app.spec.ts` — assert the new link.
- `tsconfig.base.json` — add path aliases for `@learnwren/api-profile` and `@learnwren/web-profile`.
- `docs/use-cases/01-user-identity-and-access.md` — flip UC-01-03 status banner after merge.
- `docs/quality/spec-drift-report.md` — flip UC-01-03 row to partial after merge.
- `README.md`, `docs/USER_GUIDE.md` — mention profile-settings page after merge.

---

## Phase 1: Shared data model

### Task 1: Add `biography` to the `User` interface

**Files:**
- Modify: `libs/shared-data-models/src/lib/user.ts`
- Modify: `libs/shared-data-models/src/lib/shared-data-models.spec.ts` (only if it constructs a `User` — adjust accordingly)

- [ ] **Step 1: Update the `User` interface**

```ts
// libs/shared-data-models/src/lib/user.ts
import type { ISODateString, UserId } from './common';

export type UserRole = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';

export interface User {
  id: UserId;
  email: string;
  displayName: string;
  biography: string;
  role: UserRole;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

- [ ] **Step 2: Fix the shared spec if it breaks**

Run: `pnpm nx test shared-data-models`

If `shared-data-models.spec.ts` constructs a `User` literal that now misses `biography`, add `biography: ''` to it.

- [ ] **Step 3: Run typecheck across the workspace to surface fallout**

Run: `pnpm nx run-many -t typecheck`

Expected: any callsite that constructs a `User` literal (likely just `auth.service.ts` register flow + a couple of spec fixtures) will fail. The next tasks fix those. **Do not commit yet** — the workspace must be green before the first commit.

### Task 2: Backfill `biography: ''` in the register flow + tolerate missing field on read

**Files:**
- Modify: `libs/api-auth/src/lib/auth.service.ts:140-170` (register Firestore write) and `:280-310` (`loadUserProfile` / `getMe` reads)
- Modify: `libs/api-auth/src/lib/auth.service.spec.ts` (snapshot of written doc)

- [ ] **Step 1: Write `biography: ''` on registration**

Find the register `firestore.collection('users').doc(uid).set({...})` call (around line 150). Add `biography: ''` to the written object alongside `displayName`, `role`, `createdAt`, `updatedAt`.

- [ ] **Step 2: Tolerate missing `biography` on existing docs**

In `loadUserProfile` (line ~279) the cast is `{ displayName: string; role: UserRole }`. Leave it — `biography` isn't needed there.

In `getMe` (line ~288) the read cast is the same; `biography` isn't returned by `getMe`. No change.

(Confirmed by spec: `MeResponse` does NOT gain `biography`.)

- [ ] **Step 3: Add test assertion for the register write shape**

Update `auth.service.spec.ts` register tests so the asserted Firestore document includes `biography: ''`. If the register test currently does a `toMatchObject(...)` against the written doc, add the field. If it asserts only specific keys, leave it.

- [ ] **Step 4: Run api-auth tests**

Run: `pnpm nx test api-auth`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/shared-data-models/src/lib/user.ts \
        libs/shared-data-models/src/lib/shared-data-models.spec.ts \
        libs/api-auth/src/lib/auth.service.ts \
        libs/api-auth/src/lib/auth.service.spec.ts
git commit -m "feat(shared-data-models): add biography to User; api-auth writes biography on register"
```

### Task 3: Define `ProfileView`, `UpdateProfileInput`, `PROFILE_INVALID` in shared-data-models

**Files:**
- Create: `libs/shared-data-models/src/lib/profile.ts`
- Modify: `libs/shared-data-models/src/index.ts`
- Create: `libs/shared-data-models/src/lib/profile.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// libs/shared-data-models/src/lib/profile.spec.ts
import { describe, expect, it } from 'vitest';
import { PROFILE_INVALID, type ProfileView, type UpdateProfileInput } from './profile';

describe('profile types', () => {
  it('PROFILE_INVALID is the wire error code', () => {
    expect(PROFILE_INVALID).toBe('PROFILE_INVALID');
  });

  it('ProfileView shape compiles with all required fields', () => {
    const view: ProfileView = {
      uid: 'u-1' as ProfileView['uid'],
      email: 'a@b.c',
      displayName: 'A',
      biography: '',
      role: 'STUDENT',
      emailVerified: true,
    };
    expect(view.displayName).toBe('A');
  });

  it('UpdateProfileInput shape compiles with displayName + biography', () => {
    const input: UpdateProfileInput = { displayName: 'A', biography: 'hi' };
    expect(input.biography).toBe('hi');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm nx test shared-data-models -- profile`

Expected: FAIL (module `./profile` does not exist).

- [ ] **Step 3: Create the module**

```ts
// libs/shared-data-models/src/lib/profile.ts
import type { UserId } from './common';
import type { UserRole } from './user';

/** Body of `GET /api/profile`. */
export interface ProfileView {
  uid: UserId;
  email: string;
  displayName: string;
  biography: string;
  role: UserRole;
  emailVerified: boolean;
}

/** Body of `PATCH /api/profile`. */
export interface UpdateProfileInput {
  displayName: string;
  biography: string;
}

/** Wire error code returned by `PATCH /api/profile` on validation failure. */
export const PROFILE_INVALID = 'PROFILE_INVALID';
export type ProfileInvalidCode = typeof PROFILE_INVALID;

/** Body of a 400 from `PATCH /api/profile`. */
export interface ProfileInvalidErrorBody {
  error: {
    code: ProfileInvalidCode;
    message: string;
    details?: { field: 'displayName' | 'biography'; reason: string };
  };
}
```

- [ ] **Step 4: Re-export from the barrel**

```ts
// libs/shared-data-models/src/index.ts — add the line after the existing user/auth exports:
export * from './lib/profile';
```

- [ ] **Step 5: Run the test**

Run: `pnpm nx test shared-data-models -- profile`

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add libs/shared-data-models/src/lib/profile.ts \
        libs/shared-data-models/src/lib/profile.spec.ts \
        libs/shared-data-models/src/index.ts
git commit -m "feat(shared-data-models): add ProfileView, UpdateProfileInput, PROFILE_INVALID"
```

---

## Phase 2: Backend — `libs/api-profile`

### Task 4: Scaffold the `api-profile` lib

**Files:**
- Create: entire `libs/api-profile/` tree via generator + manual cleanup.
- Modify: `tsconfig.base.json`.

- [ ] **Step 1: Generate the lib**

Run: `pnpm nx g @nx/nest:library api-profile --directory=libs/api-profile --buildable=false --testEnvironment=node --strict --linter=eslint --unitTestRunner=vitest`

(If the generator's exact flags differ in this nx version, do `pnpm nx g @nx/nest:library --help` to confirm. Goal: a Vitest-based, ESLint-linted, non-buildable Nest lib at `libs/api-profile`.)

- [ ] **Step 2: Delete the default scaffolding the generator produces**

The generator adds `api-profile.module.ts` and `api-profile.service.ts` (or similar). Delete them; we'll create our own:

```bash
rm -f libs/api-profile/src/lib/api-profile.module.ts \
      libs/api-profile/src/lib/api-profile.service.ts \
      libs/api-profile/src/lib/api-profile.service.spec.ts \
      libs/api-profile/src/lib/api-profile.controller.ts \
      libs/api-profile/src/lib/api-profile.controller.spec.ts
```

- [ ] **Step 3: Confirm `vitest.config.mts` matches the api-courses shape**

Compare `libs/api-profile/vitest.config.mts` to `libs/api-courses/vitest.config.mts`. Make it identical except `name: 'api-profile'` and the cache dir / coverage dir paths.

- [ ] **Step 4: Confirm tsconfig.base.json path alias was added**

Open `tsconfig.base.json` and verify `"@learnwren/api-profile": ["./libs/api-profile/src/index.ts"]` exists. If the generator didn't add it, add it manually.

- [ ] **Step 5: Empty out the barrel**

```ts
// libs/api-profile/src/index.ts
// (intentionally empty for now — will export ProfileModule in Task 9)
export {};
```

- [ ] **Step 6: Verify the lib registers with Nx**

Run: `pnpm nx show project api-profile`

Expected: project metadata prints, sourceRoot `libs/api-profile/src`, tags `["scope:api"]`.

- [ ] **Step 7: Commit**

```bash
git add libs/api-profile tsconfig.base.json
git commit -m "chore(api-profile): scaffold empty Nest lib"
```

### Task 5: Profile error types + codes

**Files:**
- Create: `libs/api-profile/src/lib/errors/profile-error.codes.ts`
- Create: `libs/api-profile/src/lib/errors/profile.exception.ts`
- Create: `libs/api-profile/src/lib/errors/profile.exception.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// libs/api-profile/src/lib/errors/profile.exception.spec.ts
import { describe, expect, it } from 'vitest';
import { ProfileInvalidException } from './profile.exception';

describe('ProfileInvalidException', () => {
  it('carries code, status, and field+reason details', () => {
    const ex = new ProfileInvalidException('displayName', 'must be 1-80 characters');
    expect(ex.code).toBe('PROFILE_INVALID');
    expect(ex.status).toBe(400);
    expect(ex.message).toBe('Profile is invalid.');
    expect(ex.details).toEqual({ field: 'displayName', reason: 'must be 1-80 characters' });
  });
});
```

- [ ] **Step 2: Run it to fail**

Run: `pnpm nx test api-profile`

Expected: FAIL (module not found).

- [ ] **Step 3: Create the codes**

```ts
// libs/api-profile/src/lib/errors/profile-error.codes.ts
export const PROFILE_ERROR_CODES = ['PROFILE_INVALID'] as const;
export type ProfileErrorCode = (typeof PROFILE_ERROR_CODES)[number];
```

- [ ] **Step 4: Create the exception class**

```ts
// libs/api-profile/src/lib/errors/profile.exception.ts
import type { ProfileErrorCode } from './profile-error.codes';

export type ProfileField = 'displayName' | 'biography';

export interface ProfileErrorDetails {
  field: ProfileField;
  reason: string;
}

export class ProfileException extends Error {
  constructor(
    public readonly code: ProfileErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: ProfileErrorDetails,
  ) {
    super(message);
    this.name = 'ProfileException';
  }
}

export class ProfileInvalidException extends ProfileException {
  constructor(field: ProfileField, reason: string) {
    super('PROFILE_INVALID', 'Profile is invalid.', 400, { field, reason });
  }
}
```

- [ ] **Step 5: Run the test**

Run: `pnpm nx test api-profile`

Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add libs/api-profile/src/lib/errors
git commit -m "feat(api-profile): add ProfileException + ProfileInvalidException"
```

### Task 6: `ProfileExceptionFilter`

**Files:**
- Create: `libs/api-profile/src/lib/profile.exception-filter.ts`
- Create: `libs/api-profile/src/lib/profile.exception-filter.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// libs/api-profile/src/lib/profile.exception-filter.spec.ts
import { describe, expect, it, vi } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException, HttpException } from '@nestjs/common';

import { ProfileInvalidException, ProfileException } from './errors/profile.exception';
import { ProfileExceptionFilter } from './profile.exception-filter';

function makeHost(): { host: ArgumentsHost; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('ProfileExceptionFilter', () => {
  it('maps ProfileInvalidException to 400 with code + field + reason', () => {
    const { host, status, json } = makeHost();
    new ProfileExceptionFilter().catch(
      new ProfileInvalidException('displayName', 'must be 1-80 characters'),
      host,
    );
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'PROFILE_INVALID',
        message: 'Profile is invalid.',
        details: { field: 'displayName', reason: 'must be 1-80 characters' },
      },
    });
  });

  it('passes through plain HttpException with a status-derived code', () => {
    const { host, status, json } = makeHost();
    new ProfileExceptionFilter().catch(new BadRequestException('bad'), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'BAD_REQUEST', message: 'bad' },
    });
  });

  it('maps anything else to 500 INTERNAL', () => {
    const { host, status, json } = makeHost();
    new ProfileExceptionFilter().catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    });
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `pnpm nx test api-profile -- exception-filter`

Expected: FAIL (filter not defined).

- [ ] **Step 3: Implement the filter (mirror `CoverExceptionFilter`)**

```ts
// libs/api-profile/src/lib/profile.exception-filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { ProfileException } from './errors/profile.exception';

interface ProfileErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

@Catch(ProfileException, HttpException)
export class ProfileExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProfileExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof ProfileException) {
      response.status(exception.status).json({
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details ? { details: exception.details } : {}),
        },
      } satisfies ProfileErrorBody);
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json({
        error: { code: codeForStatus(status), message: exception.message },
      } satisfies ProfileErrorBody);
      return;
    }
    this.logger.error(
      exception instanceof Error ? exception.stack ?? exception.message : String(exception),
    );
    response.status(500).json({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    } satisfies ProfileErrorBody);
  }
}

function codeForStatus(status: number): string {
  switch (status) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    default: return 'ERROR';
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm nx test api-profile -- exception-filter`

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add libs/api-profile/src/lib/profile.exception-filter.ts \
        libs/api-profile/src/lib/profile.exception-filter.spec.ts
git commit -m "feat(api-profile): add ProfileExceptionFilter"
```

### Task 7: `UpdateProfileDto`

**Files:**
- Create: `libs/api-profile/src/lib/dto/update-profile.dto.ts`

(No standalone spec — the controller spec exercises validation end to end via the global `ValidationPipe`.)

- [ ] **Step 1: Create the DTO**

```ts
// libs/api-profile/src/lib/dto/update-profile.dto.ts
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @MinLength(1, { message: 'displayName must be at least 1 character' })
  @MaxLength(80, { message: 'displayName must be at most 80 characters' })
  displayName!: string;

  @IsString()
  @MaxLength(1000, { message: 'biography must be at most 1000 characters' })
  biography!: string;
}
```

Note: trimming happens in `ProfileService` (server-authoritative) so the DTO does not transform. We rely on `whitelist: true` in the global `ValidationPipe` (`apps/api/src/app/app.module.ts`) to strip unknown fields.

- [ ] **Step 2: Run typecheck**

Run: `pnpm nx run api-profile:typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add libs/api-profile/src/lib/dto
git commit -m "feat(api-profile): add UpdateProfileDto with class-validator constraints"
```

### Task 8: `ProfileService` — validation + Firestore write + MeResponse build

**Files:**
- Create: `libs/api-profile/src/lib/profile.service.ts`
- Create: `libs/api-profile/src/lib/profile.service.spec.ts`

The service owns its own read/write against the `users` Firestore collection (no shared repo — schema agreement is enforced by the `User` interface in `shared-data-models`).

- [ ] **Step 1: Write the failing test**

```ts
// libs/api-profile/src/lib/profile.service.spec.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { UserId } from '@learnwren/shared-data-models';
import type { FirestoreHandle } from '@learnwren/api-firebase';

import { ProfileInvalidException } from './errors/profile.exception';
import { ProfileService } from './profile.service';

interface DocState {
  exists: boolean;
  data: Record<string, unknown>;
}

function makeFirestore(initial: DocState): {
  firestore: FirestoreHandle;
  written: Record<string, unknown> | null;
  state: DocState;
} {
  const state = { ...initial };
  let written: Record<string, unknown> | null = null;
  const doc = {
    get: vi.fn(async () => ({
      exists: state.exists,
      data: () => state.data,
    })),
    update: vi.fn(async (patch: Record<string, unknown>) => {
      state.data = { ...state.data, ...patch };
      written = patch;
    }),
  };
  const firestore = {
    collection: vi.fn(() => ({ doc: vi.fn(() => doc) })),
  } as unknown as FirestoreHandle;
  return { firestore, get written() { return written; }, state } as never;
}

const UID = 'u-1' as UserId;
const FROM_COOKIE = { email: 'a@b.c', emailVerified: true };

describe('ProfileService', () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date('2026-05-27T10:00:00Z')));

  it('getProfile returns the persisted view (biography missing on doc reads as "")', async () => {
    const { firestore } = makeFirestore({
      exists: true,
      data: { displayName: 'A', role: 'STUDENT' /* no biography */ },
    });
    const svc = new ProfileService(firestore);
    const view = await svc.getProfile(UID, FROM_COOKIE);
    expect(view).toEqual({
      uid: UID,
      email: 'a@b.c',
      displayName: 'A',
      biography: '',
      role: 'STUDENT',
      emailVerified: true,
    });
  });

  it('updateProfile writes trimmed values + updatedAt and returns MeResponse', async () => {
    const harness = makeFirestore({
      exists: true,
      data: { displayName: 'Old', biography: '', role: 'STUDENT' },
    });
    const svc = new ProfileService(harness.firestore);
    const me = await svc.updateProfile(UID, { displayName: '  New  ', biography: '  hello  ' }, FROM_COOKIE);
    expect(me).toEqual({
      uid: UID,
      email: 'a@b.c',
      displayName: 'New',
      role: 'STUDENT',
      emailVerified: true,
    });
    expect(harness.written).toEqual({
      displayName: 'New',
      biography: 'hello',
      updatedAt: '2026-05-27T10:00:00.000Z',
    });
  });

  it.each([
    ['', 'displayName', 'must be 1-80 characters'],
    [' '.repeat(0), 'displayName', 'must be 1-80 characters'], // empty after trim
    ['x'.repeat(81), 'displayName', 'must be 1-80 characters'],
  ])('rejects displayName=%j', async (displayName, field, reason) => {
    const { firestore } = makeFirestore({
      exists: true,
      data: { displayName: 'Old', biography: '', role: 'STUDENT' },
    });
    const svc = new ProfileService(firestore);
    await expect(
      svc.updateProfile(UID, { displayName, biography: '' }, FROM_COOKIE),
    ).rejects.toMatchObject({ details: { field, reason } });
  });

  it('rejects biography over 1000 chars', async () => {
    const { firestore } = makeFirestore({
      exists: true,
      data: { displayName: 'Old', biography: '', role: 'STUDENT' },
    });
    const svc = new ProfileService(firestore);
    await expect(
      svc.updateProfile(UID, { displayName: 'A', biography: 'x'.repeat(1001) }, FROM_COOKIE),
    ).rejects.toMatchObject({
      details: { field: 'biography', reason: 'must be at most 1000 characters' },
    });
  });

  it('accepts biography at exactly 1000 chars and displayName at exactly 80 chars', async () => {
    const { firestore } = makeFirestore({
      exists: true,
      data: { displayName: 'Old', biography: '', role: 'STUDENT' },
    });
    const svc = new ProfileService(firestore);
    await expect(
      svc.updateProfile(UID, { displayName: 'x'.repeat(80), biography: 'x'.repeat(1000) }, FROM_COOKIE),
    ).resolves.toBeDefined();
  });

  it('throws when the user doc is missing', async () => {
    const { firestore } = makeFirestore({ exists: false, data: {} });
    const svc = new ProfileService(firestore);
    await expect(svc.getProfile(UID, FROM_COOKIE)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `pnpm nx test api-profile -- profile.service`

Expected: FAIL (service not defined).

- [ ] **Step 3: Implement the service**

```ts
// libs/api-profile/src/lib/profile.service.ts
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type {
  MeResponse,
  ProfileView,
  UpdateProfileInput,
  UserId,
  UserRole,
} from '@learnwren/shared-data-models';

import { ProfileInvalidException } from './errors/profile.exception';

interface UserDoc {
  displayName: string;
  biography?: string;
  role: UserRole;
}

@Injectable()
export class ProfileService {
  private readonly logger = new Logger('ProfileService');

  constructor(@Inject(FIRESTORE) private readonly firestore: FirestoreHandle) {}

  async getProfile(
    uid: UserId,
    fromCookie: { email: string; emailVerified: boolean },
  ): Promise<ProfileView> {
    const data = await this.readUser(uid);
    return {
      uid,
      email: fromCookie.email,
      displayName: data.displayName,
      biography: data.biography ?? '',
      role: data.role,
      emailVerified: fromCookie.emailVerified,
    };
  }

  async updateProfile(
    uid: UserId,
    input: UpdateProfileInput,
    fromCookie: { email: string; emailVerified: boolean },
  ): Promise<MeResponse> {
    const displayName = input.displayName.trim();
    const biography = input.biography.trim();

    if (displayName.length < 1 || displayName.length > 80) {
      throw new ProfileInvalidException('displayName', 'must be 1-80 characters');
    }
    if (biography.length > 1000) {
      throw new ProfileInvalidException('biography', 'must be at most 1000 characters');
    }

    await this.firestore.collection('users').doc(uid).update({
      displayName,
      biography,
      updatedAt: new Date().toISOString(),
    });

    const data = await this.readUser(uid);
    return {
      uid,
      email: fromCookie.email,
      displayName: data.displayName,
      role: data.role,
      emailVerified: fromCookie.emailVerified,
    };
  }

  private async readUser(uid: UserId): Promise<UserDoc> {
    const snap = await this.firestore.collection('users').doc(uid).get();
    if (!snap.exists) {
      this.logger.error(`[profile] missing users/${uid}`);
      throw new NotFoundException('User profile not found.');
    }
    return snap.data() as UserDoc;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm nx test api-profile -- profile.service`

Expected: PASS (all cases including boundary 80/1000).

- [ ] **Step 5: Commit**

```bash
git add libs/api-profile/src/lib/profile.service.ts \
        libs/api-profile/src/lib/profile.service.spec.ts
git commit -m "feat(api-profile): ProfileService with trim, length validation, MeResponse build"
```

### Task 9: `ProfileController` + `ProfileModule`

**Files:**
- Create: `libs/api-profile/src/lib/profile.controller.ts`
- Create: `libs/api-profile/src/lib/profile.controller.spec.ts`
- Create: `libs/api-profile/src/lib/profile.module.ts`
- Modify: `libs/api-profile/src/index.ts` (export `ProfileModule`)

- [ ] **Step 1: Write the failing controller test**

```ts
// libs/api-profile/src/lib/profile.controller.spec.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { UserId } from '@learnwren/shared-data-models';

import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { ProfileInvalidException } from './errors/profile.exception';

const UID = 'u-1' as UserId;

function req(emailVerified = true) {
  return {
    user: { uid: UID, email: 'a@b.c', role: 'STUDENT' as const, emailVerified },
  } as Parameters<ProfileController['get']>[0];
}

describe('ProfileController', () => {
  let svc: { getProfile: ReturnType<typeof vi.fn>; updateProfile: ReturnType<typeof vi.fn> };
  let ctrl: ProfileController;

  beforeEach(() => {
    svc = { getProfile: vi.fn(), updateProfile: vi.fn() };
    ctrl = new ProfileController(svc as unknown as ProfileService);
  });

  it('GET returns the service view', async () => {
    svc.getProfile.mockResolvedValue({ uid: UID, email: 'a@b.c', displayName: 'A', biography: '', role: 'STUDENT', emailVerified: true });
    const out = await ctrl.get(req());
    expect(svc.getProfile).toHaveBeenCalledWith(UID, { email: 'a@b.c', emailVerified: true });
    expect(out.biography).toBe('');
  });

  it('PATCH delegates body + auth and returns MeResponse', async () => {
    svc.updateProfile.mockResolvedValue({ uid: UID, email: 'a@b.c', displayName: 'New', role: 'STUDENT', emailVerified: true });
    const out = await ctrl.update({ displayName: 'New', biography: 'hi' }, req());
    expect(svc.updateProfile).toHaveBeenCalledWith(
      UID,
      { displayName: 'New', biography: 'hi' },
      { email: 'a@b.c', emailVerified: true },
    );
    expect(out.displayName).toBe('New');
  });

  it('PATCH propagates ProfileInvalidException', async () => {
    svc.updateProfile.mockRejectedValue(new ProfileInvalidException('displayName', 'must be 1-80 characters'));
    await expect(ctrl.update({ displayName: '', biography: '' }, req())).rejects.toBeInstanceOf(ProfileInvalidException);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `pnpm nx test api-profile -- profile.controller`

Expected: FAIL.

- [ ] **Step 3: Implement the controller**

```ts
// libs/api-profile/src/lib/profile.controller.ts
import { Body, Controller, Get, Patch, Req, UseFilters, UseGuards } from '@nestjs/common';

import { FirebaseSessionGuard } from '@learnwren/api-auth';
import type { AuthenticatedRequest } from '@learnwren/api-auth';
import type { MeResponse, ProfileView } from '@learnwren/shared-data-models';

import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileExceptionFilter } from './profile.exception-filter';
import { ProfileService } from './profile.service';

@Controller('profile')
@UseFilters(ProfileExceptionFilter)
@UseGuards(FirebaseSessionGuard)
export class ProfileController {
  constructor(private readonly svc: ProfileService) {}

  @Get()
  async get(@Req() req: AuthenticatedRequest): Promise<ProfileView> {
    const user = req.user!;
    return this.svc.getProfile(user.uid, { email: user.email, emailVerified: user.emailVerified });
  }

  @Patch()
  async update(
    @Body() dto: UpdateProfileDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<MeResponse> {
    const user = req.user!;
    return this.svc.updateProfile(
      user.uid,
      { displayName: dto.displayName, biography: dto.biography },
      { email: user.email, emailVerified: user.emailVerified },
    );
  }
}
```

Note: `AuthenticatedRequest` is already exported from `@learnwren/api-auth/src/index.ts:6-8`.

- [ ] **Step 4: Create the module**

```ts
// libs/api-profile/src/lib/profile.module.ts
import { Module } from '@nestjs/common';

import { AuthModule } from '@learnwren/api-auth';

import { ProfileController } from './profile.controller';
import { ProfileExceptionFilter } from './profile.exception-filter';
import { ProfileService } from './profile.service';

@Module({
  imports: [AuthModule],            // pulls in FirebaseSessionGuard
  controllers: [ProfileController],
  providers: [ProfileService, ProfileExceptionFilter],
})
export class ProfileModule {}
```

- [ ] **Step 5: Export from the barrel**

```ts
// libs/api-profile/src/index.ts
export { ProfileModule } from './lib/profile.module';
```

- [ ] **Step 6: Run all api-profile tests**

Run: `pnpm nx test api-profile`

Expected: ALL PASS.

- [ ] **Step 7: Commit**

```bash
git add libs/api-profile
git commit -m "feat(api-profile): ProfileController, ProfileModule, GET/PATCH /api/profile"
```

### Task 10: Wire `ProfileModule` into the API app

**Files:**
- Modify: `apps/api/src/app/app.module.ts`

- [ ] **Step 1: Import and register**

```ts
// apps/api/src/app/app.module.ts — add to imports
import { ProfileModule } from '@learnwren/api-profile';

@Module({
  imports: [
    FirebaseAdminModule.forRoot(),
    ThrottlerModule.forRoot([
      { name: 'burst', ttl: 10_000, limit: 100 },
      { name: 'sustained', ttl: 60_000, limit: 1000 },
    ]),
    AuthModule,
    CoursesModule,
    VideoModule,
    ProfileModule,
  ],
  // ...
})
export class AppModule {}
```

- [ ] **Step 2: Build the API**

Run: `pnpm nx build api`

Expected: PASS, no missing-provider errors.

- [ ] **Step 3: Smoke-test against emulators (manual)**

In one terminal: `pnpm emulators`
In another: `pnpm start` (or just `pnpm nx serve api`)

Then:
```bash
# Should 401 because no cookie:
curl -i http://localhost:3333/api/profile
# Expected: 401 UNAUTHENTICATED
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/app/app.module.ts
git commit -m "feat(api): register ProfileModule"
```

---

## Phase 3: Frontend — `libs/web-profile` + `web-auth` setter

### Task 11: Add public `setCurrentUser` to `web-auth.AuthService`

**Files:**
- Modify: `libs/web-auth/src/lib/auth.service.ts`
- Modify: `libs/web-auth/src/lib/auth.service.spec.ts`
- Modify: `libs/web-auth/src/index.ts` (export `AuthenticatedUser` type so consumers can type-check the argument)

- [ ] **Step 1: Write the failing test**

Add to `auth.service.spec.ts`:

```ts
describe('setCurrentUser', () => {
  it('replaces the current user signal value', () => {
    const svc = TestBed.inject(AuthService);
    const me = { uid: 'u-1' as UserId, email: 'a@b.c', displayName: 'New', role: 'STUDENT' as const, emailVerified: true };
    svc.setCurrentUser(me);
    expect(svc.currentUser()).toEqual(me);
    expect(svc.isAuthenticated()).toBe(true);
  });
});
```

Use the test file's existing imports for `TestBed`, `UserId`, etc. (look at the file's top for the actual import style — match it).

- [ ] **Step 2: Run to fail**

Run: `pnpm nx test web-auth -- auth.service`

Expected: FAIL.

- [ ] **Step 3: Add the public method**

In `libs/web-auth/src/lib/auth.service.ts`, add immediately after `isAuthenticated`:

```ts
  /**
   * Replace the cached current user — e.g. after a profile edit succeeds and
   * the server returns the updated MeResponse. Does not hit the network.
   */
  setCurrentUser(user: AuthenticatedUser): void {
    this.currentUserSignal.set(user);
  }
```

- [ ] **Step 4: Re-export `AuthenticatedUser` type**

```ts
// libs/web-auth/src/index.ts — add
export type { AuthenticatedUser } from './lib/types/authenticated-user';
```

(Check first whether the index already re-exports it. If yes, skip this step.)

- [ ] **Step 5: Run tests**

Run: `pnpm nx test web-auth`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/web-auth
git commit -m "feat(web-auth): add public AuthService.setCurrentUser for snapshot refresh"
```

### Task 12: Scaffold the `web-profile` lib

**Files:**
- Create: entire `libs/web-profile/` tree.
- Modify: `tsconfig.base.json` (add path alias if generator doesn't).

- [ ] **Step 1: Generate the lib**

Run: `pnpm nx g @nx/angular:library web-profile --directory=libs/web-profile --prefix=lib --standalone=true --buildable=false --unitTestRunner=vitest --linter=eslint --skipModule=true`

Match the existing `web-catalog` shape — standalone components, no NgModule. If a flag differs in this nx version, do `pnpm nx g @nx/angular:library --help`.

- [ ] **Step 2: Confirm `vite.config.mts` matches `web-catalog` shape**

Compare to `libs/web-catalog/vite.config.mts`. Update `name`, `cacheDir`, `coverage.reportsDirectory` to `web-profile` paths. Ensure `setupFiles: ['src/test-setup.ts']` is present.

If `src/test-setup.ts` doesn't exist, create it:

```ts
// libs/web-profile/src/test-setup.ts
import '@angular/compiler';
import '@analogjs/vitest-angular/setup-snapshots';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';

setupTestBed();
```

- [ ] **Step 3: Delete any default scaffolding components**

```bash
rm -rf libs/web-profile/src/lib/web-profile
```

(Or whatever the generator dropped — leave `src/lib/` as an empty directory.)

- [ ] **Step 4: Empty out the barrel**

```ts
// libs/web-profile/src/index.ts
export { profileRoutes } from './lib/profile.routes';
```

(Will fail typecheck until Task 14 — that's fine, the next tasks build it up.)

- [ ] **Step 5: Confirm tsconfig.base.json path alias**

Open `tsconfig.base.json`, confirm `"@learnwren/web-profile": ["./libs/web-profile/src/index.ts"]` exists. Add if missing.

- [ ] **Step 6: Verify the lib registers with Nx**

Run: `pnpm nx show project web-profile`

Expected: project metadata prints with sourceRoot `libs/web-profile/src` and `tags: ["scope:web"]`.

- [ ] **Step 7: Commit (scaffold-only)**

Skip the commit until Task 14 — the barrel currently references a missing file. Move on.

### Task 13: `web-profile.ProfileService` (HTTP wrapper)

**Files:**
- Create: `libs/web-profile/src/lib/profile.service.ts`
- Create: `libs/web-profile/src/lib/profile.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// libs/web-profile/src/lib/profile.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import type { UserId } from '@learnwren/shared-data-models';

import { ProfileService } from './profile.service';

describe('ProfileService', () => {
  let svc: ProfileService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(ProfileService);
    http = TestBed.inject(HttpTestingController);
  });

  it('getProfile() issues GET /api/profile and returns the body', async () => {
    const p = svc.getProfile();
    const req = http.expectOne('/api/profile');
    expect(req.request.method).toBe('GET');
    req.flush({ uid: 'u-1', email: 'a@b.c', displayName: 'A', biography: '', role: 'STUDENT', emailVerified: true });
    await expect(p).resolves.toMatchObject({ displayName: 'A', biography: '' });
  });

  it('updateProfile() PATCHes /api/profile with the body and returns MeResponse', async () => {
    const p = svc.updateProfile({ displayName: 'New', biography: 'hi' });
    const req = http.expectOne('/api/profile');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ displayName: 'New', biography: 'hi' });
    req.flush({ uid: 'u-1' as UserId, email: 'a@b.c', displayName: 'New', role: 'STUDENT', emailVerified: true });
    await expect(p).resolves.toMatchObject({ displayName: 'New' });
  });

  it('updateProfile() rejects with HttpErrorResponse on 400', async () => {
    const p = svc.updateProfile({ displayName: '', biography: '' });
    const req = http.expectOne('/api/profile');
    req.flush(
      { error: { code: 'PROFILE_INVALID', message: 'Profile is invalid.', details: { field: 'displayName', reason: 'must be 1-80 characters' } } },
      { status: 400, statusText: 'Bad Request' },
    );
    await expect(p).rejects.toMatchObject({ status: 400 });
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `pnpm nx test web-profile -- profile.service`

Expected: FAIL.

- [ ] **Step 3: Implement the service**

```ts
// libs/web-profile/src/lib/profile.service.ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  MeResponse,
  ProfileView,
  UpdateProfileInput,
} from '@learnwren/shared-data-models';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);

  getProfile(): Promise<ProfileView> {
    return firstValueFrom(this.http.get<ProfileView>('/api/profile'));
  }

  updateProfile(input: UpdateProfileInput): Promise<MeResponse> {
    return firstValueFrom(this.http.patch<MeResponse>('/api/profile', input));
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm nx test web-profile -- profile.service`

Expected: PASS (3 tests).

- [ ] **Step 5: Commit (defer to Task 15 — same logical change as routes wiring)**

Don't commit yet. Continue.

### Task 14: `ProfilePageComponent`

**Files:**
- Create: `libs/web-profile/src/lib/profile-page/profile-page.component.ts`
- Create: `libs/web-profile/src/lib/profile-page/profile-page.component.html`
- Create: `libs/web-profile/src/lib/profile-page/profile-page.component.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// libs/web-profile/src/lib/profile-page/profile-page.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, expect, it, beforeEach } from 'vitest';

import { AuthService } from '@learnwren/web-auth';

import { ProfilePageComponent } from './profile-page.component';

const MOCK_PROFILE = {
  uid: 'u-1',
  email: 'a@b.c',
  displayName: 'Etta',
  biography: 'hi',
  role: 'STUDENT' as const,
  emailVerified: true,
};

describe('ProfilePageComponent', () => {
  let fixture: ComponentFixture<ProfilePageComponent>;
  let http: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProfilePageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(ProfilePageComponent);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  function flushGet() {
    fixture.detectChanges();
    http.expectOne('/api/profile').flush(MOCK_PROFILE);
    fixture.detectChanges();
  }

  it('populates the form from GET /api/profile', () => {
    flushGet();
    const cmp = fixture.componentInstance;
    expect(cmp.form.value).toEqual({ displayName: 'Etta', biography: 'hi' });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('a@b.c');
  });

  it('renders read-only email and role', () => {
    flushGet();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('STUDENT');
  });

  it('saves and updates AuthService on 200', async () => {
    flushGet();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ displayName: 'New', biography: 'bio' });
    const saved = cmp.save();
    const req = http.expectOne('/api/profile');
    expect(req.request.method).toBe('PATCH');
    req.flush({ uid: 'u-1', email: 'a@b.c', displayName: 'New', role: 'STUDENT', emailVerified: true });
    await saved;
    expect(auth.currentUser()?.displayName).toBe('New');
    expect(cmp.status()).toBe('saved');
  });

  it('surfaces PROFILE_INVALID errors against the right control', async () => {
    flushGet();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ displayName: '', biography: '' });
    const saved = cmp.save();
    const req = http.expectOne('/api/profile');
    req.flush(
      { error: { code: 'PROFILE_INVALID', message: 'Profile is invalid.', details: { field: 'displayName', reason: 'must be 1-80 characters' } } },
      { status: 400, statusText: 'Bad Request' },
    );
    await saved;
    expect(cmp.form.controls.displayName.errors).toEqual({ server: 'must be 1-80 characters' });
    expect(cmp.status()).toBe('error');
  });

  it('blocks save when client-side validators fail (over-length biography)', async () => {
    flushGet();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ displayName: 'A', biography: 'x'.repeat(1001) });
    await cmp.save();
    http.expectNone('/api/profile');         // no PATCH made
    expect(cmp.form.controls.biography.invalid).toBe(true);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `pnpm nx test web-profile -- profile-page`

Expected: FAIL.

- [ ] **Step 3: Implement the component**

```ts
// libs/web-profile/src/lib/profile-page/profile-page.component.ts
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { AuthService } from '@learnwren/web-auth';
import type { ProfileView } from '@learnwren/shared-data-models';

import { ProfileService } from '../profile.service';

type Status = 'idle' | 'saving' | 'saved' | 'error';

interface ProfileInvalidBody {
  error: { code: string; message: string; details?: { field: string; reason: string } };
}

@Component({
  selector: 'lib-profile-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './profile-page.component.html',
})
export class ProfilePageComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly profileSvc = inject(ProfileService);
  private readonly authSvc = inject(AuthService);

  readonly form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.maxLength(80)]],
    biography: ['', [Validators.maxLength(1000)]],
  });

  readonly status = signal<Status>('idle');
  readonly readonly = signal<{ email: string; role: ProfileView['role'] } | null>(null);

  async ngOnInit(): Promise<void> {
    const me = await this.profileSvc.getProfile();
    this.form.setValue({ displayName: me.displayName, biography: me.biography });
    this.readonly.set({ email: me.email, role: me.role });
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.status.set('saving');
    try {
      const updated = await this.profileSvc.updateProfile(this.form.getRawValue());
      this.authSvc.setCurrentUser(updated);
      this.status.set('saved');
    } catch (err) {
      this.applyServerError(err);
      this.status.set('error');
    }
  }

  private applyServerError(err: unknown): void {
    if (!(err instanceof HttpErrorResponse) || err.status !== 400) return;
    const body = err.error as ProfileInvalidBody | undefined;
    if (body?.error?.code !== 'PROFILE_INVALID' || !body.error.details) return;
    const { field, reason } = body.error.details;
    if (field === 'displayName' || field === 'biography') {
      this.form.controls[field].setErrors({ server: reason });
    }
  }
}
```

- [ ] **Step 4: Implement the template**

```html
<!-- libs/web-profile/src/lib/profile-page/profile-page.component.html -->
<section class="mx-auto max-w-2xl px-6 py-10">
  <h1 class="text-2xl font-serif mb-6">Profile settings</h1>

  <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4">
    <label class="flex flex-col gap-1">
      <span class="text-sm">Display name</span>
      <input
        type="text"
        formControlName="displayName"
        maxlength="80"
        class="lw-input"
        aria-describedby="displayName-err"
      />
      @if (form.controls.displayName.touched && form.controls.displayName.invalid) {
        <span id="displayName-err" class="text-sm text-danger">
          @if (form.controls.displayName.errors?.['server']) {
            {{ form.controls.displayName.errors?.['server'] }}
          } @else if (form.controls.displayName.errors?.['required']) {
            Display name is required.
          } @else if (form.controls.displayName.errors?.['maxlength']) {
            Display name must be 80 characters or fewer.
          }
        </span>
      }
    </label>

    <label class="flex flex-col gap-1">
      <span class="text-sm">Biography</span>
      <textarea
        formControlName="biography"
        maxlength="1000"
        rows="6"
        class="lw-input"
        aria-describedby="bio-err"
      ></textarea>
      @if (form.controls.biography.touched && form.controls.biography.invalid) {
        <span id="bio-err" class="text-sm text-danger">
          @if (form.controls.biography.errors?.['server']) {
            {{ form.controls.biography.errors?.['server'] }}
          } @else if (form.controls.biography.errors?.['maxlength']) {
            Biography must be 1000 characters or fewer.
          }
        </span>
      }
    </label>

    @if (readonly(); as ro) {
      <dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        <dt class="text-muted">Email</dt><dd>{{ ro.email }}</dd>
        <dt class="text-muted">Role</dt><dd>{{ ro.role }}</dd>
      </dl>
    }

    <div class="flex items-center gap-3 mt-2">
      <button type="submit" class="lw-btn lw-btn-primary" [disabled]="status() === 'saving'">
        Save
      </button>
      @if (status() === 'saved') {
        <span class="text-sm text-success">Profile updated.</span>
      }
    </div>
  </form>
</section>
```

(Reuses the existing utility classes `lw-input`, `lw-btn`, `lw-btn-primary`, `text-muted`, `text-danger`, `text-success` from the design system — see `2026-05-22-design-system-adoption-design.md`. If `lw-input` doesn't exist, fall back to Tailwind primitives like `border rounded px-3 py-2`.)

- [ ] **Step 5: Run tests**

Run: `pnpm nx test web-profile -- profile-page`

Expected: PASS (5 tests).

- [ ] **Step 6: Commit (still hold — routes wiring next)**

Don't commit yet. Continue.

### Task 15: `profileRoutes` + barrel export + commit

**Files:**
- Create: `libs/web-profile/src/lib/profile.routes.ts`

- [ ] **Step 1: Create the routes**

```ts
// libs/web-profile/src/lib/profile.routes.ts
import type { Route } from '@angular/router';

import { authGuard } from '@learnwren/web-auth';

export const profileRoutes: Route[] = [
  {
    path: 'settings/profile',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./profile-page/profile-page.component').then((m) => m.ProfilePageComponent),
  },
];
```

(Confirm `authGuard` is exported by `web-auth`: `grep authGuard libs/web-auth/src/index.ts`. If not, export it before this task.)

- [ ] **Step 2: Run web-profile tests + typecheck**

```bash
pnpm nx test web-profile
pnpm nx run web-profile:typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit the full web-profile lib**

```bash
git add libs/web-profile tsconfig.base.json
git commit -m "feat(web-profile): /settings/profile page with displayName + biography editor"
```

### Task 16: Wire `profileRoutes` into the web app

**Files:**
- Modify: `apps/web/src/app/app.routes.ts`

- [ ] **Step 1: Add the import and spread**

```ts
// apps/web/src/app/app.routes.ts
import { Route } from '@angular/router';

import {
  authGuard,
  ForgotPasswordPageComponent,
  LoginPageComponent,
  RegisterConfirmPageComponent,
  RegisterPageComponent,
  UnlockPageComponent,
} from '@learnwren/web-auth';
import { catalogRoutes } from '@learnwren/web-catalog';
import { coursesRoutes } from '@learnwren/web-courses';
import { learnRoutes } from '@learnwren/web-learn';
import { profileRoutes } from '@learnwren/web-profile';

export const appRoutes: Route[] = [
  { path: 'login', component: LoginPageComponent },
  { path: 'register', component: RegisterPageComponent },
  { path: 'register/confirm', component: RegisterConfirmPageComponent },
  { path: 'forgot-password', component: ForgotPasswordPageComponent },
  { path: 'auth/unlock', component: UnlockPageComponent },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  ...catalogRoutes,
  ...coursesRoutes,
  ...learnRoutes,
  ...profileRoutes,
  { path: '', pathMatch: 'full', redirectTo: '/catalog' },
];
```

- [ ] **Step 2: Build the web app**

Run: `pnpm nx build web`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/app.routes.ts
git commit -m "feat(web): wire profileRoutes into appRoutes"
```

### Task 17: Header link to `/settings/profile`

**Files:**
- Modify: `apps/web/src/app/app.html`
- Modify: `apps/web/src/app/app.spec.ts`

- [ ] **Step 1: Write the failing assertion**

Add to `app.spec.ts` (find the "renders the initials" / "shows authenticated user" block — match its style):

```ts
it('initials chip links to /settings/profile', () => {
  configure({ displayName: 'Etta Wren' });
  fixture.detectChanges();
  const chip = fixture.nativeElement.querySelector('a[role="img"]') as HTMLAnchorElement | null;
  expect(chip).toBeTruthy();
  expect(chip?.getAttribute('href')).toBe('/settings/profile');
});
```

(Adjust the selector if Step 2 uses a different element.)

- [ ] **Step 2: Run to fail**

Run: `pnpm nx test web -- app.spec`

Expected: FAIL.

- [ ] **Step 3: Convert the initials chip into an `<a routerLink>`**

In `apps/web/src/app/app.html`, replace the existing initials span:

```html
<!-- BEFORE -->
<span
  role="img"
  class="grid h-8 w-8 place-items-center rounded-full bg-ochre font-serif text-sm italic text-ochre-ink"
  [attr.aria-label]="'Signed in as ' + (auth.currentUser()?.displayName ?? '')"
  >{{ initials() }}</span
>
```

```html
<!-- AFTER -->
<a
  role="img"
  routerLink="/settings/profile"
  class="grid h-8 w-8 place-items-center rounded-full bg-ochre font-serif text-sm italic text-ochre-ink"
  [attr.aria-label]="'Profile settings for ' + (auth.currentUser()?.displayName ?? '')"
  >{{ initials() }}</a
>
```

(`RouterLink` is already imported in `app.ts` — no module change needed.)

- [ ] **Step 4: Run tests**

Run: `pnpm nx test web`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/app.html apps/web/src/app/app.spec.ts
git commit -m "feat(web): link header initials chip to /settings/profile"
```

---

## Phase 4: End-to-end + cleanup

### Task 18: Playwright golden path

**Files:**
- Create: `apps/web-e2e/src/uc-01-03-text-profile.spec.ts`

- [ ] **Step 1: Inspect an existing register-flow e2e to match the helper style**

Read `apps/web-e2e/src` for an existing test (e.g. registration or login). Reuse its helpers — register-and-login utility, page object selectors, the emulator host base URL.

- [ ] **Step 2: Write the test**

```ts
// apps/web-e2e/src/uc-01-03-text-profile.spec.ts
import { test, expect } from '@playwright/test';

// Use whatever helper the existing e2e tests use to register + log in a fresh user.
// e.g. `import { registerFreshUser } from './helpers/register';`
import { registerFreshUser } from './helpers/register';

test('UC-01-03 — user edits displayName and biography; header updates without reload', async ({ page }) => {
  const { email, displayName } = await registerFreshUser(page);

  // Initials chip is the entry point.
  await page.getByRole('img', { name: new RegExp(`Profile settings for ${displayName}`) }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);

  // Form pre-fills from GET.
  await expect(page.getByLabel('Display name')).toHaveValue(displayName);
  await expect(page.getByLabel('Biography')).toHaveValue('');

  // Edit and save.
  await page.getByLabel('Display name').fill('Etta Updated');
  await page.getByLabel('Biography').fill('I teach botany.');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Profile updated.')).toBeVisible();

  // Header reflects the new display name (initials change from old → new).
  const expectedInitials = 'EU';
  await expect(page.getByRole('img', { name: /Profile settings for Etta Updated/ })).toHaveText(expectedInitials);

  // Persistence across reload.
  await page.reload();
  await expect(page.getByLabel('Display name')).toHaveValue('Etta Updated');
  await expect(page.getByLabel('Biography')).toHaveValue('I teach botany.');
});
```

If `registerFreshUser` helper doesn't exist, look for whichever helper the existing e2e suite uses to spin up an authenticated session, and adapt the import. (Most e2e suites have a `helpers/` or `fixtures/` folder.)

- [ ] **Step 3: Run the e2e**

```bash
pnpm emulators &        # in one terminal — see README "Scripts"
pnpm nx e2e web-e2e --grep "UC-01-03"
```

Expected: PASS.

- [ ] **Step 4: Run the full e2e suite to confirm no regressions**

Run: `pnpm nx e2e web-e2e`

Expected: PASS (all existing tests still green).

- [ ] **Step 5: Commit**

```bash
git add apps/web-e2e/src/uc-01-03-text-profile.spec.ts
git commit -m "test(web-e2e): UC-01-03 text profile golden path"
```

### Task 19: Cross-workspace verification

- [ ] **Step 1: Run lint across the affected projects**

Run: `pnpm nx affected -t lint`

Expected: PASS.

- [ ] **Step 2: Run typecheck across the affected projects**

Run: `pnpm nx affected -t typecheck`

Expected: PASS.

- [ ] **Step 3: Run tests across the affected projects**

Run: `pnpm nx affected -t test`

Expected: PASS.

- [ ] **Step 4: Run the api-e2e suite to confirm the new endpoints don't break auth flows**

Run: `pnpm nx e2e api-e2e`

Expected: PASS (existing tests; no new api-e2e for profile in this slice).

- [ ] **Step 5: Manual smoke (one final sanity check)**

```bash
pnpm emulators            # terminal 1
pnpm start                # terminal 2
# Browse to http://localhost:4200, register, click initials chip, edit, save.
```

Confirm: header initials update, no console errors, reload preserves values.

- [ ] **Step 6: No-op commit if anything was fixed during verification**

If steps 1–5 surfaced any small lint/typecheck issues, fix and commit. Otherwise, skip.

### Task 20: Spec-drift + docs reconciliation

**Files:**
- Modify: `docs/use-cases/01-user-identity-and-access.md` (status banner at the top)
- Modify: `docs/quality/spec-drift-report.md` (UC-01-03 row)
- Modify: `README.md` (Built-So-Far section, if it lists features)
- Modify: `docs/USER_GUIDE.md`

- [ ] **Step 1: Update the EP-01 use-case status banner**

In `docs/use-cases/01-user-identity-and-access.md`, find the `> [!NOTE] STATUS:` block and flip UC-01-03 from "unbuilt" to "Slice A (text profile) IMPLEMENTED on 2026-MM-DD; picture/email/password slices deferred."

- [ ] **Step 2: Update the spec-drift report**

In `docs/quality/spec-drift-report.md`, find the UC-01-03 row and change it from `unbuilt` to `partial` with a one-line note pointing at this spec.

- [ ] **Step 3: README + USER_GUIDE**

Add a single line about profile settings to whichever feature-list lives in `README.md` ("Built so far" section) and `docs/USER_GUIDE.md`.

- [ ] **Step 4: Commit**

```bash
git add docs/use-cases/01-user-identity-and-access.md \
        docs/quality/spec-drift-report.md \
        README.md \
        docs/USER_GUIDE.md
git commit -m "docs: reconcile UC-01-03 Slice A status across drift report + user guide"
```

### Task 21: Finish the branch

- [ ] **Step 1: Invoke the finishing-a-development-branch skill**

Run the `superpowers:finishing-a-development-branch` skill. The user's preference (memory `feedback_branch_isolation.md`) is **local --no-ff merge to `main`**, not a remote PR — confirm with the user before merging.

---

## Self-review notes (resolved inline)

- **Type consistency:** `MeResponse` is the wire type on both sides (`shared-data-models/auth.ts`); `AuthenticatedUser` is the frontend alias. `ProfileView` is the GET shape; `UpdateProfileInput` is the PATCH body shape. `setCurrentUser(user: AuthenticatedUser)` matches what the page passes (the PATCH response is typed as `MeResponse` which equals `AuthenticatedUser`).
- **Spec coverage:** every spec section maps to at least one task — data model (Task 1, 3), API contract (Task 8, 9), backend lib (Tasks 4–10), frontend lib (Tasks 11–16), header link (Task 17), tests (Tasks 5/6/8/9/13/14, plus E2E 18), drift docs (Task 20).
- **No new code paths in api-auth:** confirmed by design — biography is only written by the new `ProfileService`. Register writes `biography: ''` so new accounts have the field; `getMe` and `loadUserProfile` are unchanged.
