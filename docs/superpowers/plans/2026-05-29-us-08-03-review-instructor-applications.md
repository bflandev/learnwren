# US-08-03 Review Instructor Applications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the in-app administrator flow to review, approve, or decline pending instructor applications — the second half of the UC-01-04 loop (approval is currently CLI-only) — and establish the first admin surface.

**Architecture:** A new ADMIN-only page at `/admin/instructor-applications` (new `web-admin` lib) lists the pending queue and approves/declines via a new admin controller added to `api-profile`'s existing `instructor-application/` submodule (reusing `instructorApplications/{uid}`). Approve runs a **shared promotion helper** that the `promote-to-instructor` CLI is refactored to call too, so the role-grant effect can't drift. Role gating uses a new `AdminRoleGuard` (api) and `adminRoleGuard` (web), mirroring the existing instructor guards. Applicants are emailed the decision via two new `EmailTransport` methods. An ADMIN is created with a new `promote-to-admin` CLI.

**Tech Stack:** NestJS 11, Angular 21 (standalone, signals, OnPush), Firestore (Firebase Admin SDK), vitest, Playwright (api-e2e + web-e2e), Nx (pnpm), tsx for CLIs.

**Spec:** `docs/superpowers/specs/2026-05-29-us-08-03-review-instructor-applications-design.md`

---

## Conventions (read once before starting)

- Run all tasks through nx: `pnpm nx test <project>`, `pnpm nx lint <project>`, `pnpm nx run-many -t test`.
- DTOs are type-shapes only (`@Allow()`); domain validation lives in services so typed error codes survive the global `ValidationPipe`. (Not needed here — endpoints take no bodies — but keep in mind.)
- Per-feature `ExceptionFilter` per submodule, delegating to `handleException()` from `@learnwren/api-http-errors`. Domain exceptions are `{ code, status, details? }`-shaped. The filter must also `@Catch` `AuthException` so a guard rejection renders its real status (403) instead of a 500 fallback.
- Web feature-lib services are thin Promise-returning HTTP wrappers (`firstValueFrom`); the **component** owns signal state.
- Commit after each green task with a Conventional Commit message.

## File Structure

**Created:**
- `libs/api-auth/src/lib/admin-role.guard.ts` — `AdminRoleGuard` (403 unless `role === 'ADMIN'`).
- `libs/api-auth/src/lib/admin-role.guard.spec.ts`
- `libs/api-profile/src/lib/instructor-application/instructor-promotion.ts` — Nest-free shared promotion helper.
- `libs/api-profile/src/lib/instructor-application/instructor-promotion.spec.ts`
- `libs/api-profile/src/lib/instructor-application/errors/admin-instructor-application.exception.ts`
- `libs/api-profile/src/lib/instructor-application/errors/admin-instructor-application.exception.spec.ts`
- `libs/api-profile/src/lib/instructor-application/admin-instructor-application.exception-filter.ts`
- `libs/api-profile/src/lib/instructor-application/admin-instructor-application.exception-filter.spec.ts`
- `libs/api-profile/src/lib/instructor-application/admin-instructor-application.service.ts`
- `libs/api-profile/src/lib/instructor-application/admin-instructor-application.service.spec.ts`
- `libs/api-profile/src/lib/instructor-application/admin-instructor-application.controller.ts`
- `libs/api-profile/src/lib/instructor-application/admin-instructor-application.controller.spec.ts`
- `tools/promote-to-admin.ts`
- `libs/web-admin/**` (scaffolded) — `adminRoleGuard`, service, page component, `admin.routes.ts`, `index.ts`.

**Modified:**
- `libs/shared-data-models/src/lib/instructor-application.ts` (+ `.spec.ts`) — admin view + error codes.
- `libs/api-auth/src/index.ts` — export `AdminRoleGuard`.
- `libs/api-auth/src/lib/auth.module.ts` — provide/export `AdminRoleGuard`.
- `tools/promote-to-instructor.ts` — call the shared helper.
- `libs/api-auth/src/lib/email-transport/email-transport.ts` — two new methods + input types.
- `libs/api-auth/src/lib/email-transport/console-email-transport.ts` (+ spec) — implement + extend outbox kinds.
- `libs/api-auth/src/lib/email-transport/smtp-email-transport.ts` (+ spec) — implement.
- `libs/api-profile/src/lib/profile.module.ts` — register admin controller/service/filter.
- `package.json` — `tools:promote-to-admin` script.
- `tsconfig.base.json` — `@learnwren/web-admin` path (added by generator; verify).
- `apps/web/src/app/app.routes.ts` — spread `adminRoutes`.
- `apps/web/src/app/app.html` (+ `app.spec.ts`) — ADMIN nav link.
- `apps/api-e2e/src/_helpers/auth.ts` — `registerAndPromoteAdmin` helper.
- `apps/api-e2e/src/instructor-application-admin.e2e-spec.ts` (new) — admin flow.
- `apps/web-e2e/src/admin-instructor-applications.spec.ts` (new) — queue walkthrough.
- `README.md`, `docs/quality/spec-drift-report.md`, `docs/USER_GUIDE.md` — record the feature.

---

## Task 1: shared-data-models — admin view + error codes

**Files:**
- Modify: `libs/shared-data-models/src/lib/instructor-application.ts`
- Test: `libs/shared-data-models/src/lib/instructor-application.spec.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `libs/shared-data-models/src/lib/instructor-application.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';

import {
  APPLICATION_NOT_FOUND,
  APPLICATION_NOT_PENDING,
  APPLICANT_NOT_VERIFIED,
} from './instructor-application';
import type {
  PendingInstructorApplicationView,
  PendingInstructorApplicationsResponse,
} from './instructor-application';

