# UC-01-03 Slice D — Change Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authenticated user change their password from `/settings/profile` (UC-01-03 ext 3c/3c-3a/3c-4a) — re-authenticate with the current password, enforce the existing complexity policy, apply the change, email a "password changed" notice, and force re-login.

**Architecture:** A new `password/` submodule under `libs/api-profile` mirrors the existing `email/` submodule (controller + service + per-feature exception filter + typed errors + `@Allow()`-only DTO). It reuses `FirebaseAuthRestClient` (re-auth), `PasswordPolicyService` (complexity), `FIREBASE_AUTH.updateUser`/`revokeRefreshTokens` (the change + force-logout), `SessionCookieHelper` (cookie clear), and `EMAIL_TRANSPORT` (notification). The web adds a collapsed "Change password" section to the profile page and a `?passwordChanged=1` login notice.

**Tech Stack:** NestJS 11 (api-profile / api-auth), Angular 21 (web-profile / web-auth), Firestore + Firebase Admin/Auth REST, vitest (unit), Playwright (api-e2e + web-e2e), Nx + pnpm.

**Worktree:** This plan executes in `/Volumes/Artie-Storage/github-repos/learnwren-slice-d` on branch `feat/uc-01-03-slice-d-password-change`. All `nx`/`git` commands run from there.

---

## File Structure

**Create:**
- `libs/api-profile/src/lib/password/errors/password-change-error.codes.ts`
- `libs/api-profile/src/lib/password/errors/password-change.exception.ts` (+ `.spec.ts`)
- `libs/api-profile/src/lib/password/password.exception-filter.ts` (+ `.spec.ts`)
- `libs/api-profile/src/lib/password/dto/change-password.dto.ts`
- `libs/api-profile/src/lib/password/password-change.service.ts` (+ `.spec.ts`)
- `libs/api-profile/src/lib/password/password-change.controller.ts` (+ `.spec.ts`)
- `libs/web-profile/src/lib/password/password-change.service.ts` (+ `.spec.ts`)
- `apps/api-e2e/src/password-change.e2e-spec.ts`

**Modify:**
- `libs/shared-data-models/src/lib/profile.ts` (+ `profile.spec.ts`) — wire types, error codes, `PolicyRequirement`
- `libs/api-auth/src/lib/password-policy.service.ts` — re-export `PolicyRequirement` from shared
- `libs/api-auth/src/lib/auth.module.ts` — export `PasswordPolicyService`
- `libs/api-auth/src/index.ts` — re-export `PasswordPolicyService` + types
- `libs/api-auth/src/lib/email-transport/email-transport.ts` — `sendPasswordChangedEmail`
- `libs/api-auth/src/lib/email-transport/console-email-transport.ts` (+ `.spec.ts`) — impl + `OutboxEntry['kind']`
- `libs/api-auth/src/lib/email-transport/smtp-email-transport.ts` — impl
- `libs/api-auth/src/lib/auth.controller.ts` — `_test/last-email` `kind` union
- `libs/api-profile/src/lib/profile.module.ts` — register controller/service/filter
- `libs/web-profile/src/lib/profile-page/profile-page.component.ts` (+ `.html`, `.spec.ts`) — section
- `libs/web-auth/src/lib/login-page/login-page.component.ts` (+ `.html`, `.spec.ts`) — notice
- `apps/web-e2e/src/` — a Playwright spec for the form/redirect
- `README.md`, `docs/USER_GUIDE.md`, `docs/use-cases/01-user-identity-and-access.md`, `docs/quality/spec-drift-report.md`

---

## Task 1: Shared wire contract (`shared-data-models`)

**Files:**
- Modify: `libs/shared-data-models/src/lib/profile.ts`
- Test: `libs/shared-data-models/src/lib/profile.spec.ts`

- [ ] **Step 1: Add the failing test**

Append to `libs/shared-data-models/src/lib/profile.spec.ts` (inside the existing `describe('profile types', ...)` block, before its closing `});`):

```ts
  it('NEW_PASSWORD_WEAK / PASSWORD_UNCHANGED / PASSWORD_CHANGE_FAILED are wire codes', () => {
    expect(NEW_PASSWORD_WEAK).toBe('NEW_PASSWORD_WEAK');
    expect(PASSWORD_UNCHANGED).toBe('PASSWORD_UNCHANGED');
    expect(PASSWORD_CHANGE_FAILED).toBe('PASSWORD_CHANGE_FAILED');
  });

  it('ChangePasswordRequest shape compiles', () => {
    const req: ChangePasswordRequest = { currentPassword: 'a', newPassword: 'b' };
    expect(req.newPassword).toBe('b');
  });

  it('PasswordChangeErrorBody carries optional unmetRequirements', () => {
    const body: PasswordChangeErrorBody = {
      error: {
        code: 'NEW_PASSWORD_WEAK',
        message: 'weak',
        details: { field: 'newPassword', unmetRequirements: ['MIN_LENGTH'] },
      },
    };
    expect(body.error.details?.unmetRequirements).toEqual(['MIN_LENGTH']);
  });
```

And add to the import block at the top of `profile.spec.ts`:

```ts
  NEW_PASSWORD_WEAK,
  PASSWORD_UNCHANGED,
  PASSWORD_CHANGE_FAILED,
  type ChangePasswordRequest,
  type PasswordChangeErrorBody,
```

- [ ] **Step 2: Run the test, expect failure**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx test shared-data-models`
Expected: FAIL — `NEW_PASSWORD_WEAK` / `ChangePasswordRequest` not exported.

- [ ] **Step 3: Implement in `profile.ts`**

Append to the end of `libs/shared-data-models/src/lib/profile.ts`:

```ts
/**
 * Canonical password-complexity requirement union (UC-01-01 step 4 policy).
 * This is the wire contract surfaced in NEW_PASSWORD_WEAK details and the
 * registration WEAK_PASSWORD details. `api-auth`'s PasswordPolicyService
 * re-exports this type so the backend has a single source of truth.
 */
export type PolicyRequirement =
  | 'MIN_LENGTH'
  | 'UPPERCASE'
  | 'LOWERCASE'
  | 'DIGIT'
  | 'SPECIAL';

/** Body of `POST /api/profile/password` (UC-01-03 ext 3c). */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** Wire error codes returned by `POST /api/profile/password`. */
// CURRENT_PASSWORD_INVALID is already declared above (shared with email change).
export const NEW_PASSWORD_WEAK = 'NEW_PASSWORD_WEAK';
export const PASSWORD_UNCHANGED = 'PASSWORD_UNCHANGED';
export const PASSWORD_CHANGE_FAILED = 'PASSWORD_CHANGE_FAILED';

export type PasswordChangeErrorCode =
  | typeof CURRENT_PASSWORD_INVALID
  | typeof NEW_PASSWORD_WEAK
  | typeof PASSWORD_UNCHANGED
  | typeof PASSWORD_CHANGE_FAILED;

