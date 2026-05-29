# UC-01-04 — Request Instructor Role (submission only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Student submit an instructor-role application (statement of intent + areas of expertise) from `/settings/profile`; persist it as `PENDING`; resolve it to `APPROVED` when the promote CLI flips the role.

**Architecture:** A new `instructor-application/` submodule in `libs/api-profile` (mirrors the `email/` and `password/` submodules) exposes `GET`/`POST /api/profile/instructor-application`, guarded by `FirebaseSessionGuard`, backed by a new Firestore collection `instructorApplications` keyed on `uid`. A new `instructor-application/` submodule in `libs/web-profile` adds a thin HTTP service plus a standalone `OnPush` child component embedded on the profile page, visible only to Students. The existing `tools/promote-to-instructor.ts` is extended to resolve a pending application.

**Tech Stack:** NestJS 11 (controllers/services/exception filters), Firestore (`FirestoreHandle`), `class-validator` `@Allow()` DTOs, Angular 21 standalone components + signals, Vitest, Playwright (web-e2e). Spec: `docs/superpowers/specs/2026-05-29-uc-01-04-instructor-role-request-design.md`.

---

## File Structure

**Shared models**
- Create `libs/shared-data-models/src/lib/instructor-application.ts` — entity + wire types + error codes.
- Modify `libs/shared-data-models/src/index.ts` — re-export the new file.

**API (`libs/api-profile/src/lib/instructor-application/`)**
- Create `errors/instructor-application-error.codes.ts` — code tuple + union type.
- Create `errors/instructor-application.exception.ts` — base + per-code subclasses.
- Create `instructor-application.exception-filter.ts` — `@Catch` filter delegating to `handleException`.
- Create `dto/submit-instructor-application.dto.ts` — `@Allow()` type-shape DTO.
- Create `instructor-application.service.ts` — `getApplication` + `submit` with guards.
- Create `instructor-application.controller.ts` — GET/POST under `profile/instructor-application`.
- Modify `libs/api-profile/src/lib/profile.module.ts` — register controller, service, filter.

**CLI**
- Modify `tools/promote-to-instructor.ts` — resolve PENDING → APPROVED.

**Web (`libs/web-profile/src/lib/instructor-application/`)**
- Create `instructor-application.service.ts` — HTTP wrapper (get + submit).
- Create `instructor-application.component.ts` + `.html` — standalone OnPush child component.
- Modify `libs/web-profile/src/lib/profile-page/profile-page.component.ts` — import the child.
- Modify `libs/web-profile/src/lib/profile-page/profile-page.component.html` — embed `<lib-instructor-application />`.

**E2E**
- Modify/Create a `web-e2e` spec — happy-path submission.

**Docs (at merge)** — `README.md`, `docs/use-cases/01-user-identity-and-access.md`, `docs/quality/spec-drift-report.md`, a new `docs/superpowers/summaries/` entry.

---

## Conventions (read once before starting)