describe('admin instructor-application contract', () => {
  it('exposes admin error-code constants', () => {
    expect(APPLICATION_NOT_FOUND).toBe('APPLICATION_NOT_FOUND');
    expect(APPLICATION_NOT_PENDING).toBe('APPLICATION_NOT_PENDING');
    expect(APPLICANT_NOT_VERIFIED).toBe('APPLICANT_NOT_VERIFIED');
  });

  it('PendingInstructorApplicationsResponse holds joined view rows', () => {
    const row: PendingInstructorApplicationView = {
      uid: 'u1' as PendingInstructorApplicationView['uid'],
      displayName: 'Ada',
      email: 'ada@example.com',
      statement: 'I teach',
      expertise: 'Math',
      createdAt: '2026-05-29T00:00:00.000Z' as PendingInstructorApplicationView['createdAt'],
    };
    const res: PendingInstructorApplicationsResponse = { applications: [row] };
    expect(res.applications[0]?.email).toBe('ada@example.com');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test shared-data-models`
Expected: FAIL — `APPLICATION_NOT_FOUND` and the new types are not exported.

- [ ] **Step 3: Add the types + codes**

Append to `libs/shared-data-models/src/lib/instructor-application.ts`:

```ts
/** One row of the admin pending queue: an application joined with the user doc. */
export interface PendingInstructorApplicationView {
  uid: UserId;
  displayName: string;
  email: string;
  statement: string;
  expertise: string;
  createdAt: ISODateString;
}

/** Body of GET /api/admin/instructor-applications. */
export interface PendingInstructorApplicationsResponse {
  applications: PendingInstructorApplicationView[];
}

export const APPLICATION_NOT_FOUND = 'APPLICATION_NOT_FOUND';
export const APPLICATION_NOT_PENDING = 'APPLICATION_NOT_PENDING';
export const APPLICANT_NOT_VERIFIED = 'APPLICANT_NOT_VERIFIED';

export type AdminInstructorApplicationErrorCode =
  | typeof APPLICATION_NOT_FOUND
  | typeof APPLICATION_NOT_PENDING
  | typeof APPLICANT_NOT_VERIFIED;
```

(`UserId` and `ISODateString` are already imported at the top of the file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test shared-data-models`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/shared-data-models/src/lib/instructor-application.ts libs/shared-data-models/src/lib/instructor-application.spec.ts
git commit -m "feat(shared): add admin instructor-application view + error codes"
```

---

## Task 2: api-auth — AdminRoleGuard

**Files:**
- Create: `libs/api-auth/src/lib/admin-role.guard.ts`
- Test: `libs/api-auth/src/lib/admin-role.guard.spec.ts`
- Modify: `libs/api-auth/src/index.ts`, `libs/api-auth/src/lib/auth.module.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-auth/src/lib/admin-role.guard.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';

import { AdminRoleGuard } from './admin-role.guard';
import { InsufficientRoleException } from './errors/auth.exception';

function ctxWithRole(role: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
  } as unknown as ExecutionContext;
}

describe('AdminRoleGuard', () => {
  const guard = new AdminRoleGuard();

  it('allows ADMIN', () => {
    expect(guard.canActivate(ctxWithRole('ADMIN'))).toBe(true);
  });

  it('rejects INSTRUCTOR', () => {
    expect(() => guard.canActivate(ctxWithRole('INSTRUCTOR'))).toThrow(InsufficientRoleException);
  });

  it('rejects missing user', () => {
    expect(() => guard.canActivate(ctxWithRole(undefined))).toThrow(InsufficientRoleException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-auth`
Expected: FAIL — cannot find `./admin-role.guard`.

- [ ] **Step 3: Implement the guard**

Create `libs/api-auth/src/lib/admin-role.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { InsufficientRoleException } from './errors/auth.exception';
import type { AuthenticatedRequest } from './types/authenticated-request';

@Injectable()
export class AdminRoleGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (req.user?.role !== 'ADMIN') {
      throw new InsufficientRoleException();
    }
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-auth`
Expected: PASS.

- [ ] **Step 5: Export + register the guard**

In `libs/api-auth/src/index.ts`, add after the `InstructorRoleGuard` export line:

```ts
export { AdminRoleGuard } from './lib/admin-role.guard';
```

In `libs/api-auth/src/lib/auth.module.ts`, import it and add `AdminRoleGuard` to **both** the `providers` and `exports` arrays (alongside `InstructorRoleGuard`):

```ts
import { AdminRoleGuard } from './admin-role.guard';
```

- [ ] **Step 6: Verify build + commit**

Run: `pnpm nx test api-auth && pnpm nx lint api-auth`
Expected: PASS.

```bash
git add libs/api-auth/src/lib/admin-role.guard.ts libs/api-auth/src/lib/admin-role.guard.spec.ts libs/api-auth/src/index.ts libs/api-auth/src/lib/auth.module.ts
git commit -m "feat(api-auth): add AdminRoleGuard"
```

---

## Task 3: Shared instructor-promotion helper + CLI refactor

**Files:**
- Create: `libs/api-profile/src/lib/instructor-application/instructor-promotion.ts`
- Test: `libs/api-profile/src/lib/instructor-application/instructor-promotion.spec.ts`
- Modify: `tools/promote-to-instructor.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-profile/src/lib/instructor-application/instructor-promotion.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

import { promoteUserToInstructor } from './instructor-promotion';
import type { UserId } from '@learnwren/shared-data-models';

function fakeFirestore(appData: Record<string, unknown> | null) {
  const userUpdate = vi.fn(async () => undefined);
  const appUpdate = vi.fn(async () => undefined);
  const firestore = {
    collection: vi.fn((name: string) => ({
      doc: vi.fn(() => ({
        get: vi.fn(async () => ({
          exists: name === 'instructorApplications' ? appData !== null : true,
          data: () => (name === 'instructorApplications' ? appData ?? undefined : {}),
        })),
        update: name === 'users' ? userUpdate : appUpdate,
      })),
    })),
  };
  return { firestore, userUpdate, appUpdate };
}

describe('promoteUserToInstructor', () => {
  const NOW = '2026-05-29T12:00:00.000Z';

  it('sets the INSTRUCTOR claim, updates the user role, and resolves a PENDING app', async () => {
    const setCustomUserClaims = vi.fn(async () => undefined);
    const { firestore, userUpdate, appUpdate } = fakeFirestore({ status: 'PENDING' });

    await promoteUserToInstructor('u1' as UserId, { setCustomUserClaims }, firestore as never, NOW);

    expect(setCustomUserClaims).toHaveBeenCalledWith('u1', { role: 'INSTRUCTOR' });
    expect(userUpdate).toHaveBeenCalledWith({ role: 'INSTRUCTOR' });
    expect(appUpdate).toHaveBeenCalledWith({ status: 'APPROVED', resolvedAt: NOW });
  });

  it('does not touch the app when none is PENDING', async () => {
    const setCustomUserClaims = vi.fn(async () => undefined);
    const { firestore, appUpdate } = fakeFirestore({ status: 'DECLINED' });

    await promoteUserToInstructor('u1' as UserId, { setCustomUserClaims }, firestore as never, NOW);

    expect(appUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-profile`
Expected: FAIL — cannot find `./instructor-promotion`.

- [ ] **Step 3: Implement the helper (Nest-free)**

Create `libs/api-profile/src/lib/instructor-application/instructor-promotion.ts`:

```ts
import type { UserId } from '@learnwren/shared-data-models';

/** Minimal structural slice of the Firebase Admin Auth handle. */
export interface PromotionAuthLike {
  setCustomUserClaims(uid: string, claims: object | null): Promise<unknown>;
}

/** Minimal structural slice of the Firebase Admin Firestore handle. */
export interface PromotionFirestoreLike {
  collection(path: string): {
    doc(id: string): {
      get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
      update(data: Record<string, unknown>): Promise<unknown>;
    };
  };
}

/**
 * Grant the INSTRUCTOR role: set the Firebase custom claim, update
 * `users/{uid}.role`, and resolve any PENDING instructor application to
 * APPROVED. Pure over the Admin-SDK handles so the promote-to-instructor CLI
 * and the admin review service share one effect and can't drift. The user must
 * re-authenticate for the new claim to take effect.
 */
export async function promoteUserToInstructor(
  uid: UserId,
  auth: PromotionAuthLike,
  firestore: PromotionFirestoreLike,
  nowIso: string,
): Promise<void> {
  await auth.setCustomUserClaims(uid, { role: 'INSTRUCTOR' });
  await firestore.collection('users').doc(uid).update({ role: 'INSTRUCTOR' });

  const appRef = firestore.collection('instructorApplications').doc(uid);
  const snap = await appRef.get();
  if (snap.exists && snap.data()?.['status'] === 'PENDING') {
    await appRef.update({ status: 'APPROVED', resolvedAt: nowIso });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-profile`
Expected: PASS (the two new tests).

- [ ] **Step 5: Refactor the CLI to call the helper**

In `tools/promote-to-instructor.ts`, replace the body of `promoteToInstructor` (the claim/user-update/app-resolution block) with a call to the shared helper. Result:

```ts
import * as admin from 'firebase-admin';

import { promoteUserToInstructor } from '../libs/api-profile/src/lib/instructor-application/instructor-promotion';
import type { UserId } from '@learnwren/shared-data-models';

import { initFirebaseApp, resolveMode } from './firebase-admin-init';

type AuthLike = Pick<admin.auth.Auth, 'getUserByEmail' | 'setCustomUserClaims'>;
type FirestoreLike = Pick<admin.firestore.Firestore, 'collection'>;

export async function promoteToInstructor(
  email: string,
  auth: AuthLike,
  firestore: FirestoreLike,
): Promise<void> {
  const user = await auth.getUserByEmail(email);
  if (!user.emailVerified) {
    throw new Error(
      `Refusing to promote ${email}: the account is not email-verified. ` +
        'Have the user verify their email first.',
    );
  }

  await promoteUserToInstructor(
    user.uid as UserId,
    auth,
    firestore as never,
    new Date().toISOString(),
  );

  console.log(`[promote] Promoted ${email} (uid=${user.uid}) to INSTRUCTOR.`);
  console.log(
    '[promote] User must sign out and sign back in for the new role to take effect.',
  );
}
```

Leave the `main()` / `main().catch(...)` block unchanged.

> Note: the relative import keeps NestJS out of the CLI (importing the `@learnwren/api-profile` barrel would pull in `ProfileModule`). `tsx` reads the root `tsconfig.json` (which extends `tsconfig.base.json`) so the type-only `@learnwren/shared-data-models` import resolves and is erased at runtime.

- [ ] **Step 6: Smoke-test the refactored CLI (requires emulators)**

In one terminal: `pnpm emulators`. Then:
Run: `pnpm tools:promote-to-instructor someone@example.com`
Expected: either `[promote] Promoted ...` or a clear "no user record" / "not email-verified" error — i.e. it executes without a module-resolution/import crash. (If you have no emulator user, the expected outcome is the Firebase "no user" error, which still proves the import path works.)

- [ ] **Step 7: Commit**

```bash
git add libs/api-profile/src/lib/instructor-application/instructor-promotion.ts libs/api-profile/src/lib/instructor-application/instructor-promotion.spec.ts tools/promote-to-instructor.ts
git commit -m "refactor(tools): extract shared promoteUserToInstructor helper"
```

---

## Task 4: Email transport — approval/decline methods

**Files:**
- Modify: `libs/api-auth/src/lib/email-transport/email-transport.ts`
- Modify: `libs/api-auth/src/lib/email-transport/console-email-transport.ts` (+ spec)
- Modify: `libs/api-auth/src/lib/email-transport/smtp-email-transport.ts`

- [ ] **Step 1: Write the failing test (console transport)**

Add to `libs/api-auth/src/lib/email-transport/console-email-transport.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ConsoleEmailTransport } from './console-email-transport';

describe('ConsoleEmailTransport — instructor decision emails', () => {
  it('records an approved email in the outbox', async () => {
    const t = new ConsoleEmailTransport();
    await t.sendInstructorApplicationApprovedEmail({ to: 'a@example.com' });
    expect(t.lastSentTo('a@example.com', 'instructor-approved')).toBeDefined();
  });

  it('records a declined email in the outbox', async () => {
    const t = new ConsoleEmailTransport();
    await t.sendInstructorApplicationDeclinedEmail({ to: 'b@example.com' });
    expect(t.lastSentTo('b@example.com', 'instructor-declined')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-auth`
Expected: FAIL — methods don't exist on the transport.

- [ ] **Step 3: Extend the interface**

In `libs/api-auth/src/lib/email-transport/email-transport.ts`, add the input types and two interface methods:

```ts
export interface InstructorApplicationApprovedEmailInput {
  to: string;
}

export interface InstructorApplicationDeclinedEmailInput {
  to: string;
}
```

Add to the `EmailTransport` interface:

```ts
  sendInstructorApplicationApprovedEmail(
    input: InstructorApplicationApprovedEmailInput,
  ): Promise<void>;
  sendInstructorApplicationDeclinedEmail(
    input: InstructorApplicationDeclinedEmailInput,
  ): Promise<void>;
```

- [ ] **Step 4: Implement in the console transport**

In `libs/api-auth/src/lib/email-transport/console-email-transport.ts`:

Extend the `OutboxEntry['kind']` union to include `'instructor-approved' | 'instructor-declined'`:

```ts
  kind:
    | 'unlock'
    | 'verification'
    | 'password-reset'
    | 'email-change'
    | 'password-changed'
    | 'instructor-approved'
    | 'instructor-declined';
```

Add the imports for the two input types, then add the methods (before `lastSentTo`):

```ts
  async sendInstructorApplicationApprovedEmail(
    input: InstructorApplicationApprovedEmailInput,
  ): Promise<void> {
    this.logger.log(`[instructor-approved-email] to=${input.to}`);
    this.append({ kind: 'instructor-approved', to: input.to, url: '', sentAt: new Date() });
  }

  async sendInstructorApplicationDeclinedEmail(
    input: InstructorApplicationDeclinedEmailInput,
  ): Promise<void> {
    this.logger.log(`[instructor-declined-email] to=${input.to}`);
    this.append({ kind: 'instructor-declined', to: input.to, url: '', sentAt: new Date() });
  }
```

- [ ] **Step 5: Implement in the SMTP transport**

In `libs/api-auth/src/lib/email-transport/smtp-email-transport.ts`, add the two input-type imports and append two methods before the closing brace (mirror `sendPasswordChangedEmail`):

```ts
  async sendInstructorApplicationApprovedEmail(
    input: InstructorApplicationApprovedEmailInput,
  ): Promise<void> {
    const text =
      `Good news — your application to become a Learn Wren instructor has been approved.\n\n` +
      `Sign out and sign back in to access instructor tools and start creating courses.`;
    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: input.to,
        subject: 'Your Learn Wren instructor application was approved',
        text,
      });
      this.logger.log(`[instructor-approved-email] sent to=${input.to}`);
    } catch (err) {
      this.logger.error(`[instructor-approved-email] send failed to=${input.to}: ${String(err)}`);
      throw err;
    }
  }

  async sendInstructorApplicationDeclinedEmail(
    input: InstructorApplicationDeclinedEmailInput,
  ): Promise<void> {
    const text =
      `Thank you for your interest in teaching on Learn Wren.\n\n` +
      `After review, your instructor application was not approved at this time. ` +
      `You're welcome to apply again from your profile settings.`;
    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: input.to,
        subject: 'Update on your Learn Wren instructor application',
        text,
      });
      this.logger.log(`[instructor-declined-email] sent to=${input.to}`);
    } catch (err) {
      this.logger.error(`[instructor-declined-email] send failed to=${input.to}: ${String(err)}`);
      throw err;
    }
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm nx test api-auth`
Expected: PASS (the SMTP transport spec compiles against the widened interface; new console tests pass).

- [ ] **Step 7: Commit**

```bash
git add libs/api-auth/src/lib/email-transport/
git commit -m "feat(api-auth): add instructor approval/decline decision emails"
```

---

## Task 5: api-profile — admin exceptions + filter

**Files:**
- Create: `libs/api-profile/src/lib/instructor-application/errors/admin-instructor-application.exception.ts`
- Test: `.../errors/admin-instructor-application.exception.spec.ts`
- Create: `libs/api-profile/src/lib/instructor-application/admin-instructor-application.exception-filter.ts`
- Test: `.../admin-instructor-application.exception-filter.spec.ts`

- [ ] **Step 1: Write the failing test (exceptions)**

Create `.../errors/admin-instructor-application.exception.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';

import {
  ApplicationNotFoundException,
  ApplicationNotPendingException,
  ApplicantNotVerifiedException,
} from './admin-instructor-application.exception';

describe('admin instructor-application exceptions', () => {
  it('NotFound -> 404 / APPLICATION_NOT_FOUND', () => {
    const e = new ApplicationNotFoundException();
    expect([e.code, e.status]).toEqual(['APPLICATION_NOT_FOUND', 404]);
  });
  it('NotPending -> 409 / APPLICATION_NOT_PENDING', () => {
    const e = new ApplicationNotPendingException();
    expect([e.code, e.status]).toEqual(['APPLICATION_NOT_PENDING', 409]);
  });
  it('NotVerified -> 409 / APPLICANT_NOT_VERIFIED', () => {
    const e = new ApplicantNotVerifiedException();
    expect([e.code, e.status]).toEqual(['APPLICANT_NOT_VERIFIED', 409]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-profile`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the exceptions**

Create `.../errors/admin-instructor-application.exception.ts`:

```ts
import type { AdminInstructorApplicationErrorCode } from '@learnwren/shared-data-models';

export class AdminInstructorApplicationException extends Error {
  constructor(
    public readonly code: AdminInstructorApplicationErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AdminInstructorApplicationException';
  }
}

export class ApplicationNotFoundException extends AdminInstructorApplicationException {
  constructor() {
    super('APPLICATION_NOT_FOUND', 'No such instructor application.', 404);
  }
}

export class ApplicationNotPendingException extends AdminInstructorApplicationException {
  constructor() {
    super(
      'APPLICATION_NOT_PENDING',
      'This application has already been resolved.',
      409,
    );
  }
}

export class ApplicantNotVerifiedException extends AdminInstructorApplicationException {
  constructor() {
    super(
      'APPLICANT_NOT_VERIFIED',
      'The applicant must verify their email before approval.',
      409,
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-profile`
Expected: PASS.

- [ ] **Step 5: Write the failing test (filter)**

Create `.../admin-instructor-application.exception-filter.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';

import * as httpErrors from '@learnwren/api-http-errors';
import { AdminInstructorApplicationExceptionFilter } from './admin-instructor-application.exception-filter';
import { ApplicationNotFoundException } from './errors/admin-instructor-application.exception';

describe('AdminInstructorApplicationExceptionFilter', () => {
  it('delegates to handleException', () => {
    const spy = vi.spyOn(httpErrors, 'handleException').mockReturnValue(undefined as never);
    const filter = new AdminInstructorApplicationExceptionFilter();
    const host = {} as ArgumentsHost;
    const err = new ApplicationNotFoundException();

    filter.catch(err, host);

    expect(spy).toHaveBeenCalledWith(host, err, expect.anything());
    spy.mockRestore();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm nx test api-profile`
Expected: FAIL — filter module not found.

- [ ] **Step 7: Implement the filter**

Create `.../admin-instructor-application.exception-filter.ts`:

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { handleException } from '@learnwren/api-http-errors';
import { AuthException } from '@learnwren/api-auth';

import { AdminInstructorApplicationException } from './errors/admin-instructor-application.exception';

@Catch(AdminInstructorApplicationException, AuthException, HttpException)
export class AdminInstructorApplicationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('AdminInstructorApplicationExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger);
  }
}
```

> `AuthException` is caught so a rejection from `AdminRoleGuard` (`InsufficientRoleException`, 403) renders as 403, not a 500 fallback.

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm nx test api-profile`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add libs/api-profile/src/lib/instructor-application/errors/admin-instructor-application.exception.ts libs/api-profile/src/lib/instructor-application/errors/admin-instructor-application.exception.spec.ts libs/api-profile/src/lib/instructor-application/admin-instructor-application.exception-filter.ts libs/api-profile/src/lib/instructor-application/admin-instructor-application.exception-filter.spec.ts
git commit -m "feat(api-profile): admin instructor-application exceptions + filter"
```

---

## Task 6: api-profile — AdminInstructorApplicationService

**Files:**
- Create: `libs/api-profile/src/lib/instructor-application/admin-instructor-application.service.ts`
- Test: `.../admin-instructor-application.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `.../admin-instructor-application.service.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AdminInstructorApplicationService } from './admin-instructor-application.service';
import {
  ApplicationNotFoundException,
  ApplicationNotPendingException,
  ApplicantNotVerifiedException,
} from './errors/admin-instructor-application.exception';

type DocStub = {
  get: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  set?: ReturnType<typeof vi.fn>;
};

function makeFirestore() {
  const docs: Record<string, DocStub> = {};
  const queryDocs: Array<{ data: () => unknown }> = [];
  const firestore = {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => {
        const key = `${name}/${id}`;
        docs[key] ??= { get: vi.fn(), update: vi.fn(async () => undefined) };
        return docs[key];
      }),
      where: vi.fn(() => ({ get: vi.fn(async () => ({ docs: queryDocs })) })),
    })),
  };
  return { firestore, docs, queryDocs };
}

describe('AdminInstructorApplicationService', () => {
  let firestore: ReturnType<typeof makeFirestore>['firestore'];
  let docs: Record<string, DocStub>;
  let queryDocs: Array<{ data: () => unknown }>;
  let auth: { getUser: ReturnType<typeof vi.fn>; setCustomUserClaims: ReturnType<typeof vi.fn> };
  let email: {
    sendInstructorApplicationApprovedEmail: ReturnType<typeof vi.fn>;
    sendInstructorApplicationDeclinedEmail: ReturnType<typeof vi.fn>;
  };
  let svc: AdminInstructorApplicationService;

  beforeEach(() => {
    ({ firestore, docs, queryDocs } = makeFirestore());
    auth = {
      getUser: vi.fn(async () => ({ email: 'ada@example.com', emailVerified: true })),
      setCustomUserClaims: vi.fn(async () => undefined),
    };
    email = {
      sendInstructorApplicationApprovedEmail: vi.fn(async () => undefined),
      sendInstructorApplicationDeclinedEmail: vi.fn(async () => undefined),
    };
    svc = new AdminInstructorApplicationService(firestore as never, auth as never, email as never);
  });

  it('listPending joins each application with the user doc', async () => {
    queryDocs.push({
      data: () => ({
        uid: 'u1',
        statement: 's',
        expertise: 'e',
        status: 'PENDING',
        createdAt: '2026-05-29T00:00:00.000Z',
      }),
    });
    docs['users/u1'] = {
      get: vi.fn(async () => ({ data: () => ({ displayName: 'Ada', email: 'ada@example.com' }) })),
      update: vi.fn(),
    };

    const res = await svc.listPending();

    expect(res.applications).toEqual([
      {
        uid: 'u1',
        displayName: 'Ada',
        email: 'ada@example.com',
        statement: 's',
        expertise: 'e',
        createdAt: '2026-05-29T00:00:00.000Z',
      },
    ]);
  });

  it('approve: verified pending -> claim + role + email + APPROVED view', async () => {
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({
        exists: true,
        data: () => ({ uid: 'u1', statement: 's', expertise: 'e', status: 'PENDING', createdAt: 'c' }),
      })),
      update: vi.fn(async () => undefined),
    };

    const view = await svc.approve('u1' as never);

    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u1', { role: 'INSTRUCTOR' });
    expect(email.sendInstructorApplicationApprovedEmail).toHaveBeenCalledWith({ to: 'ada@example.com' });
    expect(view.status).toBe('APPROVED');
  });

  it('approve: missing app -> ApplicationNotFoundException', async () => {
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({ exists: false, data: () => undefined })),
      update: vi.fn(),
    };
    await expect(svc.approve('u1' as never)).rejects.toThrow(ApplicationNotFoundException);
  });

  it('approve: already resolved -> ApplicationNotPendingException', async () => {
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({ exists: true, data: () => ({ status: 'APPROVED' }) })),
      update: vi.fn(),
    };
    await expect(svc.approve('u1' as never)).rejects.toThrow(ApplicationNotPendingException);
  });

  it('approve: unverified applicant -> ApplicantNotVerifiedException, no claim set', async () => {
    auth.getUser = vi.fn(async () => ({ email: 'ada@example.com', emailVerified: false }));
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({ exists: true, data: () => ({ status: 'PENDING' }) })),
      update: vi.fn(),
    };
    await expect(svc.approve('u1' as never)).rejects.toThrow(ApplicantNotVerifiedException);
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('decline: pending -> DECLINED view + email', async () => {
    const update = vi.fn(async () => undefined);
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({
        exists: true,
        data: () => ({ uid: 'u1', statement: 's', expertise: 'e', status: 'PENDING', createdAt: 'c' }),
      })),
      update,
    };

    const view = await svc.decline('u1' as never);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'DECLINED' }));
    expect(email.sendInstructorApplicationDeclinedEmail).toHaveBeenCalledWith({ to: 'ada@example.com' });
    expect(view.status).toBe('DECLINED');
  });

  it('decline: already resolved -> ApplicationNotPendingException', async () => {
    docs['instructorApplications/u1'] = {
      get: vi.fn(async () => ({ exists: true, data: () => ({ status: 'DECLINED' }) })),
      update: vi.fn(),
    };
    await expect(svc.decline('u1' as never)).rejects.toThrow(ApplicationNotPendingException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-profile`
Expected: FAIL — service module not found.

- [ ] **Step 3: Implement the service**

Create `.../admin-instructor-application.service.ts`:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';

import { FIRESTORE, type FirestoreHandle, FIREBASE_AUTH, type FirebaseAuthHandle } from '@learnwren/api-firebase';
import { EMAIL_TRANSPORT, type EmailTransport } from '@learnwren/api-auth';
import type {
  InstructorApplication,
  InstructorApplicationView,
  ISODateString,
  PendingInstructorApplicationsResponse,
  PendingInstructorApplicationView,
  UserId,
} from '@learnwren/shared-data-models';

import { promoteUserToInstructor } from './instructor-promotion';
import {
  ApplicantNotVerifiedException,
  ApplicationNotFoundException,
  ApplicationNotPendingException,
} from './errors/admin-instructor-application.exception';

const COLLECTION = 'instructorApplications';

function nowIso(): ISODateString {
  return new Date().toISOString() as ISODateString;
}

@Injectable()
export class AdminInstructorApplicationService {
  private readonly logger = new Logger('AdminInstructorApplicationService');

  constructor(
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle,
    @Inject(EMAIL_TRANSPORT) private readonly email: EmailTransport,
  ) {}

  async listPending(): Promise<PendingInstructorApplicationsResponse> {
    const snap = await this.firestore.collection(COLLECTION).where('status', '==', 'PENDING').get();
    const applications: PendingInstructorApplicationView[] = [];
    for (const doc of snap.docs) {
      const app = doc.data() as InstructorApplication;
      const userSnap = await this.firestore.collection('users').doc(app.uid).get();
      const user = userSnap.data() as { displayName?: string; email?: string } | undefined;
      applications.push({
        uid: app.uid,
        displayName: user?.displayName ?? '',
        email: user?.email ?? '',
        statement: app.statement,
        expertise: app.expertise,
        createdAt: app.createdAt,
      });
    }
    return { applications };
  }

  async approve(uid: UserId): Promise<InstructorApplicationView> {
    const app = await this.requirePending(uid);
    const user = await this.auth.getUser(uid);
    if (!user.emailVerified) {
      throw new ApplicantNotVerifiedException();
    }

    await promoteUserToInstructor(uid, this.auth, this.firestore as never, nowIso());
    await this.email.sendInstructorApplicationApprovedEmail({ to: user.email ?? '' });
    this.logger.log(`[admin] instructor application approved uid=${uid}`);

    return this.viewOf(app, 'APPROVED');
  }

  async decline(uid: UserId): Promise<InstructorApplicationView> {
    const app = await this.requirePending(uid);
    await this.firestore
      .collection(COLLECTION)
      .doc(uid)
      .update({ status: 'DECLINED', resolvedAt: nowIso() });

    const user = await this.auth.getUser(uid);
    await this.email.sendInstructorApplicationDeclinedEmail({ to: user.email ?? '' });
    this.logger.log(`[admin] instructor application declined uid=${uid}`);

    return this.viewOf(app, 'DECLINED');
  }

  private async requirePending(uid: UserId): Promise<InstructorApplication> {
    const snap = await this.firestore.collection(COLLECTION).doc(uid).get();
    if (!snap.exists) {
      throw new ApplicationNotFoundException();
    }
    const app = snap.data() as InstructorApplication;
    if (app.status !== 'PENDING') {
      throw new ApplicationNotPendingException();
    }
    return app;
  }

  private viewOf(
    app: InstructorApplication,
    status: 'APPROVED' | 'DECLINED',
  ): InstructorApplicationView {
    return {
      status,
      statement: app.statement,
      expertise: app.expertise,
      createdAt: app.createdAt,
    };
  }
}
```

> `FirebaseAuthHandle.getUser(uid)` returns a `UserRecord` (has `email?: string`, `emailVerified: boolean`). The `this.firestore as never` cast satisfies the helper's minimal structural type without widening the real handle.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-profile`
Expected: PASS (all service tests).

- [ ] **Step 5: Commit**

```bash
git add libs/api-profile/src/lib/instructor-application/admin-instructor-application.service.ts libs/api-profile/src/lib/instructor-application/admin-instructor-application.service.spec.ts
git commit -m "feat(api-profile): AdminInstructorApplicationService (list/approve/decline)"
```

---

## Task 7: api-profile — AdminInstructorApplicationController + module wiring

**Files:**
- Create: `libs/api-profile/src/lib/instructor-application/admin-instructor-application.controller.ts`
- Test: `.../admin-instructor-application.controller.spec.ts`
- Modify: `libs/api-profile/src/lib/profile.module.ts`

- [ ] **Step 1: Write the failing test**

Create `.../admin-instructor-application.controller.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

import { AdminInstructorApplicationController } from './admin-instructor-application.controller';

describe('AdminInstructorApplicationController', () => {
  const svc = {
    listPending: vi.fn(async () => ({ applications: [] })),
    approve: vi.fn(async () => ({ status: 'APPROVED' })),
    decline: vi.fn(async () => ({ status: 'DECLINED' })),
  };
  const ctrl = new AdminInstructorApplicationController(svc as never);

  it('list delegates to listPending', async () => {
    await ctrl.list();
    expect(svc.listPending).toHaveBeenCalled();
  });

  it('approve passes the uid param', async () => {
    await ctrl.approve('u1');
    expect(svc.approve).toHaveBeenCalledWith('u1');
  });

  it('decline passes the uid param', async () => {
    await ctrl.decline('u1');
    expect(svc.decline).toHaveBeenCalledWith('u1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-profile`
Expected: FAIL — controller module not found.

- [ ] **Step 3: Implement the controller**

Create `.../admin-instructor-application.controller.ts`:

```ts
import { Controller, Get, Param, Post, UseFilters, UseGuards } from '@nestjs/common';

import { FirebaseSessionGuard, AdminRoleGuard } from '@learnwren/api-auth';
import type {
  InstructorApplicationView,
  PendingInstructorApplicationsResponse,
  UserId,
} from '@learnwren/shared-data-models';

import { AdminInstructorApplicationExceptionFilter } from './admin-instructor-application.exception-filter';
import { AdminInstructorApplicationService } from './admin-instructor-application.service';

@Controller('admin/instructor-applications')
@UseFilters(AdminInstructorApplicationExceptionFilter)
@UseGuards(FirebaseSessionGuard, AdminRoleGuard)
export class AdminInstructorApplicationController {
  constructor(private readonly svc: AdminInstructorApplicationService) {}

  @Get()
  list(): Promise<PendingInstructorApplicationsResponse> {
    return this.svc.listPending();
  }

  @Post(':uid/approve')
  approve(@Param('uid') uid: string): Promise<InstructorApplicationView> {
    return this.svc.approve(uid as UserId);
  }

  @Post(':uid/decline')
  decline(@Param('uid') uid: string): Promise<InstructorApplicationView> {
    return this.svc.decline(uid as UserId);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-profile`
Expected: PASS.

- [ ] **Step 5: Wire into ProfileModule**

In `libs/api-profile/src/lib/profile.module.ts`:
- Add imports for `AdminInstructorApplicationController`, `AdminInstructorApplicationService`, `AdminInstructorApplicationExceptionFilter`.
- Add `AdminInstructorApplicationController` to `controllers`.
- Add `AdminInstructorApplicationService` and `AdminInstructorApplicationExceptionFilter` to `providers`.

(`AuthModule` is already imported, so `AdminRoleGuard`, `FirebaseSessionGuard`, and `EMAIL_TRANSPORT` are available. `FIRESTORE`/`FIREBASE_AUTH` come from the Firebase module already wired through `AuthModule`.)

- [ ] **Step 6: Verify build + commit**

Run: `pnpm nx test api-profile && pnpm nx lint api-profile`
Expected: PASS.

```bash
git add libs/api-profile/src/lib/instructor-application/admin-instructor-application.controller.ts libs/api-profile/src/lib/instructor-application/admin-instructor-application.controller.spec.ts libs/api-profile/src/lib/profile.module.ts
git commit -m "feat(api-profile): admin instructor-application endpoints"
```

---

## Task 8: promote-to-admin CLI

**Files:**
- Create: `tools/promote-to-admin.ts`
- Modify: `package.json`

- [ ] **Step 1: Implement the CLI**

Create `tools/promote-to-admin.ts` (mirrors `promote-to-instructor.ts`; this is a manual operator tool — no unit test, consistent with the existing CLI):

```ts
#!/usr/bin/env tsx
/**
 * tools/promote-to-admin.ts
 *
 * Promote an existing, email-verified user to the ADMIN role. Sets the Firebase
 * Auth custom claim `role: 'ADMIN'` and the Firestore `users/{uid}.role` field.
 * ADMIN is an operator-only grant; there is no in-app admin-management flow.
 *
 * Usage:
 *   pnpm tools:promote-to-admin <email>
 *
 * Targets the local Firebase emulators by default. For production set
 * LEARNWREN_FIREBASE_TARGET=production together with
 * LEARNWREN_API_FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_JSON_PATH.
 */

import * as admin from 'firebase-admin';

import { initFirebaseApp, resolveMode } from './firebase-admin-init';

type AuthLike = Pick<admin.auth.Auth, 'getUserByEmail' | 'setCustomUserClaims'>;
type FirestoreLike = Pick<admin.firestore.Firestore, 'collection'>;

export async function promoteToAdmin(
  email: string,
  auth: AuthLike,
  firestore: FirestoreLike,
): Promise<void> {
  const user = await auth.getUserByEmail(email);
  if (!user.emailVerified) {
    throw new Error(
      `Refusing to promote ${email}: the account is not email-verified. ` +
        'Have the user verify their email first.',
    );
  }

  await auth.setCustomUserClaims(user.uid, { role: 'ADMIN' });
  await firestore.collection('users').doc(user.uid).update({ role: 'ADMIN' });

  console.log(`[promote-admin] Promoted ${email} (uid=${user.uid}) to ADMIN.`);
  console.log(
    '[promote-admin] User must sign out and sign back in for the new role to take effect.',
  );
}

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: pnpm tools:promote-to-admin <email>');
    process.exit(2);
  }

  const mode = resolveMode();
  console.log(`[promote-admin] Target: ${mode}.`);

  try {
    initFirebaseApp(mode);
    await promoteToAdmin(email, admin.auth(), admin.firestore());
  } catch (err) {
    console.error(`[promote-admin] Failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[promote-admin] fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the package script**

In `package.json` `scripts`, add after `tools:promote-to-instructor`:

```json
    "tools:promote-to-admin": "tsx tools/promote-to-admin.ts",
```

- [ ] **Step 3: Smoke-test (requires emulators)**

With `pnpm emulators` running and a verified user registered:
Run: `pnpm tools:promote-to-admin <that-email>`
Expected: `[promote-admin] Promoted ... to ADMIN.`

- [ ] **Step 4: Commit**

```bash
git add tools/promote-to-admin.ts package.json
git commit -m "feat(tools): add promote-to-admin CLI"
```

---

## Task 9: Scaffold the web-admin lib

**Files:**
- Create: `libs/web-admin/**`
- Modify: `tsconfig.base.json` (path alias — generator adds it; verify)

- [ ] **Step 1: Generate the library**

Use the `nx:nx-generate` skill to scaffold an Angular library named `web-admin`. Target options to request: directory `libs/web-admin`, **standalone**, **vitest** unit-test runner, **no bundler** (`none`), tag `scope:web`, prefix `lib`, and skip module file. Do **not** guess flags — let the skill resolve the exact `@nx/angular:library` invocation for this workspace (Angular 21 / vitest).

After generation, confirm the lib matches the lean peer convention:
- `libs/web-admin/project.json` has `tags: ["scope:web"]` and at minimum a `lint` target (trim any extra `build`/`test` targets only if peers like `web-profile` lack them — compare against `libs/web-profile/project.json`).
- `tsconfig.base.json` gained `"@learnwren/web-admin": ["./libs/web-admin/src/index.ts"]`. If not, add it.
- Remove any generated sample component/spec so the lib starts clean.

- [ ] **Step 2: Verify the lib is wired**

Run: `pnpm nx test web-admin`
Expected: PASS (passWithNoTests) or no-tests-found — confirming the project is registered and vitest is configured.

- [ ] **Step 3: Commit**

```bash
git add libs/web-admin tsconfig.base.json
git commit -m "chore(web-admin): scaffold admin feature library"
```

---

## Task 10: web-admin — adminRoleGuard

**Files:**
- Create: `libs/web-admin/src/lib/admin-role.guard.ts`
- Test: `libs/web-admin/src/lib/admin-role.guard.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web-admin/src/lib/admin-role.guard.spec.ts` (mirrors the web-courses guard spec):

```ts
import { TestBed } from '@angular/core/testing';
import { Router, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@learnwren/web-auth';

import { adminRoleGuard } from './admin-role.guard';

function runGuard(): unknown {
  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/admin/instructor-applications' } as RouterStateSnapshot;
  return TestBed.runInInjectionContext(() => adminRoleGuard(route, state));
}

describe('adminRoleGuard', () => {
  let auth: { currentUser: ReturnType<typeof signal>; refresh: ReturnType<typeof vi.fn> };
  let router: { createUrlTree: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    auth = {
      currentUser: signal<{ role: string } | null | undefined>(undefined),
      refresh: vi.fn(async () => undefined),
    };
    router = { createUrlTree: vi.fn((path: string[]) => ({ __path: path })) };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });
  });

  it('allows ADMIN', async () => {
    auth.currentUser = signal({ role: 'ADMIN' }) as never;
    await expect(runGuard()).resolves.toBe(true);
  });

  it('redirects non-ADMIN to /dashboard', async () => {
    auth.currentUser = signal({ role: 'INSTRUCTOR' }) as never;
    await runGuard();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
  });

  it('redirects unauthenticated to /login with redirect param', async () => {
    auth.currentUser = signal(null) as never;
    await runGuard();
    expect(router.createUrlTree).toHaveBeenCalledWith(
      ['/login'],
      { queryParams: { redirect: '/admin/instructor-applications' } },
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-admin`
Expected: FAIL — guard module not found.

- [ ] **Step 3: Implement the guard**

Create `libs/web-admin/src/lib/admin-role.guard.ts`:

```ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '@learnwren/web-auth';

export const adminRoleGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.currentUser() === undefined) {
    await auth.refresh();
  }

  const user = auth.currentUser();
  if (!user) {
    return router.createUrlTree(['/login'], {
      queryParams: { redirect: state.url },
    });
  }
  if (user.role !== 'ADMIN') {
    return router.createUrlTree(['/dashboard']);
  }
  return true;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test web-admin`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-admin/src/lib/admin-role.guard.ts libs/web-admin/src/lib/admin-role.guard.spec.ts
git commit -m "feat(web-admin): adminRoleGuard"
```

---

## Task 11: web-admin — AdminInstructorApplicationsService

**Files:**
- Create: `libs/web-admin/src/lib/admin-instructor-applications.service.ts`
- Test: `libs/web-admin/src/lib/admin-instructor-applications.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web-admin/src/lib/admin-instructor-applications.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it, afterEach } from 'vitest';

import { AdminInstructorApplicationsService } from './admin-instructor-applications.service';

describe('AdminInstructorApplicationsService', () => {
  let svc: AdminInstructorApplicationsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(AdminInstructorApplicationsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('list GETs the admin queue', async () => {
    const p = svc.list();
    const req = http.expectOne('/api/admin/instructor-applications');
    expect(req.request.method).toBe('GET');
    req.flush({ applications: [] });
    await expect(p).resolves.toEqual({ applications: [] });
  });

  it('approve POSTs to the approve endpoint', async () => {
    const p = svc.approve('u1');
    const req = http.expectOne('/api/admin/instructor-applications/u1/approve');
    expect(req.request.method).toBe('POST');
    req.flush({ status: 'APPROVED' });
    await expect(p).resolves.toEqual({ status: 'APPROVED' });
  });

  it('decline POSTs to the decline endpoint', async () => {
    const p = svc.decline('u1');
    const req = http.expectOne('/api/admin/instructor-applications/u1/decline');
    expect(req.request.method).toBe('POST');
    req.flush({ status: 'DECLINED' });
    await expect(p).resolves.toEqual({ status: 'DECLINED' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-admin`
Expected: FAIL — service module not found.

- [ ] **Step 3: Implement the service**

Create `libs/web-admin/src/lib/admin-instructor-applications.service.ts`:

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  InstructorApplicationView,
  PendingInstructorApplicationsResponse,
} from '@learnwren/shared-data-models';

const BASE = '/api/admin/instructor-applications';

@Injectable({ providedIn: 'root' })
export class AdminInstructorApplicationsService {
  private readonly http = inject(HttpClient);

  list(): Promise<PendingInstructorApplicationsResponse> {
    return firstValueFrom(this.http.get<PendingInstructorApplicationsResponse>(BASE));
  }

  approve(uid: string): Promise<InstructorApplicationView> {
    return firstValueFrom(
      this.http.post<InstructorApplicationView>(`${BASE}/${uid}/approve`, {}),
    );
  }

  decline(uid: string): Promise<InstructorApplicationView> {
    return firstValueFrom(
      this.http.post<InstructorApplicationView>(`${BASE}/${uid}/decline`, {}),
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test web-admin`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-admin/src/lib/admin-instructor-applications.service.ts libs/web-admin/src/lib/admin-instructor-applications.service.spec.ts
git commit -m "feat(web-admin): AdminInstructorApplicationsService"
```

---

## Task 12: web-admin — page component + routes + barrel

**Files:**
- Create: `libs/web-admin/src/lib/admin-instructor-applications-page/admin-instructor-applications-page.component.ts`
- Create: `.../admin-instructor-applications-page.component.html`
- Test: `.../admin-instructor-applications-page.component.spec.ts`
- Create: `libs/web-admin/src/lib/admin.routes.ts`
- Modify: `libs/web-admin/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `.../admin-instructor-applications-page.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminInstructorApplicationsService } from '../admin-instructor-applications.service';
import { AdminInstructorApplicationsPageComponent } from './admin-instructor-applications-page.component';

function row(uid: string) {
  return {
    uid,
    displayName: 'Ada',
    email: 'ada@example.com',
    statement: 's',
    expertise: 'e',
    createdAt: '2026-05-29T00:00:00.000Z',
  };
}

describe('AdminInstructorApplicationsPageComponent', () => {
  let svc: {
    list: ReturnType<typeof vi.fn>;
    approve: ReturnType<typeof vi.fn>;
    decline: ReturnType<typeof vi.fn>;
  };

  async function setup() {
    TestBed.configureTestingModule({
      imports: [AdminInstructorApplicationsPageComponent],
      providers: [{ provide: AdminInstructorApplicationsService, useValue: svc }],
    });
    const fixture = TestBed.createComponent(AdminInstructorApplicationsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    svc = {
      list: vi.fn(async () => ({ applications: [row('u1'), row('u2')] })),
      approve: vi.fn(async () => ({ status: 'APPROVED' })),
      decline: vi.fn(async () => ({ status: 'DECLINED' })),
    };
  });

  it('loads and renders the pending queue', async () => {
    const fixture = await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ada@example.com');
    expect(svc.list).toHaveBeenCalled();
  });

  it('shows the empty state when there are no applications', async () => {
    svc.list = vi.fn(async () => ({ applications: [] }));
    const fixture = await setup();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No pending applications');
  });

  it('approve removes the row on success', async () => {
    const fixture = await setup();
    const comp = fixture.componentInstance;
    await comp.approve('u1');
    fixture.detectChanges();
    expect(svc.approve).toHaveBeenCalledWith('u1');
    expect(comp.applications().some((a) => a.uid === 'u1')).toBe(false);
    expect(comp.applications().some((a) => a.uid === 'u2')).toBe(true);
  });

  it('decline removes the row on success', async () => {
    const fixture = await setup();
    const comp = fixture.componentInstance;
    await comp.decline('u2');
    expect(svc.decline).toHaveBeenCalledWith('u2');
    expect(comp.applications().some((a) => a.uid === 'u2')).toBe(false);
  });

  it('surfaces a per-row error and keeps the row when the action fails', async () => {
    svc.approve = vi.fn(async () => {
      throw { error: { error: { code: 'APPLICATION_NOT_PENDING' } } };
    });
    const fixture = await setup();
    const comp = fixture.componentInstance;
    await comp.approve('u1');
    expect(comp.applications().some((a) => a.uid === 'u1')).toBe(true);
    expect(comp.rowError('u1')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-admin`
Expected: FAIL — component module not found.

- [ ] **Step 3: Implement the component**

Create `.../admin-instructor-applications-page.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';

import type { PendingInstructorApplicationView } from '@learnwren/shared-data-models';

import { AdminInstructorApplicationsService } from '../admin-instructor-applications.service';

@Component({
  selector: 'lib-admin-instructor-applications-page',
  standalone: true,
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-instructor-applications-page.component.html',
})
export class AdminInstructorApplicationsPageComponent implements OnInit {
  private readonly svc = inject(AdminInstructorApplicationsService);

  readonly applications = signal<PendingInstructorApplicationView[]>([]);
  readonly loading = signal(true);
  readonly busy = signal<Set<string>>(new Set());
  private readonly errors = signal<Record<string, string>>({});

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.svc.list();
      this.applications.set(res.applications);
    } finally {
      this.loading.set(false);
    }
  }

  isBusy(uid: string): boolean {
    return this.busy().has(uid);
  }

  rowError(uid: string): string | undefined {
    return this.errors()[uid];
  }

  async approve(uid: string): Promise<void> {
    await this.resolve(uid, () => this.svc.approve(uid));
  }

  async decline(uid: string): Promise<void> {
    await this.resolve(uid, () => this.svc.decline(uid));
  }

  private async resolve(uid: string, action: () => Promise<unknown>): Promise<void> {
    this.setBusy(uid, true);
    this.clearError(uid);
    try {
      await action();
      this.applications.update((rows) => rows.filter((r) => r.uid !== uid));
    } catch (err) {
      this.errors.update((e) => ({ ...e, [uid]: this.messageFor(err) }));
    } finally {
      this.setBusy(uid, false);
    }
  }

  private messageFor(err: unknown): string {
    const code = (err as { error?: { error?: { code?: string } } })?.error?.error?.code;
    if (code === 'APPLICANT_NOT_VERIFIED') {
      return 'Applicant must verify their email before approval.';
    }
    if (code === 'APPLICATION_NOT_PENDING') {
      return 'This application was already resolved. Refresh to update the queue.';
    }
    return 'Something went wrong. Please try again.';
  }

  private setBusy(uid: string, on: boolean): void {
    this.busy.update((s) => {
      const next = new Set(s);
      if (on) next.add(uid);
      else next.delete(uid);
      return next;
    });
  }

  private clearError(uid: string): void {
    this.errors.update((e) => {
      const next = { ...e };
      delete next[uid];
      return next;
    });
  }
}
```

Create `.../admin-instructor-applications-page.component.html`:

```html
<section class="mx-auto max-w-3xl px-6 py-8">
  <h1 class="text-xl font-semibold text-ink">Instructor applications</h1>

  @if (loading()) {
    <p class="mt-6 text-sm text-muted">Loading…</p>
  } @else if (applications().length === 0) {
    <p class="mt-6 text-sm text-muted">No pending applications.</p>
  } @else {
    <ul class="mt-6 flex flex-col gap-4">
      @for (app of applications(); track app.uid) {
        <li class="rounded-lg border border-line p-4">
          <div class="flex items-baseline justify-between gap-4">
            <div>
              <p class="font-medium text-ink">{{ app.displayName }}</p>
              <p class="text-sm text-muted">{{ app.email }}</p>
            </div>
            <p class="text-xs text-muted">{{ app.createdAt | date: 'mediumDate' }}</p>
          </div>
          <p class="mt-3 text-sm text-ink"><span class="font-medium">Statement:</span> {{ app.statement }}</p>
          <p class="mt-1 text-sm text-ink"><span class="font-medium">Expertise:</span> {{ app.expertise }}</p>

          @if (rowError(app.uid); as err) {
            <p class="mt-2 text-sm text-red-600" role="alert">{{ err }}</p>
          }

          <div class="mt-4 flex gap-2">
            <button
              type="button"
              class="lw-btn lw-btn-primary"
              [disabled]="isBusy(app.uid)"
              (click)="approve(app.uid)"
            >
              Approve
            </button>
            <button
              type="button"
              class="lw-btn lw-btn-ghost"
              [disabled]="isBusy(app.uid)"
              (click)="decline(app.uid)"
            >
              Decline
            </button>
          </div>
        </li>
      }
    </ul>
  }
</section>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test web-admin`
Expected: PASS (all component tests).

- [ ] **Step 5: Add the routes + barrel**

Create `libs/web-admin/src/lib/admin.routes.ts`:

```ts
import type { Route } from '@angular/router';

import { adminRoleGuard } from './admin-role.guard';

export const adminRoutes: Route[] = [
  {
    path: 'admin',
    canMatch: [adminRoleGuard],
    children: [
      {
        path: 'instructor-applications',
        loadComponent: () =>
          import(
            './admin-instructor-applications-page/admin-instructor-applications-page.component'
          ).then((m) => m.AdminInstructorApplicationsPageComponent),
      },
      { path: '', pathMatch: 'full', redirectTo: 'instructor-applications' },
    ],
  },
];
```

Set `libs/web-admin/src/index.ts` to:

```ts
export { adminRoutes } from './lib/admin.routes';
```

- [ ] **Step 6: Verify + commit**

Run: `pnpm nx test web-admin && pnpm nx lint web-admin`
Expected: PASS.

```bash
git add libs/web-admin/src
git commit -m "feat(web-admin): instructor-applications queue page + routes"
```

---

## Task 13: Wire admin routes + nav into the web app

**Files:**
- Modify: `apps/web/src/app/app.routes.ts`
- Modify: `apps/web/src/app/app.html`
- Test: `apps/web/src/app/app.spec.ts`

- [ ] **Step 1: Write the failing test (nav link)**

Add these two tests to the `describe('App', ...)` block in `apps/web/src/app/app.spec.ts` (they reuse the existing `configure(...)` helper, which already accepts `{ displayName, role }`):

```ts
  it('shows the Admin nav link for an admin', async () => {
    configure({ displayName: 'Etta Wren', role: 'ADMIN' });
    await TestBed.inject(Router).navigateByUrl('/catalog');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'a[routerLink="/admin/instructor-applications"]',
      ),
    ).not.toBeNull();
  });

  it('hides the Admin nav link for an instructor', async () => {
    configure({ displayName: 'Etta Wren', role: 'INSTRUCTOR' });
    await TestBed.inject(Router).navigateByUrl('/catalog');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'a[routerLink="/admin/instructor-applications"]',
      ),
    ).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web`
Expected: FAIL — no Admin link in the template yet.

- [ ] **Step 3: Add the route**

In `apps/web/src/app/app.routes.ts`:
- Add the import: `import { adminRoutes } from '@learnwren/web-admin';`
- Add `...adminRoutes,` to the `appRoutes` array, immediately after `...coursesRoutes,`.

- [ ] **Step 4: Add the nav link**

In `apps/web/src/app/app.html`, inside the authenticated `<nav>` block, after the INSTRUCTOR "My Courses" `@if`, add:

```html
        @if (auth.currentUser()?.role === 'ADMIN') {
          <a routerLink="/admin/instructor-applications" class="lw-btn lw-btn-ghost">Admin</a>
        }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test web`
Expected: PASS.

- [ ] **Step 6: Type-check the web app build inputs**

Run: `pnpm nx lint web`
Expected: PASS (the `@learnwren/web-admin` import resolves via the tsconfig path).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/app.routes.ts apps/web/src/app/app.html apps/web/src/app/app.spec.ts
git commit -m "feat(web): mount admin routes + ADMIN nav link"
```

---

## Task 14: End-to-end coverage

**Files:**
- Modify: `apps/api-e2e/src/_helpers/auth.ts`
- Create: `apps/api-e2e/src/instructor-application-admin.e2e-spec.ts`
- Create: `apps/web-e2e/src/admin-instructor-applications.spec.ts`

- [ ] **Step 1: Add an admin e2e helper**

In `apps/api-e2e/src/_helpers/auth.ts`, add (mirrors `registerAndPromoteInstructor`):

```ts
/** Register a STUDENT, mark verified, promote to ADMIN, and re-mint the session cookie. */
export async function registerAndPromoteAdmin(
  request: import('@playwright/test').APIRequestContext,
): Promise<SessionContext> {
  const email = uniqueEmail('admin');
  const password = 'Aa1!aaaaaaaa';
  const reg = await postWithRetryOn429(request, `${API_BASE}/auth/register`, {
    email,
    password,
    displayName: 'Adm',
  });
  expect(reg.status()).toBe(201);
  const { uid } = (await reg.json()) as { uid: string };

  await admin.auth().updateUser(uid, { emailVerified: true });
  await admin.auth().setCustomUserClaims(uid, { role: 'ADMIN' });
  await admin.firestore().collection('users').doc(uid).update({ role: 'ADMIN' });

  const login = await postWithRetryOn429(request, `${API_BASE}/auth/login`, { email, password });
  expect(login.status()).toBe(200);
  const setCookie = login.headers()['set-cookie'];
  const match = setCookie!.match(/__session=([^;]+)/);
  expect(match).not.toBeNull();
  return { uid, cookieHeader: `__session=${match![1]}` };
}
```

- [ ] **Step 2: Write the api-e2e flow**

Create `apps/api-e2e/src/instructor-application-admin.e2e-spec.ts`:

```ts
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

async function applyAsStudent(
  request: import('@playwright/test').APIRequestContext,
  cookieHeader: string,
): Promise<void> {
  const res = await request.post(`${API_BASE}/profile/instructor-application`, {
    headers: { Cookie: cookieHeader },
    data: { statement: 'I want to teach', expertise: 'Mathematics' },
  });
  expect(res.status()).toBe(201);
}

test('admin sees, then approves, a pending application', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const student = await registerStudent(ctx);
    await applyAsStudent(ctx, student.cookieHeader);
    // The verified gate: approval requires a verified applicant email.
    await admin.auth().updateUser(student.uid, { emailVerified: true });

    const adminSession = await registerAndPromoteAdmin(ctx);
    const hdr = { Cookie: adminSession.cookieHeader };

    const list = await ctx.get(`${API_BASE}/admin/instructor-applications`, { headers: hdr });
    expect(list.status()).toBe(200);
    const body = (await list.json()) as { applications: Array<{ uid: string; email: string }> };
    expect(body.applications.some((a) => a.uid === student.uid)).toBe(true);

    const approve = await ctx.post(
      `${API_BASE}/admin/instructor-applications/${student.uid}/approve`,
      { headers: hdr },
    );
    expect(approve.status()).toBe(201);
    expect((await approve.json()).status).toBe('APPROVED');

    // The application is now resolved; a second approve is a 409.
    const again = await ctx.post(
      `${API_BASE}/admin/instructor-applications/${student.uid}/approve`,
      { headers: hdr },
    );
    expect(again.status()).toBe(409);
    expect((await again.json()).error.code).toBe('APPLICATION_NOT_PENDING');

    // The applicant's role is now INSTRUCTOR.
    const userDoc = await admin.firestore().collection('users').doc(student.uid).get();
    expect(userDoc.data()?.['role']).toBe('INSTRUCTOR');
  } finally {
    await ctx.dispose();
  }
});

test('approve is refused for an unverified applicant', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const student = await registerStudent(ctx); // not email-verified
    await applyAsStudent(ctx, student.cookieHeader);

    const adminSession = await registerAndPromoteAdmin(ctx);
    const res = await ctx.post(
      `${API_BASE}/admin/instructor-applications/${student.uid}/approve`,
      { headers: { Cookie: adminSession.cookieHeader } },
    );
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe('APPLICANT_NOT_VERIFIED');
  } finally {
    await ctx.dispose();
  }
});

test('non-admin is forbidden from the admin queue', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const instructor = await registerAndPromoteInstructor(ctx);
    const res = await ctx.get(`${API_BASE}/admin/instructor-applications`, {
      headers: { Cookie: instructor.cookieHeader },
    });
    expect(res.status()).toBe(403);
  } finally {
    await ctx.dispose();
  }
});

test('admin can decline a pending application', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const student = await registerStudent(ctx);
    await applyAsStudent(ctx, student.cookieHeader);

    const adminSession = await registerAndPromoteAdmin(ctx);
    const res = await ctx.post(
      `${API_BASE}/admin/instructor-applications/${student.uid}/decline`,
      { headers: { Cookie: adminSession.cookieHeader } },
    );
    expect(res.status()).toBe(201);
    expect((await res.json()).status).toBe('DECLINED');
  } finally {
    await ctx.dispose();
  }
});
```

> POST responses are 201 by Nest's default for `@Post()` handlers. If the api applies a global `@HttpCode(200)` convention for action-style POSTs, adjust the expected codes to match the codebase — check a sibling spec (e.g. `publish.e2e-spec.ts`) for the convention before running.

- [ ] **Step 3: Run the api-e2e suite (requires emulators + api)**

Run: `pnpm nx e2e api-e2e -- --grep "instructor-application-admin"` (or the project's documented e2e command).
Expected: PASS.

- [ ] **Step 4: Write the web-e2e walkthrough**

Create `apps/web-e2e/src/admin-instructor-applications.spec.ts`: an ADMIN logs in, navigates to `/admin/instructor-applications`, sees a seeded pending application row, clicks Approve, and the row disappears (and/or the empty state shows). Follow the existing web-e2e auth/seeding patterns (see `apps/web-e2e/src/learn.spec.ts` for how roles/sessions are established). Also assert a STUDENT visiting `/admin/instructor-applications` is redirected away (to `/dashboard`).

- [ ] **Step 5: Run the web-e2e suite**

Run: `pnpm nx e2e web-e2e -- --grep "admin instructor"` (or the documented command).
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api-e2e/src/_helpers/auth.ts apps/api-e2e/src/instructor-application-admin.e2e-spec.ts apps/web-e2e/src/admin-instructor-applications.spec.ts
git commit -m "test(e2e): admin instructor-application review flow"
```

---

## Task 15: Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/quality/spec-drift-report.md`
- Modify: `docs/USER_GUIDE.md`

- [ ] **Step 1: Update the authoritative feature record**

In `README.md`, add US-08-03 (admin review of instructor applications) to the list of wired-up slices, noting it is the first admin surface and that ADMIN is created via `pnpm tools:promote-to-admin <email>`.

- [ ] **Step 2: Update the drift report**

In `docs/quality/spec-drift-report.md`, under EP-08, mark US-08-03 as **implemented**, referencing this plan and the spec. Note the deliberate cuts (pending-only queue, no decline reason) and that approval also remains available via the instructor CLI.

- [ ] **Step 3: Update the user guide**

In `docs/USER_GUIDE.md`, document the admin flow: how an admin reaches the queue, what approve/decline do, the applicant email, and the re-login-for-role-change note. Note the remaining EP-08 stories are still deferred.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/quality/spec-drift-report.md docs/USER_GUIDE.md
git commit -m "docs: record US-08-03 admin instructor-application review"
```

---

## Final verification

- [ ] **Run the full affected suite**

Run: `pnpm nx run-many -t test lint --projects=shared-data-models,api-auth,api-profile,web-admin,web`
Expected: all PASS.

- [ ] **Confirm no `test.fixme` / skipped admin tests, and the new lib is in the graph**

Run: `pnpm nx show projects | grep web-admin`
Expected: `web-admin` listed.

---

## Notes for the executor

- **Worktree:** Per project preference, isolate this work in a git worktree branched from local `HEAD` (not origin), symlink `node_modules` to the parent, and never `git add -A` (the symlink evades `.gitignore`). Land via a local `--no-ff` merge to `main` when complete (use the `superpowers:finishing-a-development-branch` skill).
- **Mutation bar:** `api-profile` and `web-admin` have no Stryker config, so the ≥80% mutation score isn't tooled here — the specs above are written mutation-conscious (asserting exact arguments and state transitions, not just "was called"). Keep that discipline for any added tests.
- **Re-login caveat:** approval sets a custom claim that only takes effect on the applicant's next sign-in; this is expected and surfaced in the approval email.
```