/** Body of a non-2xx from `POST /api/profile/password`. */
export interface PasswordChangeErrorBody {
  error: {
    code: PasswordChangeErrorCode;
    message: string;
    details?: {
      field?: 'currentPassword' | 'newPassword';
      unmetRequirements?: PolicyRequirement[];
    };
  };
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx test shared-data-models`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d
git add libs/shared-data-models/src/lib/profile.ts libs/shared-data-models/src/lib/profile.spec.ts
git commit -m "feat(shared-data-models): password-change wire types + PolicyRequirement"
```

---

## Task 2: Export `PasswordPolicyService` and unify `PolicyRequirement` (`api-auth`)

**Files:**
- Modify: `libs/api-auth/src/lib/password-policy.service.ts`
- Modify: `libs/api-auth/src/lib/auth.module.ts:43-49` (the `exports` array)
- Modify: `libs/api-auth/src/index.ts`

> `libs/api-auth/src/lib/errors/auth.exception.ts` imports `PolicyRequirement` from `'../password-policy.service'`. Re-exporting the type from the service keeps that import valid — do **not** change `auth.exception.ts`.

- [ ] **Step 1: Re-export `PolicyRequirement` from shared in the service**

In `libs/api-auth/src/lib/password-policy.service.ts`, replace the local union:

```ts
export type PolicyRequirement =
  | 'MIN_LENGTH'
  | 'UPPERCASE'
  | 'LOWERCASE'
  | 'DIGIT'
  | 'SPECIAL';
```

with a re-export of the canonical type:

```ts
export type { PolicyRequirement } from '@learnwren/shared-data-models';
import type { PolicyRequirement } from '@learnwren/shared-data-models';
```

(Keep the `REQUIREMENT_ORDER: PolicyRequirement[]` const and everything else unchanged.)

- [ ] **Step 2: Add to `AuthModule.exports`**

In `libs/api-auth/src/lib/auth.module.ts`, add `PasswordPolicyService` to the `exports` array (it is already in `providers`):

```ts
  exports: [
    FirebaseSessionGuard,
    InstructorRoleGuard,
    EMAIL_TRANSPORT,
    FirebaseAuthRestClient,
    SessionCookieHelper,
    PasswordPolicyService,
  ],
```

- [ ] **Step 3: Re-export from the public index**

Append to `libs/api-auth/src/index.ts`:

```ts
export { PasswordPolicyService } from './lib/password-policy.service';
export type { PolicyRequirement, PasswordPolicyResult } from './lib/password-policy.service';
```

- [ ] **Step 4: Verify the existing api-auth tests + typecheck still pass**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx test api-auth && pnpm nx typecheck api-auth`
Expected: PASS (the password-policy + auth.exception specs are unaffected; the type is structurally identical).

- [ ] **Step 5: Commit**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d
git add libs/api-auth/src/lib/password-policy.service.ts libs/api-auth/src/lib/auth.module.ts libs/api-auth/src/index.ts
git commit -m "feat(api-auth): export PasswordPolicyService; PolicyRequirement sourced from shared-data-models"
```

---

## Task 3: `sendPasswordChangedEmail` transport surface (`api-auth`)

**Files:**
- Modify: `libs/api-auth/src/lib/email-transport/email-transport.ts`
- Modify: `libs/api-auth/src/lib/email-transport/console-email-transport.ts`
- Test: `libs/api-auth/src/lib/email-transport/console-email-transport.spec.ts`
- Modify: `libs/api-auth/src/lib/email-transport/smtp-email-transport.ts`
- Modify: `libs/api-auth/src/lib/auth.controller.ts:155` (the `_test/last-email` `kind` union)

- [ ] **Step 1: Add the failing console-transport test**

Append to `libs/api-auth/src/lib/email-transport/console-email-transport.spec.ts` (inside the top-level `describe`):

```ts
  it('records a password-changed notification retrievable via lastSentTo', async () => {
    const transport = new ConsoleEmailTransport();
    await transport.sendPasswordChangedEmail({ to: 'user@example.com' });
    const entry = transport.lastSentTo('user@example.com', 'password-changed');
    expect(entry).toBeDefined();
    expect(entry?.kind).toBe('password-changed');
    expect(entry?.url).toBe('');
  });
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx test api-auth -- console-email-transport`
Expected: FAIL — `sendPasswordChangedEmail` does not exist.

- [ ] **Step 3: Extend the interface**

In `libs/api-auth/src/lib/email-transport/email-transport.ts`, add the input interface and method:

```ts
export interface PasswordChangedEmailInput {
  to: string; // the account address (unchanged by this flow)
}
```

and add to the `EmailTransport` interface:

```ts
  sendPasswordChangedEmail(input: PasswordChangedEmailInput): Promise<void>;
```

- [ ] **Step 4: Implement in `ConsoleEmailTransport`**

In `libs/api-auth/src/lib/email-transport/console-email-transport.ts`:

1. Extend the `OutboxEntry['kind']` union:

```ts
  kind: 'unlock' | 'verification' | 'password-reset' | 'email-change' | 'password-changed';
```

2. Add `PasswordChangedEmailInput` to the type import from `./email-transport`.

3. Add the method (a notification with no action link — `url: ''`):

```ts
  async sendPasswordChangedEmail(input: PasswordChangedEmailInput): Promise<void> {
    this.logger.log(`[password-changed-email] to=${input.to}`);
    this.append({ kind: 'password-changed', to: input.to, url: '', sentAt: new Date() });
  }
```

- [ ] **Step 5: Implement in `SmtpEmailTransport`**

In `libs/api-auth/src/lib/email-transport/smtp-email-transport.ts`, add `PasswordChangedEmailInput` to the type import and add the method:

```ts
  async sendPasswordChangedEmail(input: PasswordChangedEmailInput): Promise<void> {
    const text =
      `The password on your Learn Wren account was just changed.\n\n` +
      `If this was you, no action is needed. You've been signed out on all devices ` +
      `and can sign in again with your new password.\n\n` +
      `If you did NOT change your password, reset it immediately using "Forgot password" ` +
      `on the sign-in page.`;

    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: input.to,
        subject: 'Your Learn Wren password was changed',
        text,
      });
      this.logger.log(`[password-changed-email] sent to=${input.to}`);
    } catch (err) {
      this.logger.error(`[password-changed-email] send failed to=${input.to}: ${String(err)}`);
      throw err;
    }
  }
```

- [ ] **Step 6: Extend the `_test/last-email` `kind` union**

In `libs/api-auth/src/lib/auth.controller.ts`, update the `@Query('kind')` type (line ~155):

```ts
    @Query('kind') kind: 'unlock' | 'verification' | 'password-reset' | 'email-change' | 'password-changed',
```

- [ ] **Step 7: Run tests + typecheck**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx test api-auth && pnpm nx typecheck api-auth`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d
git add libs/api-auth/src/lib/email-transport libs/api-auth/src/lib/auth.controller.ts
git commit -m "feat(api-auth): sendPasswordChangedEmail transport + password-changed outbox kind"
```

---

## Task 4: Error codes (`api-profile/password`)

**Files:**
- Create: `libs/api-profile/src/lib/password/errors/password-change-error.codes.ts`

- [ ] **Step 1: Create the file**

```ts
export const PASSWORD_CHANGE_ERROR_CODES = [
  'CURRENT_PASSWORD_INVALID',
  'NEW_PASSWORD_WEAK',
  'PASSWORD_UNCHANGED',
  'PASSWORD_CHANGE_FAILED',
] as const;

export type PasswordChangeErrorCode = (typeof PASSWORD_CHANGE_ERROR_CODES)[number];
```

- [ ] **Step 2: Commit**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d
git add libs/api-profile/src/lib/password/errors/password-change-error.codes.ts
git commit -m "feat(api-profile): password-change error codes"
```

---

## Task 5: Exception classes (`api-profile/password`)