- **Run a single lib's tests:** `pnpm nx test <project> --skip-nx-cache` (projects: `shared-data-models`, `api-profile`, `web-profile`).
- **Run one Vitest file:** `pnpm nx test api-profile --skip-nx-cache -- <relative-spec-path>` (or use Vitest's `-t "<name>"` to filter by test name).
- **Validation is server-authoritative.** DTOs use only `@Allow()` (no length/format decorators) so the global `ValidationPipe` cannot short-circuit a typed error into a generic `BAD_REQUEST`. All field checks live in the service.
- **Domain exceptions are `{ code, status, details? }`-shaped** and rendered by `handleException()` — never hand-roll status/JSON in the filter.
- **Commit after every green step** using Conventional Commits, scope `(profile)` for app code, `(shared)` for models, `(tools)` for the CLI.

---

## Task 1: Shared data model

**Files:**
- Create: `libs/shared-data-models/src/lib/instructor-application.ts`
- Modify: `libs/shared-data-models/src/index.ts`
- Test: `libs/shared-data-models/src/lib/instructor-application.spec.ts`

- [ ] **Step 1: Write the model file**

Create `libs/shared-data-models/src/lib/instructor-application.ts`:

```ts
import type { ISODateString, UserId } from './common';

export type InstructorApplicationStatus = 'PENDING' | 'APPROVED' | 'DECLINED';

/** Firestore doc in `instructorApplications`, id === uid. */
export interface InstructorApplication {
  uid: UserId;
  statement: string;
  expertise: string;
  status: InstructorApplicationStatus;
  createdAt: ISODateString;
  resolvedAt?: ISODateString;
}

/** Body of `GET /api/profile/instructor-application`. */
export interface InstructorApplicationView {
  status: 'NONE' | InstructorApplicationStatus;
  statement?: string;
  expertise?: string;
  createdAt?: ISODateString;
}

/** Body of `POST /api/profile/instructor-application`. */
export interface SubmitInstructorApplicationRequest {
  statement: string;
  expertise: string;
}

export const INSTRUCTOR_APPLICATION_INVALID = 'INSTRUCTOR_APPLICATION_INVALID';
export const INSTRUCTOR_APPLICATION_EXISTS = 'INSTRUCTOR_APPLICATION_EXISTS';
export const ALREADY_INSTRUCTOR = 'ALREADY_INSTRUCTOR';

export type InstructorApplicationErrorCode =
  | typeof INSTRUCTOR_APPLICATION_INVALID
  | typeof INSTRUCTOR_APPLICATION_EXISTS
  | typeof ALREADY_INSTRUCTOR;

/** Body of a non-2xx from the instructor-application endpoints. */
export interface InstructorApplicationErrorBody {
  error: {
    code: InstructorApplicationErrorCode;
    message: string;
    details?: { field?: 'statement' | 'expertise' };
  };
}
```

- [ ] **Step 2: Re-export from the barrel**

In `libs/shared-data-models/src/index.ts`, add after the `./lib/profile` line:

```ts
export * from './lib/instructor-application';
```

- [ ] **Step 3: Write the shape spec**

Create `libs/shared-data-models/src/lib/instructor-application.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  ALREADY_INSTRUCTOR,
  INSTRUCTOR_APPLICATION_EXISTS,
  INSTRUCTOR_APPLICATION_INVALID,
  type InstructorApplication,
  type InstructorApplicationView,
} from './instructor-application';

describe('instructor-application model', () => {
  it('exposes the three wire error codes as their literal strings', () => {
    expect(INSTRUCTOR_APPLICATION_INVALID).toBe('INSTRUCTOR_APPLICATION_INVALID');
    expect(INSTRUCTOR_APPLICATION_EXISTS).toBe('INSTRUCTOR_APPLICATION_EXISTS');
    expect(ALREADY_INSTRUCTOR).toBe('ALREADY_INSTRUCTOR');
  });

  it('a PENDING application is assignable to the view as a status union', () => {
    const app: InstructorApplication = {
      uid: 'u1' as InstructorApplication['uid'],
      statement: 'I teach',
      expertise: 'Rust',
      status: 'PENDING',
      createdAt: '2026-05-29T10:00:00.000Z' as InstructorApplication['createdAt'],
    };
    const view: InstructorApplicationView = {
      status: app.status,
      statement: app.statement,
      expertise: app.expertise,
      createdAt: app.createdAt,
    };
    expect(view.status).toBe('PENDING');
  });
});
```

- [ ] **Step 4: Run the spec**

Run: `pnpm nx test shared-data-models --skip-nx-cache`
Expected: PASS (new spec green, existing specs still green).

- [ ] **Step 5: Commit**

```bash
git add libs/shared-data-models/src/lib/instructor-application.ts libs/shared-data-models/src/lib/instructor-application.spec.ts libs/shared-data-models/src/index.ts
git commit -m "feat(shared): instructor-application wire types + error codes (UC-01-04)"
```

---

## Task 2: API error codes + exceptions

**Files:**
- Create: `libs/api-profile/src/lib/instructor-application/errors/instructor-application-error.codes.ts`
- Create: `libs/api-profile/src/lib/instructor-application/errors/instructor-application.exception.ts`
- Test: `libs/api-profile/src/lib/instructor-application/errors/instructor-application.exception.spec.ts`

- [ ] **Step 1: Write the codes file**

Create `errors/instructor-application-error.codes.ts`:

```ts
export const INSTRUCTOR_APPLICATION_ERROR_CODES = [
  'INSTRUCTOR_APPLICATION_INVALID',
  'INSTRUCTOR_APPLICATION_EXISTS',
  'ALREADY_INSTRUCTOR',
] as const;

export type InstructorApplicationErrorCode =
  (typeof INSTRUCTOR_APPLICATION_ERROR_CODES)[number];
```

- [ ] **Step 2: Write the failing exception spec**

Create `errors/instructor-application.exception.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  AlreadyInstructorException,
  InstructorApplicationExistsException,
  InstructorApplicationInvalidException,
} from './instructor-application.exception';

describe('instructor-application exceptions', () => {
  it('maps each exception to its code, status, and details', () => {
    expect(new InstructorApplicationInvalidException('statement')).toMatchObject({
      code: 'INSTRUCTOR_APPLICATION_INVALID',
      status: 400,
      details: { field: 'statement' },
    });
    expect(new InstructorApplicationInvalidException('expertise')).toMatchObject({
      code: 'INSTRUCTOR_APPLICATION_INVALID',
      status: 400,
      details: { field: 'expertise' },
    });
    expect(new InstructorApplicationExistsException()).toMatchObject({
      code: 'INSTRUCTOR_APPLICATION_EXISTS',
      status: 409,
    });
    expect(new AlreadyInstructorException()).toMatchObject({
      code: 'ALREADY_INSTRUCTOR',
      status: 409,
    });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm nx test api-profile --skip-nx-cache -- instructor-application.exception.spec.ts`
Expected: FAIL — cannot resolve `./instructor-application.exception`.

- [ ] **Step 4: Write the exceptions**

Create `errors/instructor-application.exception.ts`:

```ts
import type { InstructorApplicationErrorCode } from './instructor-application-error.codes';

export class InstructorApplicationException extends Error {
  constructor(
    public readonly code: InstructorApplicationErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'InstructorApplicationException';
  }
}

export class InstructorApplicationInvalidException extends InstructorApplicationException {
  constructor(field: 'statement' | 'expertise') {
    super('INSTRUCTOR_APPLICATION_INVALID', 'Both fields are required.', 400, { field });
  }
}

export class InstructorApplicationExistsException extends InstructorApplicationException {
  constructor() {
    super(
      'INSTRUCTOR_APPLICATION_EXISTS',
      'You already have an application under review.',
      409,
    );
  }
}

export class AlreadyInstructorException extends InstructorApplicationException {
  constructor() {
    super('ALREADY_INSTRUCTOR', 'You are already an instructor.', 409);
  }
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm nx test api-profile --skip-nx-cache -- instructor-application.exception.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/api-profile/src/lib/instructor-application/errors
git commit -m "feat(profile): instructor-application domain exceptions (UC-01-04)"
```

---

## Task 3: API exception filter

**Files:**
- Create: `libs/api-profile/src/lib/instructor-application/instructor-application.exception-filter.ts`
- Test: `libs/api-profile/src/lib/instructor-application/instructor-application.exception-filter.spec.ts`

- [ ] **Step 1: Write the failing filter spec**

Create `instructor-application.exception-filter.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { InstructorApplicationExceptionFilter } from './instructor-application.exception-filter';
import { InstructorApplicationInvalidException } from './errors/instructor-application.exception';

function host(json: ReturnType<typeof vi.fn>, status: ReturnType<typeof vi.fn>) {
  const res = { status, json, getHeader: vi.fn(), setHeader: vi.fn() };
  status.mockReturnValue(res);
  return {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({ url: '/api/profile/instructor-application', method: 'POST' }),
    }),
  } as never;
}

describe('InstructorApplicationExceptionFilter', () => {
  it('renders a domain exception as { error: { code, message, details } } with its status', () => {
    const json = vi.fn();
    const status = vi.fn();
    const filter = new InstructorApplicationExceptionFilter();
    filter.catch(new InstructorApplicationInvalidException('statement'), host(json, status));
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'INSTRUCTOR_APPLICATION_INVALID',
        message: 'Both fields are required.',
        details: { field: 'statement' },
      },
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx test api-profile --skip-nx-cache -- instructor-application.exception-filter.spec.ts`
Expected: FAIL — cannot resolve the filter module.

- [ ] **Step 3: Write the filter**

Create `instructor-application.exception-filter.ts` (no `AuthException` branch — this feature never re-authenticates):

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { handleException } from '@learnwren/api-http-errors';

import { InstructorApplicationException } from './errors/instructor-application.exception';

@Catch(InstructorApplicationException, HttpException)
export class InstructorApplicationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('InstructorApplicationExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger);
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm nx test api-profile --skip-nx-cache -- instructor-application.exception-filter.spec.ts`
Expected: PASS. (If `handleException`'s response contract differs from the stub, align the spec's `host` mock to the shape used in `email.exception-filter.spec.ts`.)

- [ ] **Step 5: Commit**

```bash
git add libs/api-profile/src/lib/instructor-application/instructor-application.exception-filter.ts libs/api-profile/src/lib/instructor-application/instructor-application.exception-filter.spec.ts
git commit -m "feat(profile): instructor-application exception filter (UC-01-04)"
```

---

## Task 4: API DTO

**Files:**
- Create: `libs/api-profile/src/lib/instructor-application/dto/submit-instructor-application.dto.ts`

- [ ] **Step 1: Write the DTO**

Create `dto/submit-instructor-application.dto.ts`:

```ts
import { Allow } from 'class-validator';

/**
 * Type-shape only — @Allow() whitelists both fields for the global ValidationPipe
 * (whitelist + forbidNonWhitelisted) without adding length/format validators.
 * Non-empty + max-length validation lives in InstructorApplicationService so it
 * emits the typed INSTRUCTOR_APPLICATION_INVALID code, not a generic BAD_REQUEST.
 */
export class SubmitInstructorApplicationDto {
  @Allow()
  statement!: string;

  @Allow()
  expertise!: string;
}
```

- [ ] **Step 2: Commit** (no standalone test — exercised via the service/controller specs)

```bash
git add libs/api-profile/src/lib/instructor-application/dto/submit-instructor-application.dto.ts
git commit -m "feat(profile): instructor-application submit DTO (UC-01-04)"
```

---

## Task 5: API service

**Files:**
- Create: `libs/api-profile/src/lib/instructor-application/instructor-application.service.ts`
- Test: `libs/api-profile/src/lib/instructor-application/instructor-application.service.spec.ts`

- [ ] **Step 1: Write the failing service spec**

Create `instructor-application.service.spec.ts`. The Firestore mock mirrors `profile.service.spec.ts` but supports `set` and per-doc state:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FirestoreHandle } from '@learnwren/api-firebase';
import type { UserId, UserRole } from '@learnwren/shared-data-models';

import { InstructorApplicationService } from './instructor-application.service';
import {
  AlreadyInstructorException,
  InstructorApplicationExistsException,
  InstructorApplicationInvalidException,
} from './errors/instructor-application.exception';

interface DocState {
  exists: boolean;
  data: Record<string, unknown>;
}

function makeFirestore(initial: DocState) {
  const state: DocState = { exists: initial.exists, data: { ...initial.data } };
  const setFn = vi.fn(async (value: Record<string, unknown>) => {
    state.exists = true;
    state.data = { ...value };
  });
  const doc = {
    get: vi.fn(async () => ({ exists: state.exists, data: () => state.data })),
    set: setFn,
  };
  const collection = vi.fn(() => ({ doc: vi.fn(() => doc) }));
  const firestore = { collection } as unknown as FirestoreHandle;
  return { firestore, collection, setFn, state };
}

const UID = 'u-1' as UserId;
const STUDENT: UserRole = 'STUDENT';

describe('InstructorApplicationService', () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date('2026-05-29T10:00:00.000Z')));

  it('getApplication returns { status: NONE } when no doc exists', async () => {
    const { firestore } = makeFirestore({ exists: false, data: {} });
    const svc = new InstructorApplicationService(firestore);
    expect(await svc.getApplication(UID)).toEqual({ status: 'NONE' });
  });

  it('getApplication returns the stored PENDING view', async () => {
    const { firestore } = makeFirestore({
      exists: true,
      data: {
        uid: UID, statement: 'I teach', expertise: 'Rust',
        status: 'PENDING', createdAt: '2026-05-28T00:00:00.000Z',
      },
    });
    const svc = new InstructorApplicationService(firestore);
    expect(await svc.getApplication(UID)).toEqual({
      status: 'PENDING',
      statement: 'I teach',
      expertise: 'Rust',
      createdAt: '2026-05-28T00:00:00.000Z',
    });
  });

  it('submit rejects an INSTRUCTOR role with ALREADY_INSTRUCTOR (before touching Firestore)', async () => {
    const { firestore, collection } = makeFirestore({ exists: false, data: {} });
    const svc = new InstructorApplicationService(firestore);
    await expect(
      svc.submit(UID, 'INSTRUCTOR', { statement: 'x', expertise: 'y' }),
    ).rejects.toBeInstanceOf(AlreadyInstructorException);
    expect(collection).not.toHaveBeenCalled();
  });

  it('submit rejects an ADMIN role with ALREADY_INSTRUCTOR', async () => {
    const { firestore } = makeFirestore({ exists: false, data: {} });
    const svc = new InstructorApplicationService(firestore);
    await expect(
      svc.submit(UID, 'ADMIN', { statement: 'x', expertise: 'y' }),
    ).rejects.toBeInstanceOf(AlreadyInstructorException);
  });

  it('submit rejects a blank statement with field=statement', async () => {
    const { firestore } = makeFirestore({ exists: false, data: {} });
    const svc = new InstructorApplicationService(firestore);
    await expect(
      svc.submit(UID, STUDENT, { statement: '   ', expertise: 'Rust' }),
    ).rejects.toMatchObject({ code: 'INSTRUCTOR_APPLICATION_INVALID', details: { field: 'statement' } });
  });

  it('submit rejects a blank expertise with field=expertise', async () => {
    const { firestore } = makeFirestore({ exists: false, data: {} });
    const svc = new InstructorApplicationService(firestore);
    await expect(
      svc.submit(UID, STUDENT, { statement: 'I teach', expertise: '' }),
    ).rejects.toMatchObject({ code: 'INSTRUCTOR_APPLICATION_INVALID', details: { field: 'expertise' } });
  });

  it('submit rejects an over-long statement (>2000 chars)', async () => {
    const { firestore } = makeFirestore({ exists: false, data: {} });
    const svc = new InstructorApplicationService(firestore);
    await expect(
      svc.submit(UID, STUDENT, { statement: 'a'.repeat(2001), expertise: 'Rust' }),
    ).rejects.toBeInstanceOf(InstructorApplicationInvalidException);
  });

  it('submit rejects when a PENDING application already exists', async () => {
    const { firestore } = makeFirestore({
      exists: true,
      data: { uid: UID, statement: 'x', expertise: 'y', status: 'PENDING', createdAt: 'z' },
    });
    const svc = new InstructorApplicationService(firestore);
    await expect(
      svc.submit(UID, STUDENT, { statement: 'again', expertise: 'again' }),
    ).rejects.toBeInstanceOf(InstructorApplicationExistsException);
  });

  it('submit writes a trimmed PENDING doc and returns the view (overwrites a DECLINED doc)', async () => {
    const { firestore, setFn } = makeFirestore({
      exists: true,
      data: { uid: UID, statement: 'old', expertise: 'old', status: 'DECLINED', createdAt: 'old' },
    });
    const svc = new InstructorApplicationService(firestore);
    const view = await svc.submit(UID, STUDENT, {
      statement: '  I teach Rust  ',
      expertise: '  Systems  ',
    });
    expect(setFn).toHaveBeenCalledWith({
      uid: UID,
      statement: 'I teach Rust',
      expertise: 'Systems',
      status: 'PENDING',
      createdAt: '2026-05-29T10:00:00.000Z',
    });
    expect(view).toEqual({
      status: 'PENDING',
      statement: 'I teach Rust',
      expertise: 'Systems',
      createdAt: '2026-05-29T10:00:00.000Z',
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx test api-profile --skip-nx-cache -- instructor-application.service.spec.ts`
Expected: FAIL — cannot resolve the service module.

- [ ] **Step 3: Write the service**

Create `instructor-application.service.ts`:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type {
  InstructorApplication,
  InstructorApplicationView,
  SubmitInstructorApplicationRequest,
  UserId,
  UserRole,
} from '@learnwren/shared-data-models';

import {
  AlreadyInstructorException,
  InstructorApplicationExistsException,
  InstructorApplicationInvalidException,
} from './errors/instructor-application.exception';

const COLLECTION = 'instructorApplications';
const MAX_FIELD_LENGTH = 2000;

@Injectable()
export class InstructorApplicationService {
  private readonly logger = new Logger('InstructorApplicationService');

  constructor(@Inject(FIRESTORE) private readonly firestore: FirestoreHandle) {}

  async getApplication(uid: UserId): Promise<InstructorApplicationView> {
    const snap = await this.firestore.collection(COLLECTION).doc(uid).get();
    if (!snap.exists) {
      return { status: 'NONE' };
    }
    const data = snap.data() as InstructorApplication;
    return {
      status: data.status,
      statement: data.statement,
      expertise: data.expertise,
      createdAt: data.createdAt,
    };
  }

  async submit(
    uid: UserId,
    role: UserRole,
    input: SubmitInstructorApplicationRequest,
  ): Promise<InstructorApplicationView> {
    if (role === 'INSTRUCTOR' || role === 'ADMIN') {
      throw new AlreadyInstructorException();
    }

    const statement = input.statement.trim();
    const expertise = input.expertise.trim();
    if (statement.length < 1 || statement.length > MAX_FIELD_LENGTH) {
      throw new InstructorApplicationInvalidException('statement');
    }
    if (expertise.length < 1 || expertise.length > MAX_FIELD_LENGTH) {
      throw new InstructorApplicationInvalidException('expertise');
    }

    const ref = this.firestore.collection(COLLECTION).doc(uid);
    const existing = await ref.get();
    if (existing.exists && (existing.data() as InstructorApplication).status === 'PENDING') {
      throw new InstructorApplicationExistsException();
    }

    const createdAt = new Date().toISOString() as InstructorApplication['createdAt'];
    const doc: InstructorApplication = {
      uid,
      statement,
      expertise,
      status: 'PENDING',
      createdAt,
    };
    await ref.set(doc);
    this.logger.log(`[profile] instructor application submitted uid=${uid}`);

    return { status: 'PENDING', statement, expertise, createdAt };
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm nx test api-profile --skip-nx-cache -- instructor-application.service.spec.ts`
Expected: PASS (all 9 cases green).

- [ ] **Step 5: Commit**

```bash
git add libs/api-profile/src/lib/instructor-application/instructor-application.service.ts libs/api-profile/src/lib/instructor-application/instructor-application.service.spec.ts
git commit -m "feat(profile): instructor-application service with role/field/exists guards (UC-01-04)"
```

---

## Task 6: API controller

**Files:**
- Create: `libs/api-profile/src/lib/instructor-application/instructor-application.controller.ts`
- Test: `libs/api-profile/src/lib/instructor-application/instructor-application.controller.spec.ts`

- [ ] **Step 1: Write the failing controller spec**

Create `instructor-application.controller.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import type { UserId } from '@learnwren/shared-data-models';
import type { AuthenticatedRequest } from '@learnwren/api-auth';

import { InstructorApplicationController } from './instructor-application.controller';

const req = (role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN') =>
  ({ user: { uid: 'u1' as UserId, email: 'a@b.c', role, emailVerified: true } } as AuthenticatedRequest);

describe('InstructorApplicationController', () => {
  it('delegates GET to svc.getApplication(uid)', async () => {
    const svc = {
      getApplication: vi.fn().mockResolvedValue({ status: 'NONE' }),
      submit: vi.fn(),
    };
    const ctrl = new InstructorApplicationController(svc as never);
    const out = await ctrl.get(req('STUDENT'));
    expect(svc.getApplication).toHaveBeenCalledWith('u1');
    expect(out).toEqual({ status: 'NONE' });
  });

  it('delegates POST to svc.submit(uid, role, body)', async () => {
    const view = { status: 'PENDING', statement: 's', expertise: 'e', createdAt: 't' };
    const svc = { getApplication: vi.fn(), submit: vi.fn().mockResolvedValue(view) };
    const ctrl = new InstructorApplicationController(svc as never);
    const out = await ctrl.submit({ statement: 's', expertise: 'e' }, req('STUDENT'));
    expect(svc.submit).toHaveBeenCalledWith('u1', 'STUDENT', { statement: 's', expertise: 'e' });
    expect(out).toEqual(view);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx test api-profile --skip-nx-cache -- instructor-application.controller.spec.ts`
Expected: FAIL — cannot resolve the controller module.

- [ ] **Step 3: Write the controller**

Create `instructor-application.controller.ts`:

```ts
import { Body, Controller, Get, Post, Req, UseFilters, UseGuards } from '@nestjs/common';

import { FirebaseSessionGuard } from '@learnwren/api-auth';
import type { AuthenticatedRequest } from '@learnwren/api-auth';
import type { InstructorApplicationView } from '@learnwren/shared-data-models';

import { SubmitInstructorApplicationDto } from './dto/submit-instructor-application.dto';
import { InstructorApplicationExceptionFilter } from './instructor-application.exception-filter';
import { InstructorApplicationService } from './instructor-application.service';

@Controller('profile/instructor-application')
@UseFilters(InstructorApplicationExceptionFilter)
@UseGuards(FirebaseSessionGuard)
export class InstructorApplicationController {
  constructor(private readonly svc: InstructorApplicationService) {}

  @Get()
  async get(@Req() req: AuthenticatedRequest): Promise<InstructorApplicationView> {
    return this.svc.getApplication(req.user!.uid);
  }

  @Post()
  async submit(
    @Body() dto: SubmitInstructorApplicationDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<InstructorApplicationView> {
    const user = req.user!;
    return this.svc.submit(user.uid, user.role, {
      statement: dto.statement,
      expertise: dto.expertise,
    });
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm nx test api-profile --skip-nx-cache -- instructor-application.controller.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-profile/src/lib/instructor-application/instructor-application.controller.ts libs/api-profile/src/lib/instructor-application/instructor-application.controller.spec.ts
git commit -m "feat(profile): instructor-application controller GET/POST (UC-01-04)"
```

---

## Task 7: Wire into ProfileModule

**Files:**
- Modify: `libs/api-profile/src/lib/profile.module.ts`

- [ ] **Step 1: Add the imports**

In `libs/api-profile/src/lib/profile.module.ts`, add alongside the other submodule imports:

```ts
import { InstructorApplicationController } from './instructor-application/instructor-application.controller';
import { InstructorApplicationExceptionFilter } from './instructor-application/instructor-application.exception-filter';
import { InstructorApplicationService } from './instructor-application/instructor-application.service';
```

- [ ] **Step 2: Register controller, service, filter**

Add `InstructorApplicationController` to the `controllers` array, and add both `InstructorApplicationService` and `InstructorApplicationExceptionFilter` to the `providers` array. After editing, the relevant arrays read:

```ts
  controllers: [
    ProfileController,
    ProfilePictureController,
    EmailChangeController,
    PasswordChangeController,
    InstructorApplicationController,
  ],
  providers: [
    ProfileService,
    ProfileExceptionFilter,
    ProfilePictureService,
    PictureExceptionFilter,
    EmailChangeService,
    EmailChangeExceptionFilter,
    PasswordChangeService,
    PasswordChangeExceptionFilter,
    InstructorApplicationService,
    InstructorApplicationExceptionFilter,
    FirebasePictureStorageAdapter,
    { provide: PICTURE_CONFIG, useFactory: () => readPictureConfigFromEnv(process.env) },
    {
      provide: PICTURE_STORAGE,
      inject: [PICTURE_CONFIG, FirebasePictureStorageAdapter],
      useFactory: (cfg: PictureConfig, firebase: FirebasePictureStorageAdapter) =>
        cfg.impl === 'firebase' ? firebase : new FakePictureStorageAdapter(),
    },
  ],
```

- [ ] **Step 3: Run the whole api-profile suite + typecheck**

Run: `pnpm nx test api-profile --skip-nx-cache`
Expected: PASS (all submodule specs green; module compiles with the new providers).

- [ ] **Step 4: Commit**

```bash
git add libs/api-profile/src/lib/profile.module.ts
git commit -m "feat(profile): register instructor-application in ProfileModule (UC-01-04)"
```

---

## Task 8: Extend the promote CLI to resolve the application

**Files:**
- Modify: `tools/promote-to-instructor.ts`

> **Note on testing:** `tools/` is not an Nx project and has no Vitest harness (neither `promote-to-instructor` nor `migrate-auth` is unit-tested). Following that established convention, this change is **verified manually against the emulators** in Step 3 rather than by a new unit test. Keep the change small and best-effort.

- [ ] **Step 1: Add the resolution block**

In `tools/promote-to-instructor.ts`, inside `promoteToInstructor`, after the existing `users/{uid}.role` update and before the `console.log` lines, add a best-effort resolution of a pending application:

```ts
  // UC-01-04: if the user has a pending instructor application, mark it resolved.
  const appRef = firestore.collection('instructorApplications').doc(user.uid);
  const appSnap = await appRef.get();
  if (appSnap.exists && appSnap.data()?.status === 'PENDING') {
    await appRef.update({ status: 'APPROVED', resolvedAt: new Date().toISOString() });
    console.log(`[promote] Resolved pending instructor application for ${email} -> APPROVED.`);
  }
```

The `FirestoreLike` type already only requires `collection`, which is sufficient (`collection(...).doc(...).get()/.update()`).

- [ ] **Step 2: Confirm the tool type-checks**

Run: `pnpm exec tsx tools/promote-to-instructor.ts` with no argument.
Expected: it prints the usage line (`Usage: pnpm tools:promote-to-instructor <email>`) and exits — confirming the file parses and type-checks under `tsx` without runtime/compile errors. (`tsx` transpiles on load, so a type/syntax error surfaces here.)

- [ ] **Step 3: Manual verification against emulators**

In one terminal: `pnpm emulators`. Then:
1. Register + verify a user (or use an existing emulator student).
2. Submit an application through the UI (after Tasks 9–11) **or** seed a doc manually via the Firestore emulator UI: `instructorApplications/<uid> = { uid, statement, expertise, status: 'PENDING', createdAt }`.
3. Run `pnpm tools:promote-to-instructor <email>`.
4. Confirm in the emulator UI that `instructorApplications/<uid>.status === 'APPROVED'` and `resolvedAt` is set, and `users/<uid>.role === 'INSTRUCTOR'`.
5. Run again on a user with **no** application — confirm it still succeeds (no error, no extra log line).

- [ ] **Step 4: Commit**

```bash
git add tools/promote-to-instructor.ts
git commit -m "feat(tools): promote-to-instructor resolves pending application to APPROVED (UC-01-04)"
```

---

## Task 9: Web HTTP service

**Files:**
- Create: `libs/web-profile/src/lib/instructor-application/instructor-application.service.ts`
- Test: `libs/web-profile/src/lib/instructor-application/instructor-application.service.spec.ts`

- [ ] **Step 1: Write the failing service spec**

Create `instructor-application.service.spec.ts`:

```ts
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { InstructorApplicationService } from './instructor-application.service';

describe('InstructorApplicationService', () => {
  let svc: InstructorApplicationService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [InstructorApplicationService, provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(InstructorApplicationService);
    http = TestBed.inject(HttpTestingController);
  });

  it('getApplication GETs /api/profile/instructor-application', async () => {
    const p = svc.getApplication();
    const r = http.expectOne('/api/profile/instructor-application');
    expect(r.request.method).toBe('GET');
    r.flush({ status: 'NONE' });
    expect(await p).toEqual({ status: 'NONE' });
  });

  it('submit POSTs the statement + expertise', async () => {
    const p = svc.submit({ statement: 's', expertise: 'e' });
    const r = http.expectOne('/api/profile/instructor-application');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ statement: 's', expertise: 'e' });
    r.flush({ status: 'PENDING', statement: 's', expertise: 'e', createdAt: 't' });
    expect((await p).status).toBe('PENDING');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx test web-profile --skip-nx-cache -- instructor-application.service.spec.ts`
Expected: FAIL — cannot resolve the service module.

- [ ] **Step 3: Write the service**

Create `instructor-application.service.ts`:

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  InstructorApplicationView,
  SubmitInstructorApplicationRequest,
} from '@learnwren/shared-data-models';

@Injectable({ providedIn: 'root' })
export class InstructorApplicationService {
  private readonly http = inject(HttpClient);
  private readonly url = '/api/profile/instructor-application';

  getApplication(): Promise<InstructorApplicationView> {
    return firstValueFrom(this.http.get<InstructorApplicationView>(this.url));
  }

  submit(input: SubmitInstructorApplicationRequest): Promise<InstructorApplicationView> {
    return firstValueFrom(this.http.post<InstructorApplicationView>(this.url, input));
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm nx test web-profile --skip-nx-cache -- instructor-application.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-profile/src/lib/instructor-application/instructor-application.service.ts libs/web-profile/src/lib/instructor-application/instructor-application.service.spec.ts
git commit -m "feat(web-profile): instructor-application HTTP service (UC-01-04)"
```

---

## Task 10: Web component

**Files:**
- Create: `libs/web-profile/src/lib/instructor-application/instructor-application.component.ts`
- Create: `libs/web-profile/src/lib/instructor-application/instructor-application.component.html`
- Test: `libs/web-profile/src/lib/instructor-application/instructor-application.component.spec.ts`

The component is visible only to Students (reads role from `AuthService.currentUser`, like the picture uploader). On init it fetches status; `PENDING` → status card; otherwise a toggle that opens the form.

- [ ] **Step 1: Write the failing component spec**

Create `instructor-application.component.spec.ts`:

```ts
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';

import { AuthService } from '@learnwren/web-auth';
import type { AuthenticatedUser } from '@learnwren/web-auth';

import { InstructorApplicationService } from './instructor-application.service';
import { InstructorApplicationComponent } from './instructor-application.component';

function user(role: AuthenticatedUser['role']): AuthenticatedUser {
  return {
    uid: 'u1' as AuthenticatedUser['uid'], email: 'a@b.c', displayName: 'Ada',
    role, emailVerified: true, photoUrl: undefined,
  } as AuthenticatedUser;
}

describe('InstructorApplicationComponent', () => {
  let svc: { getApplication: ReturnType<typeof vi.fn>; submit: ReturnType<typeof vi.fn> };
  let auth: { currentUser: ReturnType<typeof signal<AuthenticatedUser | null>> };

  function create(role: AuthenticatedUser['role']) {
    auth = { currentUser: signal<AuthenticatedUser | null>(user(role)) };
    TestBed.configureTestingModule({
      imports: [InstructorApplicationComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: InstructorApplicationService, useValue: svc },
        { provide: AuthService, useValue: auth },
      ],
    });
    const fixture = TestBed.createComponent(InstructorApplicationComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    svc = {
      getApplication: vi.fn().mockResolvedValue({ status: 'NONE' }),
      submit: vi.fn(),
    };
  });

  it('is not visible to an INSTRUCTOR (and never fetches status)', async () => {
    const fixture = create('INSTRUCTOR');
    await fixture.whenStable();
    expect(svc.getApplication).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).not.toContain('Become an Instructor');
  });

  it('shows the under-review card when an application is PENDING', async () => {
    svc.getApplication.mockResolvedValue({ status: 'PENDING', statement: 's', expertise: 'e', createdAt: 't' });
    const fixture = create('STUDENT');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('under review');
  });

  it('submits the form and swaps to the under-review card', async () => {
    svc.submit.mockResolvedValue({ status: 'PENDING', statement: 's', expertise: 'e', createdAt: 't' });
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    cmp.open();
    cmp.form.setValue({ statement: 'I teach', expertise: 'Rust' });
    await cmp.submit();
    expect(svc.submit).toHaveBeenCalledWith({ statement: 'I teach', expertise: 'Rust' });
    expect(cmp.application()?.status).toBe('PENDING');
  });

  it('maps an INSTRUCTOR_APPLICATION_INVALID field error onto the control', async () => {
    svc.submit.mockRejectedValue(
      new HttpErrorResponse({
        status: 400,
        error: { error: { code: 'INSTRUCTOR_APPLICATION_INVALID', message: 'x', details: { field: 'statement' } } },
      }),
    );
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    cmp.open();
    cmp.form.setValue({ statement: 'I teach', expertise: 'Rust' });
    await cmp.submit();
    expect(cmp.form.controls.statement.errors?.['server']).toBeTruthy();
  });

  it('shows a banner and re-fetches on INSTRUCTOR_APPLICATION_EXISTS', async () => {
    svc.submit.mockRejectedValue(
      new HttpErrorResponse({
        status: 409,
        error: { error: { code: 'INSTRUCTOR_APPLICATION_EXISTS', message: 'already' } },
      }),
    );
    const fixture = create('STUDENT');
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    cmp.open();
    cmp.form.setValue({ statement: 'I teach', expertise: 'Rust' });
    svc.getApplication.mockResolvedValue({ status: 'PENDING', statement: 's', expertise: 'e', createdAt: 't' });
    await cmp.submit();
    expect(cmp.bannerError()).toBeTruthy();
    expect(svc.getApplication).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx test web-profile --skip-nx-cache -- instructor-application.component.spec.ts`
Expected: FAIL — cannot resolve the component module.

- [ ] **Step 3: Write the component**

Create `instructor-application.component.ts`:

```ts
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { AuthService } from '@learnwren/web-auth';
import { LwButtonDirective, LwInputDirective } from '@learnwren/web-ui';
import type {
  InstructorApplicationErrorBody,
  InstructorApplicationView,
} from '@learnwren/shared-data-models';

import { InstructorApplicationService } from './instructor-application.service';

type Status = 'idle' | 'submitting';

@Component({
  selector: 'lib-instructor-application',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, LwInputDirective, LwButtonDirective],
  templateUrl: './instructor-application.component.html',
})
export class InstructorApplicationComponent {
  private readonly fb = inject(FormBuilder);
  private readonly svc = inject(InstructorApplicationService);
  private readonly auth = inject(AuthService);

  /** Visible only to Students (ext 2a: instructors/admins never see the option). */
  readonly visible = computed(() => this.auth.currentUser()?.role === 'STUDENT');

  readonly application = signal<InstructorApplicationView | null>(null);
  readonly status = signal<Status>('idle');
  readonly formOpen = signal(false);
  readonly bannerError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    // client `required` for fast feedback; server is authoritative
    statement: ['', [Validators.required]],
    expertise: ['', [Validators.required]],
  });

  constructor() {
    if (this.visible()) {
      void this.load();
    }
  }

  private async load(): Promise<void> {
    this.application.set(await this.svc.getApplication());
  }

  /** True once a PENDING application exists — show the status card instead of the form. */
  readonly pending = computed(() => this.application()?.status === 'PENDING');

  open(): void {
    this.formOpen.set(true);
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.status.set('submitting');
    this.bannerError.set(null);
    try {
      const view = await this.svc.submit(this.form.getRawValue());
      this.application.set(view);
      this.formOpen.set(false);
      this.form.reset();
    } catch (err) {
      await this.applyServerError(err);
    } finally {
      this.status.set('idle');
    }
  }

  private async applyServerError(err: unknown): Promise<void> {
    if (!(err instanceof HttpErrorResponse)) {
      this.bannerError.set('Something went wrong. Please try again.');
      return;
    }
    const body = err.error as InstructorApplicationErrorBody | undefined;
    const code = body?.error?.code;
    const message = body?.error?.message ?? 'Could not submit your application.';
    if (code === 'INSTRUCTOR_APPLICATION_INVALID') {
      const field = body?.error?.details?.field;
      if (field === 'statement' || field === 'expertise') {
        this.form.controls[field].setErrors({ server: message });
        return;
      }
    }
    // EXISTS or ALREADY_INSTRUCTOR (e.g. a concurrent submission): banner + refresh state.
    this.bannerError.set(message);
    await this.load();
  }
}
```

- [ ] **Step 4: Write the template**

Create `instructor-application.component.html` (matches the profile page's section styling):

```html
@if (visible()) {
  <section class="mt-8 flex flex-col gap-3 border-t border-line pt-6" data-testid="instructor-application">
    <h2 class="text-lg font-serif">Become an instructor</h2>

    @if (pending()) {
      <p class="text-sm text-good" data-testid="application-pending">
        Your application has been submitted and is under review.
      </p>
    } @else {
      @if (bannerError(); as banner) {
        <p class="text-sm text-bad" data-testid="application-error">{{ banner }}</p>
      }

      @if (!formOpen()) {
        <p class="text-sm text-ink-2">
          Apply to create and publish your own courses.
        </p>
        <button lwButton type="button" class="self-start" (click)="open()">
          Become an Instructor
        </button>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()"
              class="flex flex-col gap-3 border border-line rounded p-4">
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-2">Statement of intent</span>
            <textarea lwInput rows="3" formControlName="statement"></textarea>
            @if (form.controls.statement.touched && form.controls.statement.invalid) {
              <span class="text-sm text-bad">A statement of intent is required.</span>
            }
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-2">Areas of expertise</span>
            <textarea lwInput rows="2" formControlName="expertise"></textarea>
            @if (form.controls.expertise.touched && form.controls.expertise.invalid) {
              <span class="text-sm text-bad">Areas of expertise are required.</span>
            }
          </label>

          <div class="flex items-center gap-3">
            <button lwButton type="submit" [disabled]="status() === 'submitting'">
              Submit application
            </button>
          </div>
        </form>
      }
    }
  </section>
}
```

> If `lwInput` is not valid on `<textarea>` in this codebase, fall back to `<input lwInput>` for both fields — check `libs/web-ui` for the directive's selector before writing. The profile page uses `<input lwInput>`; verify whether a textarea variant exists.

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm nx test web-profile --skip-nx-cache -- instructor-application.component.spec.ts`
Expected: PASS (all five cases).

- [ ] **Step 6: Commit**

```bash
git add libs/web-profile/src/lib/instructor-application/instructor-application.component.ts libs/web-profile/src/lib/instructor-application/instructor-application.component.html libs/web-profile/src/lib/instructor-application/instructor-application.component.spec.ts
git commit -m "feat(web-profile): instructor-application component (student-only) (UC-01-04)"
```

---

## Task 11: Embed the component on the profile page

**Files:**
- Modify: `libs/web-profile/src/lib/profile-page/profile-page.component.ts`
- Modify: `libs/web-profile/src/lib/profile-page/profile-page.component.html`

- [ ] **Step 1: Import the child component**

In `profile-page.component.ts`, add the import:

```ts
import { InstructorApplicationComponent } from '../instructor-application/instructor-application.component';
```

and add `InstructorApplicationComponent` to the component's `imports` array (next to `ProfilePictureUploaderComponent`).

- [ ] **Step 2: Embed it at the bottom of the page**

In `profile-page.component.html`, add `<lib-instructor-application />` as the **last child** inside the outer `<section class="mx-auto max-w-2xl ...">`, after the password section. (The component renders its own `<section>` only for Students, so no surrounding conditional is needed.)

- [ ] **Step 3: Run the full web-profile suite**

Run: `pnpm nx test web-profile --skip-nx-cache`
Expected: PASS — existing `ProfilePageComponent` spec still green (the new child only fetches when a Student is logged in; if the page spec uses a non-student or a stubbed `AuthService` with no role, the child stays inert). If the page spec fails because the child now issues an HTTP GET, register `InstructorApplicationService` as a stub in that spec's providers (mirroring how `EmailChangeService`/`PasswordChangeService` are handled there).

- [ ] **Step 4: Commit**

```bash
git add libs/web-profile/src/lib/profile-page/profile-page.component.ts libs/web-profile/src/lib/profile-page/profile-page.component.html
git commit -m "feat(web-profile): embed instructor-application section on profile page (UC-01-04)"
```

---

## Task 12: E2E happy path

**Files:**
- Modify or create a spec under `apps/web-e2e/` (inspect the existing profile/settings spec first; add to it if one exists, else create `apps/web-e2e/src/instructor-application.spec.ts`).

- [ ] **Step 1: Inspect existing e2e patterns**

Run: `ls apps/web-e2e/src && grep -rln "settings/profile\|registerAndLogin\|loginAs" apps/web-e2e/src`
Read the closest existing authenticated-student spec to reuse its login/registration helper and base URL conventions. Do not invent helpers — reuse what the suite already provides.

- [ ] **Step 2: Write the happy-path test**

Using the suite's existing helpers (names below are placeholders — substitute the real ones found in Step 1), assert the submit → under-review → persists-across-reload flow:

```ts
import { test, expect } from '@playwright/test';
// import { registerAndVerifyStudent } from './support/helpers'; // use the real helper

test('a student submits an instructor application and sees it under review', async ({ page }) => {
  // await registerAndVerifyStudent(page);            // reuse the suite's helper
  await page.goto('/settings/profile');

  await page.getByRole('button', { name: 'Become an Instructor' }).click();
  await page.getByLabel('Statement of intent').fill('I have taught Rust for five years.');
  await page.getByLabel('Areas of expertise').fill('Rust, systems programming');
  await page.getByRole('button', { name: 'Submit application' }).click();

  await expect(page.getByTestId('application-pending')).toContainText('under review');

  await page.reload();
  await expect(page.getByTestId('application-pending')).toContainText('under review');
});
```

- [ ] **Step 3: Run the e2e spec**

Run: `pnpm nx e2e web-e2e --skip-nx-cache` (or the suite's documented single-spec invocation). Ensure emulators are running per `README.md`.
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web-e2e
git commit -m "test(web-e2e): instructor application submission happy path (UC-01-04)"
```

---

## Task 13: Full verification sweep

- [ ] **Step 1: Run all affected tests**

Run: `pnpm nx run-many -t test -p shared-data-models api-profile web-profile --skip-nx-cache`
Expected: all PASS.

- [ ] **Step 2: Lint the touched projects**

Run: `pnpm nx run-many -t lint -p shared-data-models api-profile web-profile --skip-nx-cache`
Expected: clean.

- [ ] **Step 3: Mutation check (match the repo's ≥80% adjusted bar)**

Run the workspace's mutation tooling for the new units (see `tools/mutation/` and prior slice practice). Address surviving mutants in the service/component as needed. Commit any added test cases:

```bash
git add -A
git commit -m "test(profile): strengthen instructor-application tests to clear mutation bar (UC-01-04)"
```

---

## Task 14: Documentation (at merge)

**Files:**
- Modify: `README.md`
- Modify: `docs/use-cases/01-user-identity-and-access.md`
- Modify: `docs/quality/spec-drift-report.md`
- Create: `docs/superpowers/summaries/2026-05-29-uc-01-04-instructor-role-request-summary.md`

- [ ] **Step 1: README** — extend the EP-01 "what is wired up" entry with UC-01-04 (submission only; approval still CLI-mediated), and add the two endpoints to the `/api/profile` endpoint list.

- [ ] **Step 2: Use-case status banner** — update the EP-01 status note: UC-01-04 submission flow implemented; admin approve/decline still deferred to EP-08, promotion via `promote-to-instructor` (now also resolves the application).

- [ ] **Step 3: Drift report** — add a UC-01-04 row recording the submission-only scope and the deferred admin-review post-condition.

- [ ] **Step 4: Slice summary** — write the summary following the format of the most recent file in `docs/superpowers/summaries/`.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/use-cases/01-user-identity-and-access.md docs/quality/spec-drift-report.md docs/superpowers/summaries/2026-05-29-uc-01-04-instructor-role-request-summary.md
git commit -m "docs: reconcile UC-01-04 instructor role request (submission only) across guide + drift report"
```

---

## Done criteria

- A Student sees **Become an Instructor** on `/settings/profile`; submitting a non-empty statement + expertise persists a `PENDING` `instructorApplications/{uid}` doc and swaps the form for an under-review card that survives reload.
- Instructors/Admins never see the section; the server independently rejects their submissions with `ALREADY_INSTRUCTOR`.
- Empty fields → `INSTRUCTOR_APPLICATION_INVALID` (field-targeted); a second submission while pending → `INSTRUCTOR_APPLICATION_EXISTS`.
- `pnpm tools:promote-to-instructor <email>` flips the role **and** resolves a pending application to `APPROVED`.
- All new units pass; touched projects lint clean and clear the ≥80% adjusted-mutation bar.
- No admin review UI, approve/decline, or decision emails (deferred to EP-08).