**Files:**
- Create: `libs/api-profile/src/lib/password/errors/password-change.exception.ts`
- Test: `libs/api-profile/src/lib/password/errors/password-change.exception.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

import {
  CurrentPasswordInvalidException,
  NewPasswordWeakException,
  PasswordChangeException,
  PasswordChangeFailedException,
  PasswordUnchangedException,
} from './password-change.exception';

describe('password-change exceptions', () => {
  it('CURRENT_PASSWORD_INVALID maps to 400 on the currentPassword field', () => {
    const e = new CurrentPasswordInvalidException();
    expect(e).toBeInstanceOf(PasswordChangeException);
    expect(e.code).toBe('CURRENT_PASSWORD_INVALID');
    expect(e.status).toBe(400);
    expect(e.details).toEqual({ field: 'currentPassword' });
  });

  it('NEW_PASSWORD_WEAK carries the unmet requirements on the newPassword field', () => {
    const e = new NewPasswordWeakException(['MIN_LENGTH', 'DIGIT']);
    expect(e.code).toBe('NEW_PASSWORD_WEAK');
    expect(e.status).toBe(400);
    expect(e.details).toEqual({ field: 'newPassword', unmetRequirements: ['MIN_LENGTH', 'DIGIT'] });
  });

  it('PASSWORD_UNCHANGED maps to 400 on the newPassword field', () => {
    const e = new PasswordUnchangedException();
    expect(e.code).toBe('PASSWORD_UNCHANGED');
    expect(e.status).toBe(400);
    expect(e.details).toEqual({ field: 'newPassword' });
  });

  it('PASSWORD_CHANGE_FAILED maps to 500 with no details', () => {
    const e = new PasswordChangeFailedException();
    expect(e.code).toBe('PASSWORD_CHANGE_FAILED');
    expect(e.status).toBe(500);
    expect(e.details).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx test api-profile -- password-change.exception`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type { PolicyRequirement } from '@learnwren/api-auth';

import type { PasswordChangeErrorCode } from './password-change-error.codes';

export class PasswordChangeException extends Error {
  constructor(
    public readonly code: PasswordChangeErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PasswordChangeException';
  }
}

export class CurrentPasswordInvalidException extends PasswordChangeException {
  constructor() {
    super('CURRENT_PASSWORD_INVALID', 'Current password is incorrect.', 400, {
      field: 'currentPassword',
    });
  }
}

export class NewPasswordWeakException extends PasswordChangeException {
  constructor(unmetRequirements: PolicyRequirement[]) {
    super('NEW_PASSWORD_WEAK', 'New password does not meet complexity requirements.', 400, {
      field: 'newPassword',
      unmetRequirements,
    });
  }
}

export class PasswordUnchangedException extends PasswordChangeException {
  constructor() {
    super('PASSWORD_UNCHANGED', 'New password must be different from the current password.', 400, {
      field: 'newPassword',
    });
  }
}

export class PasswordChangeFailedException extends PasswordChangeException {
  constructor(options?: ErrorOptions) {
    super(
      'PASSWORD_CHANGE_FAILED',
      'We could not change your password. Please try again.',
      500,
      undefined,
      options,
    );
  }
}
```

- [ ] **Step 4: Run it, expect pass**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx test api-profile -- password-change.exception`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d
git add libs/api-profile/src/lib/password/errors/password-change.exception.ts libs/api-profile/src/lib/password/errors/password-change.exception.spec.ts
git commit -m "feat(api-profile): password-change exception classes"
```

---

## Task 6: Exception filter (`api-profile/password`)

**Files:**
- Create: `libs/api-profile/src/lib/password/password.exception-filter.ts`
- Test: `libs/api-profile/src/lib/password/password.exception-filter.spec.ts`

> Mirrors `EmailChangeExceptionFilter` exactly, including the `AuthException` branch (so a guard-thrown `UnauthenticatedException` surfaces as `401`, not `500`) and the `HttpException` fall-through.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';

import { AuthException } from '@learnwren/api-auth';

import { PasswordChangeExceptionFilter } from './password.exception-filter';
import { NewPasswordWeakException } from './errors/password-change.exception';

function mockHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as never;
  return { host, status, json };
}

describe('PasswordChangeExceptionFilter', () => {
  it('serializes a PasswordChangeException with its code, status and details', () => {
    const { host, status, json } = mockHost();
    new PasswordChangeExceptionFilter().catch(new NewPasswordWeakException(['DIGIT']), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'NEW_PASSWORD_WEAK',
        message: 'New password does not meet complexity requirements.',
        details: { field: 'newPassword', unmetRequirements: ['DIGIT'] },
      },
    });
  });

  it('maps an AuthException (e.g. unauthenticated) to its own status', () => {
    const { host, status } = mockHost();
    new PasswordChangeExceptionFilter().catch(new AuthException('UNAUTHENTICATED', 'no', 401), host);
    expect(status).toHaveBeenCalledWith(401);
  });

  it('maps a generic HttpException via codeForStatus', () => {
    const { host, status, json } = mockHost();
    new PasswordChangeExceptionFilter().catch(new HttpException('nope', 404), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: { code: 'NOT_FOUND', message: 'nope' } });
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx test api-profile -- password.exception-filter`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement (clone of `email.exception-filter.ts`)**

```ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { AuthException } from '@learnwren/api-auth';
import { PasswordChangeException } from './errors/password-change.exception';

interface PasswordChangeErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

@Catch(PasswordChangeException, AuthException, HttpException)
export class PasswordChangeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('PasswordChangeExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof PasswordChangeException) {
      response.status(exception.status).json({
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details ? { details: exception.details } : {}),
        },
      } satisfies PasswordChangeErrorBody);
      return;
    }
    if (exception instanceof AuthException) {
      response.status(exception.status).json({
        error: { code: exception.code, message: exception.message },
      } satisfies PasswordChangeErrorBody);
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json({
        error: { code: codeForStatus(status), message: exception.message },
      } satisfies PasswordChangeErrorBody);
      return;
    }
    this.logger.error(
      exception instanceof Error ? exception.stack ?? exception.message : String(exception),
    );
    response.status(500).json({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    } satisfies PasswordChangeErrorBody);
  }
}

function codeForStatus(status: number): string {
  switch (status) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 409: return 'CONFLICT';
    default: return 'ERROR';
  }
}
```

- [ ] **Step 4: Run it, expect pass**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx test api-profile -- password.exception-filter`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d
git add libs/api-profile/src/lib/password/password.exception-filter.ts libs/api-profile/src/lib/password/password.exception-filter.spec.ts
git commit -m "feat(api-profile): password-change exception filter"
```

---

## Task 7: DTO (`api-profile/password`)

**Files:**
- Create: `libs/api-profile/src/lib/password/dto/change-password.dto.ts`

> `@Allow()`-only — NO length/format decorators. The global `ValidationPipe` runs with `whitelist: true, forbidNonWhitelisted: true`, so the fields must be whitelisted, but any length/format validator here would pre-empt the service's typed error codes with a generic `BAD_REQUEST`. All validation lives in `PasswordChangeService`.

- [ ] **Step 1: Create the file**

```ts
import { Allow } from 'class-validator';

/**
 * Type-shape only — @Allow() whitelists both fields for the global ValidationPipe
 * (whitelist + forbidNonWhitelisted) without adding length/format validators.
 * Validation logic lives in PasswordChangeService so it can emit the feature's
 * typed error codes (CURRENT_PASSWORD_INVALID, NEW_PASSWORD_WEAK, etc.) rather
 * than a generic BAD_REQUEST.
 */
export class ChangePasswordDto {
  @Allow()
  currentPassword!: string;

  @Allow()
  newPassword!: string;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d
git add libs/api-profile/src/lib/password/dto/change-password.dto.ts
git commit -m "feat(api-profile): change-password DTO (@Allow-only)"
```

---

## Task 8: `PasswordChangeService` (`api-profile/password`)

**Files:**
- Create: `libs/api-profile/src/lib/password/password-change.service.ts`
- Test: `libs/api-profile/src/lib/password/password-change.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';

import { AuthException } from '@learnwren/api-auth';
import type { UserId } from '@learnwren/shared-data-models';

import { PasswordChangeService } from './password-change.service';
import {
  CurrentPasswordInvalidException,
  NewPasswordWeakException,
  PasswordChangeFailedException,
  PasswordUnchangedException,
} from './errors/password-change.exception';

const UID = 'u1' as UserId;
const EMAIL = 'user@example.com';
const VALID_NEW = 'Bb2@bbbbbbbb';

function makeService(overrides: {
  signIn?: () => Promise<unknown>;
  policy?: () => { valid: boolean; unmet?: string[] };
  updateUser?: () => Promise<unknown>;
  sendEmail?: () => Promise<void>;
} = {}) {
  const auth = {
    updateUser: overrides.updateUser ?? vi.fn().mockResolvedValue(undefined),
    revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
  };
  const restClient = {
    signInWithPassword: overrides.signIn ?? vi.fn().mockResolvedValue({ idToken: 't' }),
  };
  const policy = {
    validate: overrides.policy ?? vi.fn().mockReturnValue({ valid: true }),
  };
  const transport = {
    sendPasswordChangedEmail: overrides.sendEmail ?? vi.fn().mockResolvedValue(undefined),
  };
  const svc = new PasswordChangeService(
    auth as never,
    restClient as never,
    policy as never,
    transport as never,
  );
  return { svc, auth, restClient, policy, transport };
}

describe('PasswordChangeService.changePassword', () => {
  const valid = { currentPassword: 'Aa1!aaaaaaaa', newPassword: VALID_NEW };

  it('maps a wrong current password to CURRENT_PASSWORD_INVALID and never updates', async () => {
    const signIn = vi.fn().mockRejectedValue(new AuthException('INVALID_CREDENTIALS', 'bad', 401));
    const { svc, auth } = makeService({ signIn });
    await expect(svc.changePassword(UID, EMAIL, valid)).rejects.toBeInstanceOf(
      CurrentPasswordInvalidException,
    );
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('maps a weak new password to NEW_PASSWORD_WEAK carrying the unmet list', async () => {
    const policy = vi.fn().mockReturnValue({ valid: false, unmet: ['MIN_LENGTH', 'DIGIT'] });
    const { svc, auth } = makeService({ policy });
    await expect(svc.changePassword(UID, EMAIL, { ...valid, newPassword: 'weak' }))
      .rejects.toMatchObject({ code: 'NEW_PASSWORD_WEAK', details: { unmetRequirements: ['MIN_LENGTH', 'DIGIT'] } });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('rejects when the new password equals the current one', async () => {
    const { svc, auth } = makeService();
    await expect(
      svc.changePassword(UID, EMAIL, { currentPassword: VALID_NEW, newPassword: VALID_NEW }),
    ).rejects.toBeInstanceOf(PasswordUnchangedException);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('on success updates the password, emails a notice, then revokes tokens', async () => {
    const { svc, auth, transport } = makeService();
    await svc.changePassword(UID, EMAIL, valid);
    expect(auth.updateUser).toHaveBeenCalledWith(UID, { password: VALID_NEW });
    expect(transport.sendPasswordChangedEmail).toHaveBeenCalledWith({ to: EMAIL });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith(UID);
  });

  it('swallows a notification-email failure (password already changed) and still revokes', async () => {
    const sendEmail = vi.fn().mockRejectedValue(new Error('smtp down'));
    const { svc, auth } = makeService({ sendEmail });
    await expect(svc.changePassword(UID, EMAIL, valid)).resolves.toBeUndefined();
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith(UID);
  });

  it('maps an unexpected updateUser failure to PASSWORD_CHANGE_FAILED', async () => {
    const updateUser = vi.fn().mockRejectedValue(new Error('boom'));
    const { svc } = makeService({ updateUser });
    await expect(svc.changePassword(UID, EMAIL, valid)).rejects.toBeInstanceOf(
      PasswordChangeFailedException,
    );
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx test api-profile -- password-change.service`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  AuthException,
  EMAIL_TRANSPORT,
  FirebaseAuthRestClient,
  PasswordPolicyService,
  type EmailTransport,
} from '@learnwren/api-auth';
import { FIREBASE_AUTH, type FirebaseAuthHandle } from '@learnwren/api-firebase';
import type { ChangePasswordRequest, UserId } from '@learnwren/shared-data-models';

import {
  CurrentPasswordInvalidException,
  NewPasswordWeakException,
  PasswordChangeFailedException,
  PasswordUnchangedException,
} from './errors/password-change.exception';

@Injectable()
export class PasswordChangeService {
  private readonly logger = new Logger('PasswordChangeService');

  constructor(
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle,
    private readonly restClient: FirebaseAuthRestClient,
    private readonly passwordPolicy: PasswordPolicyService,
    @Inject(EMAIL_TRANSPORT) private readonly emailTransport: EmailTransport,
  ) {}

  async changePassword(
    uid: UserId,
    currentEmail: string,
    input: ChangePasswordRequest,
  ): Promise<void> {
    await this.verifyCurrentPassword(currentEmail, input.currentPassword);

    const policy = this.passwordPolicy.validate(input.newPassword);
    if (!policy.valid) {
      throw new NewPasswordWeakException(policy.unmet);
    }
    if (input.newPassword === input.currentPassword) {
      throw new PasswordUnchangedException();
    }

    try {
      await this.auth.updateUser(uid, { password: input.newPassword });
    } catch (err) {
      this.logger.error(`[profile] password updateUser failed uid=${uid}: ${String(err)}`);
      throw new PasswordChangeFailedException(err instanceof Error ? { cause: err } : undefined);
    }

    // Best-effort: the password is already changed, so a notification failure
    // must not fail the request (that would mislead the user into retrying).
    try {
      await this.emailTransport.sendPasswordChangedEmail({ to: currentEmail });
    } catch (err) {
      this.logger.error(`[profile] password-changed notice failed uid=${uid}: ${String(err)}`);
    }

    await this.auth.revokeRefreshTokens(uid);
    this.logger.log(`[profile] password changed uid=${uid}`);
  }

  private async verifyCurrentPassword(email: string, password: string): Promise<void> {
    try {
      await this.restClient.signInWithPassword({ email, password });
    } catch (err) {
      if (err instanceof AuthException && err.code === 'INVALID_CREDENTIALS') {
        throw new CurrentPasswordInvalidException();
      }
      this.logger.error(`[profile] password reauth failed: ${String(err)}`);
      throw new PasswordChangeFailedException(err instanceof Error ? { cause: err } : undefined);
    }
  }
}
```

- [ ] **Step 4: Run it, expect pass**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx test api-profile -- password-change.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d
git add libs/api-profile/src/lib/password/password-change.service.ts libs/api-profile/src/lib/password/password-change.service.spec.ts
git commit -m "feat(api-profile): PasswordChangeService (re-auth, policy, updateUser, notify, revoke)"
```

---

## Task 9: `PasswordChangeController` (`api-profile/password`)

**Files:**
- Create: `libs/api-profile/src/lib/password/password-change.controller.ts`
- Test: `libs/api-profile/src/lib/password/password-change.controller.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedRequest } from '@learnwren/api-auth';
import type { UserId } from '@learnwren/shared-data-models';

import { PasswordChangeController } from './password-change.controller';

function mockReq(): AuthenticatedRequest {
  return {
    user: { uid: 'u1' as UserId, email: 'user@example.com', role: 'STUDENT', emailVerified: true },
  } as AuthenticatedRequest;
}

describe('PasswordChangeController', () => {
  it('delegates to the service and clears the session cookie (204)', async () => {
    const svc = { changePassword: vi.fn().mockResolvedValue(undefined) };
    const cookieHelper = { toClearingCookie: vi.fn().mockReturnValue('__session=; Max-Age=0') };
    const controller = new PasswordChangeController(svc as never, cookieHelper as never);
    const setHeader = vi.fn();

    await controller.change(
      { currentPassword: 'a', newPassword: 'b' },
      mockReq(),
      { setHeader } as never,
    );

    expect(svc.changePassword).toHaveBeenCalledWith('u1', 'user@example.com', {
      currentPassword: 'a',
      newPassword: 'b',
    });
    expect(setHeader).toHaveBeenCalledWith('Set-Cookie', '__session=; Max-Age=0');
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx test api-profile -- password-change.controller`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { Body, Controller, HttpCode, Post, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { FirebaseSessionGuard, SessionCookieHelper } from '@learnwren/api-auth';
import type { AuthenticatedRequest } from '@learnwren/api-auth';

import { ChangePasswordDto } from './dto/change-password.dto';
import { PasswordChangeExceptionFilter } from './password.exception-filter';
import { PasswordChangeService } from './password-change.service';

@Controller('profile/password')
@UseFilters(PasswordChangeExceptionFilter)
@UseGuards(FirebaseSessionGuard)
export class PasswordChangeController {
  constructor(
    private readonly svc: PasswordChangeService,
    private readonly cookieHelper: SessionCookieHelper,
  ) {}

  @Post()
  @HttpCode(204)
  async change(
    @Body() dto: ChangePasswordDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const user = req.user!;
    await this.svc.changePassword(user.uid, user.email, {
      currentPassword: dto.currentPassword,
      newPassword: dto.newPassword,
    });
    res.setHeader('Set-Cookie', this.cookieHelper.toClearingCookie());
  }
}
```

- [ ] **Step 4: Run it, expect pass**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx test api-profile -- password-change.controller`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d
git add libs/api-profile/src/lib/password/password-change.controller.ts libs/api-profile/src/lib/password/password-change.controller.spec.ts
git commit -m "feat(api-profile): PasswordChangeController (POST /profile/password, 204 + clear cookie)"
```

---

## Task 10: Register in `ProfileModule`

**Files:**
- Modify: `libs/api-profile/src/lib/profile.module.ts`

- [ ] **Step 1: Add imports**

Add to the import block in `libs/api-profile/src/lib/profile.module.ts`:

```ts
import { PasswordChangeController } from './password/password-change.controller';
import { PasswordChangeExceptionFilter } from './password/password.exception-filter';
import { PasswordChangeService } from './password/password-change.service';
```

- [ ] **Step 2: Register controller + providers**

In `@Module`, add `PasswordChangeController` to `controllers` and `PasswordChangeService` + `PasswordChangeExceptionFilter` to `providers`:

```ts
  controllers: [ProfileController, ProfilePictureController, EmailChangeController, PasswordChangeController],
  providers: [
    ProfileService,
    ProfileExceptionFilter,
    ProfilePictureService,
    PictureExceptionFilter,
    EmailChangeService,
    EmailChangeExceptionFilter,
    PasswordChangeService,
    PasswordChangeExceptionFilter,
    FirebasePictureStorageAdapter,
    // ...existing PICTURE_CONFIG / PICTURE_STORAGE providers unchanged
```

- [ ] **Step 3: Typecheck + test the whole lib**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx typecheck api-profile && pnpm nx test api-profile`
Expected: PASS (vitest masks tsc errors — the explicit `typecheck` is the real gate).

- [ ] **Step 4: Commit**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d
git add libs/api-profile/src/lib/profile.module.ts
git commit -m "feat(api-profile): wire PasswordChangeController into ProfileModule"
```

---

## Task 11: Web `PasswordChangeService`

**Files:**
- Create: `libs/web-profile/src/lib/password/password-change.service.ts`
- Test: `libs/web-profile/src/lib/password/password-change.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { PasswordChangeService } from './password-change.service';

describe('PasswordChangeService (web)', () => {
  let svc: PasswordChangeService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(PasswordChangeService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('POSTs current + new password to /api/profile/password', async () => {
    const p = svc.change({ currentPassword: 'old', newPassword: 'new' });
    const r = http.expectOne('/api/profile/password');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ currentPassword: 'old', newPassword: 'new' });
    r.flush(null, { status: 204, statusText: 'No Content' });
    await p;
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx test web-profile -- password-change.service`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { ChangePasswordRequest } from '@learnwren/shared-data-models';

@Injectable({ providedIn: 'root' })
export class PasswordChangeService {
  private readonly http = inject(HttpClient);

  change(input: ChangePasswordRequest): Promise<void> {
    return firstValueFrom(this.http.post<void>('/api/profile/password', input));
  }
}
```

- [ ] **Step 4: Run it, expect pass**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx test web-profile -- password-change.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d
git add libs/web-profile/src/lib/password/password-change.service.ts libs/web-profile/src/lib/password/password-change.service.spec.ts
git commit -m "feat(web-profile): PasswordChangeService HTTP wrapper"
```

---

## Task 12: Profile-page "Change password" section

**Files:**
- Modify: `libs/web-profile/src/lib/profile-page/profile-page.component.ts`
- Modify: `libs/web-profile/src/lib/profile-page/profile-page.component.html`
- Test: `libs/web-profile/src/lib/profile-page/profile-page.component.spec.ts`

> Reuses `passwordPolicyValidator` from `@learnwren/web-auth` for the live checklist. `confirmNewPassword` is client-only and never sent. On `204` the component calls `authSvc.logout()` (best-effort; the server already revoked tokens + cleared the cookie — same pattern as Slice C's email-changed flow) and navigates to `/login?passwordChanged=1`. **Note:** `AuthService.setCurrentUser` only accepts `AuthenticatedUser` (not `null`), so use `logout()` — confirmed against `auth.service.ts`.

- [ ] **Step 1: Write the failing test**

The existing `profile-page.component.spec.ts` uses a real `TestBed` + `HttpTestingController` with a `flushGet()` helper (it flushes `GET /api/profile` in `ngOnInit`). Add a new `describe` block at the end of the file. Add `Router` import, `vi`, `HttpErrorResponse`, and the `PasswordChangeService` import at the top; provide a `Router` stub and a `PasswordChangeService` stub, and spy on `auth.logout`:

```ts
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { PasswordChangeService } from '../password/password-change.service';

describe('ProfilePageComponent — change password', () => {
  let fixture: ComponentFixture<ProfilePageComponent>;
  let http: HttpTestingController;
  let auth: AuthService;
  const change = vi.fn();
  const navigate = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    change.mockReset();
    navigate.mockReset().mockResolvedValue(true);
    TestBed.configureTestingModule({
      imports: [ProfilePageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PasswordChangeService, useValue: { change } },
        { provide: Router, useValue: { navigate } },
      ],
    });
    fixture = TestBed.createComponent(ProfilePageComponent);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    // resolve ngOnInit's GET /api/profile so readonly() is populated
    fixture.detectChanges();
    http.expectOne('/api/profile').flush(MOCK_PROFILE);
  });

  it('on 204 logs out and navigates to /login?passwordChanged=1', async () => {
    change.mockResolvedValue(undefined);
    const logout = vi.spyOn(auth, 'logout').mockResolvedValue(undefined);
    const cmp = fixture.componentInstance;
    cmp.passwordForm.setValue({
      currentPassword: 'Aa1!aaaaaaaa',
      newPassword: 'Bb2@bbbbbbbb',
      confirmNewPassword: 'Bb2@bbbbbbbb',
    });

    await cmp.submitPasswordChange();

    expect(change).toHaveBeenCalledWith({
      currentPassword: 'Aa1!aaaaaaaa',
      newPassword: 'Bb2@bbbbbbbb',
    });
    expect(logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { passwordChanged: 1 } });
  });

  it('does not submit when confirmNewPassword does not match', async () => {
    const cmp = fixture.componentInstance;
    cmp.passwordForm.setValue({
      currentPassword: 'Aa1!aaaaaaaa',
      newPassword: 'Bb2@bbbbbbbb',
      confirmNewPassword: 'mismatch',
    });

    await cmp.submitPasswordChange();
    expect(change).not.toHaveBeenCalled();
  });

  it('maps NEW_PASSWORD_WEAK to a server error on the newPassword control', async () => {
    change.mockRejectedValue(
      new HttpErrorResponse({
        status: 400,
        error: {
          error: {
            code: 'NEW_PASSWORD_WEAK',
            message: 'weak',
            details: { field: 'newPassword', unmetRequirements: ['DIGIT'] },
          },
        },
      }),
    );
    const cmp = fixture.componentInstance;
    cmp.passwordForm.setValue({
      currentPassword: 'Aa1!aaaaaaaa',
      newPassword: 'Bb2@bbbbbbbb',
      confirmNewPassword: 'Bb2@bbbbbbbb',
    });

    await cmp.submitPasswordChange();
    expect(cmp.passwordForm.controls.newPassword.errors?.['server']).toBeTruthy();
  });
});
```
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx test web-profile -- profile-page`
Expected: FAIL — `passwordForm` / `submitPasswordChange` undefined.

- [ ] **Step 3: Implement the component TS**

In `libs/web-profile/src/lib/profile-page/profile-page.component.ts`:

1. Add imports:

```ts
import { Router } from '@angular/router';
import { AbstractControl, ValidationErrors } from '@angular/forms';
import { passwordPolicyValidator } from '@learnwren/web-auth';
import type { PolicyRequirement, PasswordChangeErrorBody } from '@learnwren/shared-data-models';
import { PasswordChangeService } from '../password/password-change.service';
```

2. Add the prose map and a status type near the top of the file (after the existing `type EmailStatus = ...`):

```ts
type PasswordStatus = 'idle' | 'saving' | 'error';

const REQUIREMENT_PROSE: Record<PolicyRequirement, string> = {
  MIN_LENGTH: 'at least 12 characters',
  UPPERCASE: 'at least one uppercase letter',
  LOWERCASE: 'at least one lowercase letter',
  DIGIT: 'at least one digit',
  SPECIAL: 'at least one special character',
};

function confirmMatchesValidator(control: AbstractControl): ValidationErrors | null {
  const np = control.get('newPassword')?.value;
  const cp = control.get('confirmNewPassword')?.value;
  return np && cp && np !== cp ? { confirmMismatch: true } : null;
}
```

3. Inject `Router` + `PasswordChangeService` (add alongside the existing `inject(...)` calls):

```ts
  private readonly router = inject(Router);
  private readonly passwordSvc = inject(PasswordChangeService);
```

4. Add the form, signals, and methods (as class members):

```ts
  readonly passwordForm = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, passwordPolicyValidator()]],
      confirmNewPassword: ['', [Validators.required]],
    },
    { validators: [confirmMatchesValidator] },
  );

  readonly passwordStatus = signal<PasswordStatus>('idle');
  readonly passwordFormOpen = signal(false);

  togglePasswordForm(): void {
    this.passwordFormOpen.update((v) => !v);
  }

  passwordHints(): string[] {
    const policy = this.passwordForm.controls.newPassword.errors?.['passwordPolicy'] as
      | { unmet?: PolicyRequirement[] }
      | undefined;
    return policy?.unmet?.map((r) => REQUIREMENT_PROSE[r]) ?? [];
  }

  async submitPasswordChange(): Promise<void> {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.passwordStatus.set('saving');
    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    try {
      await this.passwordSvc.change({ currentPassword, newPassword });
      // The server already revoked tokens + cleared the cookie; logout() is a
      // best-effort client-state clear (nulls currentUser), matching Slice C.
      await this.authSvc.logout();
      await this.router.navigate(['/login'], { queryParams: { passwordChanged: 1 } });
    } catch (err) {
      this.applyPasswordServerError(err);
      this.passwordStatus.set('error');
    }
  }

  private applyPasswordServerError(err: unknown): void {
    if (!(err instanceof HttpErrorResponse)) return;
    const body = err.error as PasswordChangeErrorBody | undefined;
    const code = body?.error?.code;
    const message = body?.error?.message ?? 'Could not change password.';
    if (code === 'CURRENT_PASSWORD_INVALID') {
      this.passwordForm.controls.currentPassword.setErrors({ server: message });
    } else {
      // NEW_PASSWORD_WEAK / PASSWORD_UNCHANGED / PASSWORD_CHANGE_FAILED → newPassword field
      this.passwordForm.controls.newPassword.setErrors({ server: message });
    }
  }
```

- [ ] **Step 4: Implement the HTML section**

Append inside the `@if (readonly()) { ... }` block in `libs/web-profile/src/lib/profile-page/profile-page.component.html`, after the email `</section>` (but still within the `@if (readonly())` wrapper — i.e. a sibling section):

```html
    <section class="mt-8 flex flex-col gap-3 border-t border-line pt-6">
      <h2 class="text-lg font-serif">Password</h2>

      <div>
        <button
          lwButton
          variant="ghost"
          type="button"
          data-testid="toggle-password-change"
          [attr.aria-expanded]="passwordFormOpen()"
          (click)="togglePasswordForm()"
        >
          Change password
        </button>
      </div>

      @if (passwordFormOpen()) {
        <form
          [formGroup]="passwordForm"
          (ngSubmit)="submitPasswordChange()"
          class="flex flex-col gap-3 border border-line rounded p-4"
        >
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-2">Current password</span>
            <input lwInput type="password" formControlName="currentPassword" autocomplete="current-password" aria-describedby="cur-pw-err" />
            @if (passwordForm.controls.currentPassword.touched && passwordForm.controls.currentPassword.invalid) {
              <span id="cur-pw-err" class="text-sm text-bad">
                @if (passwordForm.controls.currentPassword.errors?.['server']) {
                  {{ passwordForm.controls.currentPassword.errors?.['server'] }}
                } @else {
                  Your current password is required.
                }
              </span>
            }
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-2">New password</span>
            <input lwInput type="password" formControlName="newPassword" autocomplete="new-password" aria-describedby="new-pw-err" />
            @if (passwordForm.controls.newPassword.errors?.['server']) {
              <span id="new-pw-err" class="text-sm text-bad">
                {{ passwordForm.controls.newPassword.errors?.['server'] }}
              </span>
            } @else if (passwordHints().length > 0) {
              <ul class="mt-1 list-inside list-disc text-xs text-ink-3">
                @for (hint of passwordHints(); track hint) {
                  <li>{{ hint }}</li>
                }
              </ul>
            }
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-2">Confirm new password</span>
            <input lwInput type="password" formControlName="confirmNewPassword" autocomplete="new-password" aria-describedby="confirm-pw-err" />
            @if (passwordForm.controls.confirmNewPassword.touched && passwordForm.errors?.['confirmMismatch']) {
              <span id="confirm-pw-err" class="text-sm text-bad">Passwords do not match.</span>
            }
          </label>

          <div>
            <button
              lwButton
              variant="primary"
              type="submit"
              data-testid="submit-password-change"
              [disabled]="passwordStatus() === 'saving'"
            >
              Change password
            </button>
          </div>
        </form>
      }
    </section>
```

- [ ] **Step 5: Run tests + typecheck**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx test web-profile -- profile-page && pnpm nx typecheck web-profile`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d
git add libs/web-profile/src/lib/profile-page
git commit -m "feat(web-profile): inline change-password section on the profile page"
```

---

## Task 13: Login `?passwordChanged=1` notice

**Files:**
- Modify: `libs/web-auth/src/lib/login-page/login-page.component.ts`
- Modify: `libs/web-auth/src/lib/login-page/login-page.component.html`
- Test: `libs/web-auth/src/lib/login-page/login-page.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `libs/web-auth/src/lib/login-page/login-page.component.spec.ts` (mirror the existing `justChangedEmail`/`emailChanged` test — copy that test and swap the query key + computed name):

```ts
  it('shows the password-changed notice when ?passwordChanged=1', async () => {
    // Configure the ActivatedRoute stub with queryParamMap { passwordChanged: '1' }
    // exactly as the emailChanged test does, then:
    expect(component.justChangedPassword()).toBe(true);
  });
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx test web-auth -- login-page`
Expected: FAIL — `justChangedPassword` undefined.

- [ ] **Step 3: Implement the computed**

In `libs/web-auth/src/lib/login-page/login-page.component.ts`, add next to `justChangedEmail`:

```ts
  readonly justChangedPassword = computed(() => this.queryParams()?.get('passwordChanged') === '1');
```

- [ ] **Step 4: Implement the HTML notice**

In `libs/web-auth/src/lib/login-page/login-page.component.html`, add after the `@if (justChangedEmail()) { ... }` block:

```html
  @if (justChangedPassword()) {
    <p class="mt-4 text-sm text-good" data-testid="password-changed-notice">
      Your password was changed. Please sign in with your new password.
    </p>
  }
```

- [ ] **Step 5: Run it, expect pass**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx test web-auth -- login-page`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d
git add libs/web-auth/src/lib/login-page
git commit -m "feat(web-auth): password-changed sign-in notice (?passwordChanged=1)"
```

---

## Task 14: api-e2e flow

**Files:**
- Create: `apps/api-e2e/src/password-change.e2e-spec.ts`

> Mirrors `email-change.e2e-spec.ts`. The emulator's `updateUser({ password })` revokes tokens, so the real assertion is "old password fails, new password works" + the notification outbox entry.

- [ ] **Step 1: Write the spec**

```ts
import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

import { API_BASE, initAdmin, uniqueEmail } from './_helpers/auth';

initAdmin();

const PASSWORD = 'Aa1!aaaaaaaa';
const NEW_PASSWORD = 'Bb2@bbbbbbbb';

interface VerifiedSession {
  uid: string;
  email: string;
  cookieHeader: string;
}

async function registerVerifiedSession(
  request: import('@playwright/test').APIRequestContext,
): Promise<VerifiedSession> {
  const email = uniqueEmail('pwchg');
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password: PASSWORD, displayName: 'P' },
  });
  expect(reg.status()).toBe(201);
  const { uid } = (await reg.json()) as { uid: string };
  await admin.auth().updateUser(uid, { emailVerified: true });
  const login = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password: PASSWORD },
  });
  expect(login.status()).toBe(200);
  const setCookie = login.headers()['set-cookie'];
  const match = setCookie!.match(/__session=([^;]+)/);
  expect(match).not.toBeNull();
  return { uid, email, cookieHeader: `__session=${match![1]}` };
}

test('changes the password, clears the cookie (204), and login follows the new password', async ({ request }) => {
  const { email, cookieHeader } = await registerVerifiedSession(request);

  const res = await request.post(`${API_BASE}/profile/password`, {
    headers: { Cookie: cookieHeader },
    data: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
  });
  expect(res.status()).toBe(204);
  expect(res.headers()['set-cookie']).toContain('Max-Age=0');

  // A password-changed notification was sent to the account address.
  const outbox = await request.get(
    `${API_BASE}/auth/_test/last-email?to=${encodeURIComponent(email)}&kind=password-changed`,
  );
  expect(outbox.status()).toBe(200);

  // New password authenticates; old password is rejected.
  const newLogin = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password: NEW_PASSWORD },
  });
  expect(newLogin.status()).toBe(200);

  const oldLogin = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password: PASSWORD },
  });
  expect(oldLogin.status()).toBe(401);
});

test('wrong current password is rejected with CURRENT_PASSWORD_INVALID', async ({ request }) => {
  const { cookieHeader } = await registerVerifiedSession(request);
  const res = await request.post(`${API_BASE}/profile/password`, {
    headers: { Cookie: cookieHeader },
    data: { currentPassword: 'WrongPass1!', newPassword: NEW_PASSWORD },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error.code).toBe('CURRENT_PASSWORD_INVALID');
});

test('a weak new password is rejected with NEW_PASSWORD_WEAK and unmet requirements', async ({ request }) => {
  const { cookieHeader } = await registerVerifiedSession(request);
  const res = await request.post(`${API_BASE}/profile/password`, {
    headers: { Cookie: cookieHeader },
    data: { currentPassword: PASSWORD, newPassword: 'short' },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error.code).toBe('NEW_PASSWORD_WEAK');
  expect(Array.isArray(body.error.details.unmetRequirements)).toBe(true);
});

test('reusing the current password is rejected with PASSWORD_UNCHANGED', async ({ request }) => {
  const { cookieHeader } = await registerVerifiedSession(request);
  const res = await request.post(`${API_BASE}/profile/password`, {
    headers: { Cookie: cookieHeader },
    data: { currentPassword: PASSWORD, newPassword: PASSWORD },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error.code).toBe('PASSWORD_UNCHANGED');
});

test('without a session cookie the endpoint is rejected with 401 (not 500)', async ({ request }) => {
  const res = await request.post(`${API_BASE}/profile/password`, {
    data: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
  });
  expect(res.status()).toBe(401);
});
```

- [ ] **Step 2: Run the api-e2e suite**

Run (from the worktree; the api-e2e target boots emulators + the test outbox flag — match how `email-change` is run in this repo, e.g. `pnpm nx e2e api-e2e`):
`cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx e2e api-e2e`
Expected: the 5 new tests PASS alongside the existing suite. If the emulator does not revoke the cookie identically, the `Max-Age=0` assertion still holds because the controller always clears the cookie on success.

- [ ] **Step 3: Commit**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d
git add apps/api-e2e/src/password-change.e2e-spec.ts
git commit -m "test(api-e2e): change-password happy path + negatives"
```

---

## Task 15: web-e2e (Playwright)

**Files:**
- Create: `apps/web-e2e/src/password-change.spec.ts` (match the existing web-e2e file layout/naming — check `apps/web-e2e/src/` and mirror the email-change web-e2e if one exists; otherwise follow the nearest profile spec)

- [ ] **Step 1: Inspect existing web-e2e helpers**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && ls apps/web-e2e/src && grep -rl "settings/profile\|toggle-email-change" apps/web-e2e/src`
Use the discovered login/session helper + base-URL pattern in the spec below (replace the `loginAs(...)` placeholder with the repo's actual helper).

- [ ] **Step 2: Write the spec**

```ts
import { test, expect } from '@playwright/test';
// import the repo's existing auth/login helper used by other web-e2e specs

test('change-password form blocks submit on confirm mismatch', async ({ page }) => {
  // await loginAs(page, <a verified user>);
  await page.goto('/settings/profile');
  await page.getByTestId('toggle-password-change').click();
  await page.getByLabel('Current password').fill('Aa1!aaaaaaaa');
  await page.getByLabel('New password').fill('Bb2@bbbbbbbb');
  await page.getByLabel('Confirm new password').fill('different');
  await page.getByTestId('submit-password-change').click();
  await expect(page.getByText('Passwords do not match.')).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/profile/);
});

test('successful change redirects to /login?passwordChanged=1 with a notice', async ({ page }) => {
  // Stub the API so this stays a UI test (the full credential round-trip is in api-e2e):
  await page.route('**/api/profile/password', (route) =>
    route.fulfill({ status: 204, body: '' }),
  );
  // await loginAs(page, <a verified user>);
  await page.goto('/settings/profile');
  await page.getByTestId('toggle-password-change').click();
  await page.getByLabel('Current password').fill('Aa1!aaaaaaaa');
  await page.getByLabel('New password').fill('Bb2@bbbbbbbb');
  await page.getByLabel('Confirm new password').fill('Bb2@bbbbbbbb');
  await page.getByTestId('submit-password-change').click();
  await expect(page).toHaveURL(/\/login\?passwordChanged=1/);
  await expect(page.getByTestId('password-changed-notice')).toBeVisible();
});
```

- [ ] **Step 3: Run web-e2e**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx e2e web-e2e`
Expected: both new tests PASS.

- [ ] **Step 4: Commit**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d
git add apps/web-e2e/src/password-change.spec.ts
git commit -m "test(web-e2e): change-password confirm-mismatch + success redirect"
```

---

## Task 16: Docs reconciliation

**Files:**
- Modify: `README.md`, `docs/USER_GUIDE.md`, `docs/use-cases/01-user-identity-and-access.md`, `docs/quality/spec-drift-report.md`

- [ ] **Step 1: README**

Find the UC-01-03 line(s) in `README.md` (search `UC-01-03` / `Slice C`) and add that Slice D (change password) is wired up; mark UC-01-03 complete.

- [ ] **Step 2: USER_GUIDE**

Document the change-password flow: current + new password, the 12-char complexity rule (matches registration), and that a successful change signs you out on all devices and emails a confirmation.

- [ ] **Step 3: Use-case status banner**

In `docs/use-cases/01-user-identity-and-access.md` (the `> **STATUS: PARTIALLY IMPLEMENTED ...` banner near line 6), update: Slice D shipped — extensions 3c / 3c-3a / 3c-4a now wired (`POST /api/profile/password`, re-auth + complexity policy + force re-login + password-changed email); **UC-01-03 is now fully implemented**.

- [ ] **Step 4: Spec drift report**

In `docs/quality/spec-drift-report.md`, reconcile the EP-01 / UC-01-03 row: note the `PASSWORD_UNCHANGED` addition (beyond the UC text) and the "force-logout all devices" behavior.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d
git add README.md docs/USER_GUIDE.md docs/use-cases/01-user-identity-and-access.md docs/quality/spec-drift-report.md
git commit -m "docs: reconcile UC-01-03 Slice D (change password) across guide + drift report"
```

---

## Task 17: Final verification + merge

- [ ] **Step 1: Typecheck + lint + test the affected graph**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx run-many -t typecheck lint test -p shared-data-models api-auth api-profile web-profile web-auth`
Expected: all green. (Run `typecheck` explicitly — vitest masks `tsc` errors.)

- [ ] **Step 2: Full e2e**

Run: `cd /Volumes/Artie-Storage/github-repos/learnwren-slice-d && pnpm nx e2e api-e2e && pnpm nx e2e web-e2e`
Expected: green, including the existing email-change suite (regression check on the shared `_test/last-email` endpoint + the cookie-clear path).

- [ ] **Step 3: Manual smoke (optional but recommended)**

In two terminals from the worktree: `pnpm emulators` and `pnpm start`. Register + verify a user, go to `/settings/profile`, change the password, confirm the redirect + notice, then sign in with the new password.

- [ ] **Step 4: Merge to main (`--no-ff`)**

Per the branch-isolation workflow, land via a local no-ff merge:

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren
git merge --no-ff feat/uc-01-03-slice-d-password-change -m "Merge feat/uc-01-03-slice-d-password-change: UC-01-03 Slice D — change password"
```

- [ ] **Step 5: Clean up the worktree**

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren
git worktree remove ../learnwren-slice-d
git branch -d feat/uc-01-03-slice-d-password-change
```

---

## Self-Review Notes

- **Spec coverage:** §2.1 export → Task 2; §2.2 transport → Task 3; §2.3 submodule → Tasks 4–10; §3 wire types/PolicyRequirement → Task 1; §4 data flow → Task 8 (service) + Task 9 (controller); §5 error model → Tasks 4–6; §6 web (section + notice) → Tasks 11–13; §7 testing → unit specs in each task + Tasks 14–15; §8 docs → Task 16. No uncovered spec section.
- **Type consistency:** `changePassword(uid, currentEmail, { currentPassword, newPassword })` is used identically in Task 8 (def), Task 9 (controller call), and Task 9 spec. `PasswordChangeErrorBody.error.details.unmetRequirements` is the same shape in Task 1 (def), Task 5 (exception), Task 6 (filter test), Task 12 (web mapping). `kind: 'password-changed'` consistent across Tasks 3 + 14. `passwordForm` controls (`currentPassword`/`newPassword`/`confirmNewPassword`) consistent across Task 12 TS, HTML, and spec.
- **Resolved during planning:** `AuthService.setCurrentUser` only accepts `AuthenticatedUser`, so Task 12 uses `authSvc.logout()` (nulls `currentUser`, matches Slice C). Task 12's test now matches the real `TestBed` + `HttpTestingController` + `flushGet` harness in the existing profile-page spec.
- **Remaining verify-before-implement point (flagged inline):** web-e2e login helper name + base layout — Task 15 Step 1 (inspect `apps/web-e2e/src/` and reuse the repo's existing auth helper).
