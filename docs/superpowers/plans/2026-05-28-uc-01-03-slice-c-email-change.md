# UC-01-03 Slice C — Change Email Address Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authenticated user change their email address from `/settings/profile` — gated by their current password, verified on the new address before the swap, and forcing a re-login once the swap completes.

**Architecture:** A new `email/` submodule in `libs/api-profile` exposes `POST /api/profile/email` (initiate) and `POST /api/profile/email/confirm` (finalize). Initiate re-authenticates with the current password, then uses Firebase's native `generateVerifyAndChangeEmailLink` to email the new address. Clicking the link makes Firebase swap the email; the user lands on an **unguarded** Angular page that calls confirm, which revokes refresh tokens, syncs the Firestore mirror, and clears the session cookie before routing to `/login`. `api-auth` widens its exports so api-profile can reuse the shared email transport, the password re-auth REST client, and the session-cookie helper.

**Tech Stack:** NestJS 11, Firebase Admin SDK + Auth emulator, Angular 21 (standalone, signals, reactive forms), Vitest, Playwright (api-e2e + web-e2e), Nx (pnpm).

**Spec:** `docs/superpowers/specs/2026-05-28-uc-01-03-slice-c-email-change-design.md`

**Conventions to honor (from prior slices):**
- Per-feature `ExceptionFilter` per submodule (never a shared global one) — pattern: `PictureExceptionFilter`.
- DTOs carry **no** `class-validator` decorators; all validation lives in the service (global `ValidationPipe` would otherwise pre-empt typed codes with `BAD_REQUEST`).
- Web feature-lib services are thin Promise-returning HTTP wrappers; the component owns signal state.
- `vitest` masks `tsc` type errors — every phase ends with an explicit `nx typecheck`.
- Run tasks through `pnpm nx …`.

**Commands you will use repeatedly:**
- Single lib unit tests: `pnpm nx test <project> --skip-nx-cache`
- Typecheck: `pnpm nx typecheck <project>` (falls back to `pnpm nx run <project>:build` if no typecheck target)
- api-e2e (needs emulators + api running — see Task 14 preamble): `pnpm nx e2e api-e2e`
- web-e2e: `pnpm nx e2e web-e2e`

---

## File Structure

**Modified — `libs/shared-data-models`:**
- `src/lib/profile.ts` — add email-change wire request/response types + error-code constants.

**Modified — `libs/api-auth`:**
- `src/lib/email-transport/email-transport.ts` — add `EmailChangeVerificationEmailInput` + `sendEmailChangeVerificationEmail` to the interface.
- `src/lib/email-transport/console-email-transport.ts` — implement the method; add `'email-change'` to `OutboxEntry['kind']`.
- `src/lib/email-transport/smtp-email-transport.ts` — implement the method.
- `src/lib/auth.controller.ts` — extend the `_test/last-email` `kind` query union.
- `src/lib/auth.module.ts` — add `EMAIL_TRANSPORT`, `FirebaseAuthRestClient`, `SessionCookieHelper` to `exports`.
- `src/index.ts` — re-export `EMAIL_TRANSPORT`, `EmailTransport`, `FirebaseAuthRestClient`, `SessionCookieHelper`, `AuthException`.

**Created — `libs/api-profile/src/lib/email/`:**
- `errors/email-change-error.codes.ts`
- `errors/email-change.exception.ts`
- `email.exception-filter.ts`
- `dto/change-email.dto.ts`
- `email-change.service.ts`
- `email-change.controller.ts`
- (test siblings: `email-change.service.spec.ts`, `email.exception-filter.spec.ts`)

**Modified — `libs/api-profile`:**
- `src/lib/profile.module.ts` — register the new controller + providers.

**Created — `libs/web-profile/src/lib/email/`:**
- `email-change.service.ts`
- `email-changed/email-changed.component.ts`
- (test siblings)

**Modified — `libs/web-profile`:**
- `src/lib/profile-page/profile-page.component.ts` + `.html` — add the "Change email" section.
- `src/lib/profile.routes.ts` — add the unguarded `email-changed` route.

**Modified — `libs/web-auth`:**
- `src/lib/login-page/login-page.component.ts` + `.html` — `?emailChanged=1` notice.

**Created — `apps/api-e2e/src/email-change.e2e-spec.ts`**
**Created — `apps/web-e2e/src/` email-change spec**

**Modified — docs:** `README.md`, `docs/USER_GUIDE.md`, `docs/use-cases/01-user-identity-and-access.md`, `docs/quality/spec-drift-report.md`.

---

## Phase 1 — Shared types & api-auth foundation

### Task 1: Add email-change wire types to shared-data-models

**Files:**
- Modify: `libs/shared-data-models/src/lib/profile.ts` (append at end)
- Test: `libs/shared-data-models/src/lib/profile.spec.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `libs/shared-data-models/src/lib/profile.spec.ts`:

```ts
import {
  EMAIL_INVALID,
  EMAIL_UNCHANGED,
  CURRENT_PASSWORD_INVALID,
  EMAIL_ALREADY_IN_USE,
  EMAIL_CHANGE_FAILED,
  type ChangeEmailRequest,
  type ConfirmEmailChangeResponse,
  type EmailChangeErrorBody,
} from './profile';

describe('email-change wire types', () => {
  it('exposes the five email-change error code constants', () => {
    expect([
      EMAIL_INVALID,
      EMAIL_UNCHANGED,
      CURRENT_PASSWORD_INVALID,
      EMAIL_ALREADY_IN_USE,
      EMAIL_CHANGE_FAILED,
    ]).toEqual([
      'EMAIL_INVALID',
      'EMAIL_UNCHANGED',
      'CURRENT_PASSWORD_INVALID',
      'EMAIL_ALREADY_IN_USE',
      'EMAIL_CHANGE_FAILED',
    ]);
  });

  it('shapes the request, confirm response, and error body', () => {
    const req: ChangeEmailRequest = { newEmail: 'new@x.com', currentPassword: 'pw' };
    const ok: ConfirmEmailChangeResponse = { changed: true, email: 'new@x.com' };
    const noop: ConfirmEmailChangeResponse = { changed: false };
    const err: EmailChangeErrorBody = {
      error: { code: EMAIL_ALREADY_IN_USE, message: 'taken', details: { field: 'newEmail' } },
    };
    expect(req.newEmail).toBe('new@x.com');
    expect(ok.changed && noop.changed).toBe(false);
    expect(err.error.details?.field).toBe('newEmail');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test shared-data-models --skip-nx-cache`
Expected: FAIL — `EMAIL_INVALID`/`ChangeEmailRequest` not exported from `./profile`.

- [ ] **Step 3: Add the types**

Append to `libs/shared-data-models/src/lib/profile.ts`:

```ts
/** Body of `POST /api/profile/email`. */
export interface ChangeEmailRequest {
  newEmail: string;
  currentPassword: string;
}

/** Body of `POST /api/profile/email/confirm`. */
export interface ConfirmEmailChangeResponse {
  changed: boolean;
  email?: string;
}

/** Wire error codes returned by the email-change endpoints (UC-01-03 ext 3b). */
export const EMAIL_INVALID = 'EMAIL_INVALID';
export const EMAIL_UNCHANGED = 'EMAIL_UNCHANGED';
export const CURRENT_PASSWORD_INVALID = 'CURRENT_PASSWORD_INVALID';
export const EMAIL_ALREADY_IN_USE = 'EMAIL_ALREADY_IN_USE';
export const EMAIL_CHANGE_FAILED = 'EMAIL_CHANGE_FAILED';

export type EmailChangeErrorCode =
  | typeof EMAIL_INVALID
  | typeof EMAIL_UNCHANGED
  | typeof CURRENT_PASSWORD_INVALID
  | typeof EMAIL_ALREADY_IN_USE
  | typeof EMAIL_CHANGE_FAILED;

/** Body of a non-2xx from the email-change endpoints. */
export interface EmailChangeErrorBody {
  error: {
    code: EmailChangeErrorCode;
    message: string;
    details?: { field: 'newEmail' | 'currentPassword' };
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test shared-data-models --skip-nx-cache`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/shared-data-models/src/lib/profile.ts libs/shared-data-models/src/lib/profile.spec.ts
git commit -m "feat(shared-data-models): add email-change wire types (UC-01-03 Slice C)"
```

---

### Task 2: Add `sendEmailChangeVerificationEmail` to the email transport

**Files:**
- Modify: `libs/api-auth/src/lib/email-transport/email-transport.ts`
- Modify: `libs/api-auth/src/lib/email-transport/console-email-transport.ts`
- Modify: `libs/api-auth/src/lib/email-transport/smtp-email-transport.ts`
- Modify: `libs/api-auth/src/lib/auth.controller.ts:155` (the `_test/last-email` `kind` union)
- Test: `libs/api-auth/src/lib/email-transport/console-email-transport.spec.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create/append `libs/api-auth/src/lib/email-transport/console-email-transport.spec.ts`:

```ts
import { ConsoleEmailTransport } from './console-email-transport';

describe('ConsoleEmailTransport email-change', () => {
  it('records an email-change verification in the outbox', async () => {
    const t = new ConsoleEmailTransport();
    await t.sendEmailChangeVerificationEmail({
      to: 'new@example.com',
      verificationUrl: 'https://app/verify?oobCode=abc',
    });
    const entry = t.lastSentTo('new@example.com', 'email-change');
    expect(entry?.url).toBe('https://app/verify?oobCode=abc');
    expect(entry?.kind).toBe('email-change');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-auth --skip-nx-cache -- console-email-transport`
Expected: FAIL — `sendEmailChangeVerificationEmail` does not exist; `'email-change'` not assignable to `kind`.

- [ ] **Step 3: Extend the interface**

In `libs/api-auth/src/lib/email-transport/email-transport.ts`, add the input interface and the method:

```ts
export interface EmailChangeVerificationEmailInput {
  to: string; // the NEW address
  verificationUrl: string;
}
```

and add to the `EmailTransport` interface (after `sendPasswordResetEmail`):

```ts
  sendEmailChangeVerificationEmail(input: EmailChangeVerificationEmailInput): Promise<void>;
```

- [ ] **Step 4: Implement in ConsoleEmailTransport**

In `libs/api-auth/src/lib/email-transport/console-email-transport.ts`:

Change the `OutboxEntry` kind union:

```ts
export interface OutboxEntry {
  kind: 'unlock' | 'verification' | 'password-reset' | 'email-change';
  to: string;
  url: string;
  sentAt: Date;
}
```

Add the import of the new input type to the existing `import type { … } from './email-transport';` block (`EmailChangeVerificationEmailInput`), then add the method (after `sendPasswordResetEmail`):

```ts
  async sendEmailChangeVerificationEmail(
    input: EmailChangeVerificationEmailInput,
  ): Promise<void> {
    this.logger.log(
      `[email-change-email] to=${input.to} url=${input.verificationUrl}`,
    );
    this.append({
      kind: 'email-change',
      to: input.to,
      url: input.verificationUrl,
      sentAt: new Date(),
    });
  }
```

- [ ] **Step 5: Implement in SmtpEmailTransport**

In `libs/api-auth/src/lib/email-transport/smtp-email-transport.ts`, add `EmailChangeVerificationEmailInput` to the `import type` block, then add the method (after `sendPasswordResetEmail`):

```ts
  async sendEmailChangeVerificationEmail(
    input: EmailChangeVerificationEmailInput,
  ): Promise<void> {
    const text =
      `You asked to change the email address on your Learn Wren account.\n\n` +
      `Confirm this new address by clicking the link below:\n\n` +
      `${input.verificationUrl}\n\n` +
      `Your current address stays active until you confirm. ` +
      `If you didn't request this, you can safely ignore this email.`;

    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: input.to,
        subject: 'Confirm your new Learn Wren email address',
        text,
      });
      this.logger.log(`[email-change-email] sent to=${input.to}`);
    } catch (err) {
      this.logger.error(`[email-change-email] send failed to=${input.to}: ${String(err)}`);
      throw err;
    }
  }
```

- [ ] **Step 6: Extend the `_test/last-email` kind union**

In `libs/api-auth/src/lib/auth.controller.ts`, change the `lastTestEmail` `kind` query type:

```ts
    @Query('kind') kind: 'unlock' | 'verification' | 'password-reset' | 'email-change',
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm nx test api-auth --skip-nx-cache -- console-email-transport`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add libs/api-auth/src/lib/email-transport libs/api-auth/src/lib/auth.controller.ts
git commit -m "feat(api-auth): add email-change verification email to transport"
```

---

### Task 3: Widen api-auth exports for api-profile reuse

**Files:**
- Modify: `libs/api-auth/src/lib/auth.module.ts:37` (the `exports` array)
- Modify: `libs/api-auth/src/index.ts`

There is no clean unit test for module wiring; correctness is verified when `api-profile` compiles and its tests pass (Tasks 6–8). Keep this task to the exports only.

- [ ] **Step 1: Add module exports**

In `libs/api-auth/src/lib/auth.module.ts`, add the import for the token (it is already imported at line 9) and change the `exports` array to:

```ts
  exports: [
    FirebaseSessionGuard,
    InstructorRoleGuard,
    EMAIL_TRANSPORT,
    FirebaseAuthRestClient,
    SessionCookieHelper,
  ],
```

(`EMAIL_TRANSPORT`, `FirebaseAuthRestClient`, and `SessionCookieHelper` are all already imported at the top of this file and listed as providers — only the `exports` array changes.)

- [ ] **Step 2: Add index re-exports**

In `libs/api-auth/src/index.ts`, add:

```ts
export { FirebaseAuthRestClient } from './lib/firebase-auth-rest-client';
export { SessionCookieHelper } from './lib/session-cookie.helper';
export {
  EMAIL_TRANSPORT,
  type EmailTransport,
  type EmailChangeVerificationEmailInput,
} from './lib/email-transport/email-transport';
export { AuthException } from './lib/errors/auth.exception';
```

(`AuthException` is already exported on the existing line `export { AuthException, InsufficientRoleException } …` — if so, leave that line and do NOT duplicate it. Only add the lines for symbols not already exported.)

- [ ] **Step 3: Verify the lib still builds**

Run: `pnpm nx typecheck api-auth` (or `pnpm nx run api-auth:build` if no typecheck target)
Expected: PASS — no type errors.

- [ ] **Step 4: Run api-auth tests**

Run: `pnpm nx test api-auth --skip-nx-cache`
Expected: PASS — existing suite green.

- [ ] **Step 5: Commit**

```bash
git add libs/api-auth/src/lib/auth.module.ts libs/api-auth/src/index.ts
git commit -m "feat(api-auth): export email transport, REST client, cookie helper for api-profile"
```

---

## Phase 2 — api-profile `email/` submodule

### Task 4: Error codes + exception classes

**Files:**
- Create: `libs/api-profile/src/lib/email/errors/email-change-error.codes.ts`
- Create: `libs/api-profile/src/lib/email/errors/email-change.exception.ts`
- Test: `libs/api-profile/src/lib/email/errors/email-change.exception.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-profile/src/lib/email/errors/email-change.exception.spec.ts`:

```ts
import {
  CurrentPasswordInvalidException,
  EmailAlreadyInUseException,
  EmailChangeFailedException,
  EmailInvalidException,
  EmailUnchangedException,
} from './email-change.exception';

describe('email-change exceptions', () => {
  it('maps each exception to its code, status, and field', () => {
    expect(new EmailInvalidException()).toMatchObject({
      code: 'EMAIL_INVALID', status: 400, details: { field: 'newEmail' },
    });
    expect(new EmailUnchangedException()).toMatchObject({
      code: 'EMAIL_UNCHANGED', status: 400, details: { field: 'newEmail' },
    });
    expect(new CurrentPasswordInvalidException()).toMatchObject({
      code: 'CURRENT_PASSWORD_INVALID', status: 400, details: { field: 'currentPassword' },
    });
    expect(new EmailAlreadyInUseException()).toMatchObject({
      code: 'EMAIL_ALREADY_IN_USE', status: 409, details: { field: 'newEmail' },
    });
    expect(new EmailChangeFailedException()).toMatchObject({
      code: 'EMAIL_CHANGE_FAILED', status: 500,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-profile --skip-nx-cache -- email-change.exception`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the codes file**

Create `libs/api-profile/src/lib/email/errors/email-change-error.codes.ts`:

```ts
export const EMAIL_CHANGE_ERROR_CODES = [
  'EMAIL_INVALID',
  'EMAIL_UNCHANGED',
  'CURRENT_PASSWORD_INVALID',
  'EMAIL_ALREADY_IN_USE',
  'EMAIL_CHANGE_FAILED',
] as const;

export type EmailChangeErrorCode = (typeof EMAIL_CHANGE_ERROR_CODES)[number];
```

- [ ] **Step 4: Create the exception classes**

Create `libs/api-profile/src/lib/email/errors/email-change.exception.ts`:

```ts
import type { EmailChangeErrorCode } from './email-change-error.codes';

export class EmailChangeException extends Error {
  constructor(
    public readonly code: EmailChangeErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'EmailChangeException';
  }
}

export class EmailInvalidException extends EmailChangeException {
  constructor() {
    super('EMAIL_INVALID', 'Enter a valid email address.', 400, { field: 'newEmail' });
  }
}

export class EmailUnchangedException extends EmailChangeException {
  constructor() {
    super('EMAIL_UNCHANGED', 'That is already your email address.', 400, { field: 'newEmail' });
  }
}

export class CurrentPasswordInvalidException extends EmailChangeException {
  constructor() {
    super('CURRENT_PASSWORD_INVALID', 'Current password is incorrect.', 400, {
      field: 'currentPassword',
    });
  }
}

export class EmailAlreadyInUseException extends EmailChangeException {
  constructor() {
    super('EMAIL_ALREADY_IN_USE', 'That email address is already in use.', 409, {
      field: 'newEmail',
    });
  }
}

export class EmailChangeFailedException extends EmailChangeException {
  constructor(options?: ErrorOptions) {
    super(
      'EMAIL_CHANGE_FAILED',
      'We could not process the email change. Please try again.',
      500,
      undefined,
      options,
    );
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test api-profile --skip-nx-cache -- email-change.exception`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/api-profile/src/lib/email/errors
git commit -m "feat(api-profile): email-change error codes + exception classes"
```

---

### Task 5: Email-change exception filter

**Files:**
- Create: `libs/api-profile/src/lib/email/email.exception-filter.ts`
- Test: `libs/api-profile/src/lib/email/email.exception-filter.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-profile/src/lib/email/email.exception-filter.spec.ts`:

```ts
import { HttpException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';

import { EmailChangeExceptionFilter } from './email.exception-filter';
import { EmailAlreadyInUseException } from './errors/email-change.exception';

function mockHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('EmailChangeExceptionFilter', () => {
  it('serializes an EmailChangeException with code + details', () => {
    const { host, status, json } = mockHost();
    new EmailChangeExceptionFilter().catch(new EmailAlreadyInUseException(), host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'EMAIL_ALREADY_IN_USE',
        message: 'That email address is already in use.',
        details: { field: 'newEmail' },
      },
    });
  });

  it('maps a generic HttpException to its status code', () => {
    const { host, status, json } = mockHost();
    new EmailChangeExceptionFilter().catch(new HttpException('nope', 401), host);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'nope' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-profile --skip-nx-cache -- email.exception-filter`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the filter**

Create `libs/api-profile/src/lib/email/email.exception-filter.ts`:

```ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { EmailChangeException } from './errors/email-change.exception';

interface EmailChangeErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

@Catch(EmailChangeException, HttpException)
export class EmailChangeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('EmailChangeExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof EmailChangeException) {
      response.status(exception.status).json({
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details ? { details: exception.details } : {}),
        },
      } satisfies EmailChangeErrorBody);
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json({
        error: { code: codeForStatus(status), message: exception.message },
      } satisfies EmailChangeErrorBody);
      return;
    }
    this.logger.error(
      exception instanceof Error ? exception.stack ?? exception.message : String(exception),
    );
    response.status(500).json({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    } satisfies EmailChangeErrorBody);
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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-profile --skip-nx-cache -- email.exception-filter`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-profile/src/lib/email/email.exception-filter.ts libs/api-profile/src/lib/email/email.exception-filter.spec.ts
git commit -m "feat(api-profile): email-change exception filter"
```

---

### Task 6: ChangeEmailDto (type-only)

**Files:**
- Create: `libs/api-profile/src/lib/email/dto/change-email.dto.ts`

No decorators (validation lives in the service). No standalone test — exercised via the service/controller tasks.

- [ ] **Step 1: Create the DTO**

Create `libs/api-profile/src/lib/email/dto/change-email.dto.ts`:

```ts
/**
 * Type-shape only — intentionally NO class-validator decorators. The global
 * ValidationPipe would otherwise short-circuit with a generic BAD_REQUEST
 * before EmailChangeService can emit the feature's typed error codes.
 */
export class ChangeEmailDto {
  newEmail!: string;
  currentPassword!: string;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm nx typecheck api-profile`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add libs/api-profile/src/lib/email/dto/change-email.dto.ts
git commit -m "feat(api-profile): change-email DTO (type guard only)"
```

---

### Task 7: EmailChangeService.requestChange (initiate)

**Files:**
- Create: `libs/api-profile/src/lib/email/email-change.service.ts`
- Test: `libs/api-profile/src/lib/email/email-change.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-profile/src/lib/email/email-change.service.spec.ts`:

```ts
import { AuthException } from '@learnwren/api-auth';
import type { UserId } from '@learnwren/shared-data-models';

import { EmailChangeService } from './email-change.service';
import {
  CurrentPasswordInvalidException,
  EmailAlreadyInUseException,
  EmailInvalidException,
  EmailUnchangedException,
} from './errors/email-change.exception';

const UID = 'u1' as UserId;

function makeService(overrides: {
  signIn?: () => Promise<unknown>;
  genLink?: () => Promise<string>;
  sendEmail?: () => Promise<void>;
} = {}) {
  const auth = {
    generateVerifyAndChangeEmailLink:
      overrides.genLink ?? vi.fn().mockResolvedValue('https://app/verify?oobCode=x'),
    getUser: vi.fn(),
    revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
  };
  const restClient = {
    signInWithPassword: overrides.signIn ?? vi.fn().mockResolvedValue({ idToken: 't' }),
  };
  const transport = {
    sendEmailChangeVerificationEmail: overrides.sendEmail ?? vi.fn().mockResolvedValue(undefined),
  };
  const firestore = {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({ update: vi.fn().mockResolvedValue(undefined) }),
    }),
  };
  const svc = new EmailChangeService(
    auth as never,
    firestore as never,
    restClient as never,
    transport as never,
  );
  return { svc, auth, restClient, transport };
}

describe('EmailChangeService.requestChange', () => {
  const valid = { newEmail: 'new@example.com', currentPassword: 'pw' };

  it('rejects an invalid new email before touching Firebase', async () => {
    const { svc, restClient } = makeService();
    await expect(svc.requestChange(UID, 'old@example.com', { ...valid, newEmail: 'nope' }))
      .rejects.toBeInstanceOf(EmailInvalidException);
    expect(restClient.signInWithPassword).not.toHaveBeenCalled();
  });

  it('rejects when the new email equals the current (case-insensitive)', async () => {
    const { svc } = makeService();
    await expect(svc.requestChange(UID, 'Old@Example.com', { ...valid, newEmail: 'old@example.com' }))
      .rejects.toBeInstanceOf(EmailUnchangedException);
  });

  it('maps a wrong current password to CURRENT_PASSWORD_INVALID', async () => {
    const signIn = vi.fn().mockRejectedValue(
      new AuthException('INVALID_CREDENTIALS', 'bad', 401),
    );
    const { svc } = makeService({ signIn });
    await expect(svc.requestChange(UID, 'old@example.com', valid))
      .rejects.toBeInstanceOf(CurrentPasswordInvalidException);
  });

  it('maps Firebase auth/email-already-exists to EMAIL_ALREADY_IN_USE', async () => {
    const genLink = vi.fn().mockRejectedValue({ code: 'auth/email-already-exists' });
    const { svc } = makeService({ genLink });
    await expect(svc.requestChange(UID, 'old@example.com', valid))
      .rejects.toBeInstanceOf(EmailAlreadyInUseException);
  });

  it('generates the verify-and-change link and emails the NEW address on success', async () => {
    const { svc, auth, transport } = makeService();
    await svc.requestChange(UID, 'old@example.com', valid);
    expect(auth.generateVerifyAndChangeEmailLink).toHaveBeenCalledWith(
      'old@example.com',
      'new@example.com',
      expect.objectContaining({ url: expect.stringContaining('/settings/profile/email-changed') }),
    );
    expect(transport.sendEmailChangeVerificationEmail).toHaveBeenCalledWith({
      to: 'new@example.com',
      verificationUrl: 'https://app/verify?oobCode=x',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-profile --skip-nx-cache -- email-change.service`
Expected: FAIL — `EmailChangeService` not found.

- [ ] **Step 3: Implement the service (requestChange + helpers)**

Create `libs/api-profile/src/lib/email/email-change.service.ts`:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  AuthException,
  EMAIL_TRANSPORT,
  FirebaseAuthRestClient,
  type EmailTransport,
} from '@learnwren/api-auth';
import {
  FIREBASE_AUTH,
  type FirebaseAuthHandle,
  FIRESTORE,
  type FirestoreHandle,
} from '@learnwren/api-firebase';
import type { ConfirmEmailChangeResponse, UserId } from '@learnwren/shared-data-models';

import {
  CurrentPasswordInvalidException,
  EmailAlreadyInUseException,
  EmailChangeFailedException,
  EmailInvalidException,
  EmailUnchangedException,
} from './errors/email-change.exception';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class EmailChangeService {
  private readonly logger = new Logger('EmailChangeService');

  constructor(
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle,
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
    private readonly restClient: FirebaseAuthRestClient,
    @Inject(EMAIL_TRANSPORT) private readonly emailTransport: EmailTransport,
  ) {}

  async requestChange(
    uid: UserId,
    currentEmail: string,
    input: { newEmail: string; currentPassword: string },
  ): Promise<void> {
    const newEmail = input.newEmail.trim().toLowerCase();
    if (newEmail.length === 0 || !EMAIL_REGEX.test(newEmail)) {
      throw new EmailInvalidException();
    }
    if (newEmail === currentEmail.trim().toLowerCase()) {
      throw new EmailUnchangedException();
    }

    await this.verifyCurrentPassword(currentEmail, input.currentPassword);

    const link = await this.generateLink(uid, currentEmail, newEmail);

    try {
      await this.emailTransport.sendEmailChangeVerificationEmail({
        to: newEmail,
        verificationUrl: link,
      });
    } catch (err) {
      this.logger.error(`[profile] email-change send failed uid=${uid}: ${String(err)}`);
      throw new EmailChangeFailedException(err instanceof Error ? { cause: err } : undefined);
    }
    this.logger.log(`[profile] email-change requested uid=${uid}`);
  }

  private async verifyCurrentPassword(email: string, password: string): Promise<void> {
    try {
      await this.restClient.signInWithPassword({ email, password });
    } catch (err) {
      if (err instanceof AuthException && err.code === 'INVALID_CREDENTIALS') {
        throw new CurrentPasswordInvalidException();
      }
      this.logger.error(`[profile] email-change reauth failed: ${String(err)}`);
      throw new EmailChangeFailedException(err instanceof Error ? { cause: err } : undefined);
    }
  }

  private async generateLink(uid: UserId, currentEmail: string, newEmail: string): Promise<string> {
    try {
      return await this.auth.generateVerifyAndChangeEmailLink(currentEmail, newEmail, {
        url: this.continueUrl('/settings/profile/email-changed'),
      });
    } catch (err) {
      if (this.isFirebaseError(err) && err.code === 'auth/email-already-exists') {
        throw new EmailAlreadyInUseException();
      }
      this.logger.error(`[profile] email-change link gen failed uid=${uid}: ${String(err)}`);
      throw new EmailChangeFailedException(err instanceof Error ? { cause: err } : undefined);
    }
  }

  private continueUrl(path: string): string {
    const base = process.env['LEARNWREN_PUBLIC_URL'] ?? 'http://localhost:4200';
    return `${base}${path}`;
  }

  private isFirebaseError(err: unknown): err is { code: string } {
    return typeof err === 'object' && err !== null && 'code' in err;
  }
}
```

> Note: `confirmChange` is added in Task 8 (the `ConfirmEmailChangeResponse` import above is used there). If `confirmChange` does not yet exist, that import is unused but harmless; it becomes used in Task 8.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-profile --skip-nx-cache -- email-change.service`
Expected: PASS (all `requestChange` cases).

- [ ] **Step 5: Commit**

```bash
git add libs/api-profile/src/lib/email/email-change.service.ts libs/api-profile/src/lib/email/email-change.service.spec.ts
git commit -m "feat(api-profile): EmailChangeService.requestChange (initiate)"
```

---

### Task 8: EmailChangeService.confirmChange (finalize)

**Files:**
- Modify: `libs/api-profile/src/lib/email/email-change.service.ts`
- Test: `libs/api-profile/src/lib/email/email-change.service.spec.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `libs/api-profile/src/lib/email/email-change.service.spec.ts`:

```ts
describe('EmailChangeService.confirmChange', () => {
  it('returns changed:false and does nothing when the email has not swapped', async () => {
    const { svc, auth } = makeService();
    auth.getUser = vi.fn().mockResolvedValue({ email: 'old@example.com', emailVerified: true });
    const res = await svc.confirmChange(UID, 'old@example.com');
    expect(res).toEqual({ changed: false });
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('returns changed:false when the new email is not yet verified', async () => {
    const { svc, auth } = makeService();
    auth.getUser = vi.fn().mockResolvedValue({ email: 'new@example.com', emailVerified: false });
    const res = await svc.confirmChange(UID, 'old@example.com');
    expect(res).toEqual({ changed: false });
  });

  it('syncs Firestore, revokes tokens, and returns changed:true on a verified swap', async () => {
    const { svc, auth } = makeService();
    const update = vi.fn().mockResolvedValue(undefined);
    auth.getUser = vi.fn().mockResolvedValue({ email: 'new@example.com', emailVerified: true });
    // Re-point firestore so we can assert the update payload.
    (svc as unknown as { firestore: unknown }).firestore = {
      collection: () => ({ doc: () => ({ update }) }),
    };
    const res = await svc.confirmChange(UID, 'old@example.com');
    expect(res).toEqual({ changed: true, email: 'new@example.com' });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com', updatedAt: expect.any(String) }),
    );
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith(UID);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-profile --skip-nx-cache -- email-change.service`
Expected: FAIL — `confirmChange` is not a function.

- [ ] **Step 3: Add confirmChange to the service**

In `libs/api-profile/src/lib/email/email-change.service.ts`, add this method to `EmailChangeService` (after `requestChange`):

```ts
  async confirmChange(uid: UserId, cookieEmail: string): Promise<ConfirmEmailChangeResponse> {
    const user = await this.auth.getUser(uid);
    const swapped =
      !!user.email &&
      user.email.toLowerCase() !== cookieEmail.trim().toLowerCase() &&
      user.emailVerified === true;

    if (!swapped) {
      return { changed: false };
    }

    await this.firestore.collection('users').doc(uid).update({
      email: user.email,
      updatedAt: new Date().toISOString(),
    });
    await this.auth.revokeRefreshTokens(uid);

    this.logger.log(`[profile] email-change confirmed uid=${uid}`);
    return { changed: true, email: user.email };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-profile --skip-nx-cache -- email-change.service`
Expected: PASS (requestChange + confirmChange).

- [ ] **Step 5: Commit**

```bash
git add libs/api-profile/src/lib/email/email-change.service.ts libs/api-profile/src/lib/email/email-change.service.spec.ts
git commit -m "feat(api-profile): EmailChangeService.confirmChange (finalize + force logout)"
```

---

### Task 9: EmailChangeController + module registration

**Files:**
- Create: `libs/api-profile/src/lib/email/email-change.controller.ts`
- Modify: `libs/api-profile/src/lib/profile.module.ts`
- Test: `libs/api-profile/src/lib/email/email-change.controller.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-profile/src/lib/email/email-change.controller.spec.ts`:

```ts
import type { UserId } from '@learnwren/shared-data-models';
import type { AuthenticatedRequest } from '@learnwren/api-auth';

import { EmailChangeController } from './email-change.controller';

const req = (email: string) =>
  ({ user: { uid: 'u1' as UserId, email, role: 'STUDENT', emailVerified: true } } as AuthenticatedRequest);

describe('EmailChangeController', () => {
  it('delegates request() to the service and returns void (202)', async () => {
    const svc = { requestChange: vi.fn().mockResolvedValue(undefined), confirmChange: vi.fn() };
    const cookie = { toClearingCookie: vi.fn() };
    const ctrl = new EmailChangeController(svc as never, cookie as never);
    await ctrl.request({ newEmail: 'new@x.com', currentPassword: 'pw' }, req('old@x.com'));
    expect(svc.requestChange).toHaveBeenCalledWith('u1', 'old@x.com', {
      newEmail: 'new@x.com',
      currentPassword: 'pw',
    });
  });

  it('clears the session cookie when confirm reports a change', async () => {
    const svc = {
      requestChange: vi.fn(),
      confirmChange: vi.fn().mockResolvedValue({ changed: true, email: 'new@x.com' }),
    };
    const cookie = { toClearingCookie: vi.fn().mockReturnValue('__session=; Max-Age=0') };
    const setHeader = vi.fn();
    const ctrl = new EmailChangeController(svc as never, cookie as never);
    const res = await ctrl.confirm(req('old@x.com'), { setHeader } as never);
    expect(res).toEqual({ changed: true, email: 'new@x.com' });
    expect(setHeader).toHaveBeenCalledWith('Set-Cookie', '__session=; Max-Age=0');
  });

  it('does NOT clear the cookie on a no-op confirm', async () => {
    const svc = { requestChange: vi.fn(), confirmChange: vi.fn().mockResolvedValue({ changed: false }) };
    const cookie = { toClearingCookie: vi.fn() };
    const setHeader = vi.fn();
    const ctrl = new EmailChangeController(svc as never, cookie as never);
    await ctrl.confirm(req('old@x.com'), { setHeader } as never);
    expect(setHeader).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-profile --skip-nx-cache -- email-change.controller`
Expected: FAIL — controller not found.

- [ ] **Step 3: Create the controller**

Create `libs/api-profile/src/lib/email/email-change.controller.ts`:

```ts
import { Body, Controller, HttpCode, Post, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { FirebaseSessionGuard, SessionCookieHelper } from '@learnwren/api-auth';
import type { AuthenticatedRequest } from '@learnwren/api-auth';
import type { ConfirmEmailChangeResponse } from '@learnwren/shared-data-models';

import { ChangeEmailDto } from './dto/change-email.dto';
import { EmailChangeExceptionFilter } from './email.exception-filter';
import { EmailChangeService } from './email-change.service';

@Controller('profile/email')
@UseFilters(EmailChangeExceptionFilter)
@UseGuards(FirebaseSessionGuard)
export class EmailChangeController {
  constructor(
    private readonly svc: EmailChangeService,
    private readonly cookieHelper: SessionCookieHelper,
  ) {}

  @Post()
  @HttpCode(202)
  async request(@Body() dto: ChangeEmailDto, @Req() req: AuthenticatedRequest): Promise<void> {
    const user = req.user!;
    await this.svc.requestChange(user.uid, user.email, {
      newEmail: dto.newEmail,
      currentPassword: dto.currentPassword,
    });
  }

  @Post('confirm')
  @HttpCode(200)
  async confirm(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ConfirmEmailChangeResponse> {
    const user = req.user!;
    const result = await this.svc.confirmChange(user.uid, user.email);
    if (result.changed) {
      res.setHeader('Set-Cookie', this.cookieHelper.toClearingCookie());
    }
    return result;
  }
}
```

- [ ] **Step 4: Register in ProfileModule**

In `libs/api-profile/src/lib/profile.module.ts`, add the imports:

```ts
import { EmailChangeController } from './email/email-change.controller';
import { EmailChangeExceptionFilter } from './email/email.exception-filter';
import { EmailChangeService } from './email/email-change.service';
```

Add `EmailChangeController` to the `controllers` array, and `EmailChangeService` + `EmailChangeExceptionFilter` to the `providers` array. (`AuthModule` is already imported and now exports the deps the service needs.)

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm nx test api-profile --skip-nx-cache -- email-change.controller`
Expected: PASS.

Run: `pnpm nx typecheck api-profile`
Expected: PASS.

- [ ] **Step 6: Run the full api-profile suite**

Run: `pnpm nx test api-profile --skip-nx-cache`
Expected: PASS — entire lib green.

- [ ] **Step 7: Commit**

```bash
git add libs/api-profile/src/lib/email/email-change.controller.ts libs/api-profile/src/lib/email/email-change.controller.spec.ts libs/api-profile/src/lib/profile.module.ts
git commit -m "feat(api-profile): email-change controller + module wiring"
```

---

## Phase 3 — Web

### Task 10: Web EmailChangeService (HTTP wrapper)

**Files:**
- Create: `libs/web-profile/src/lib/email/email-change.service.ts`
- Test: `libs/web-profile/src/lib/email/email-change.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web-profile/src/lib/email/email-change.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { EmailChangeService } from './email-change.service';

describe('EmailChangeService (web)', () => {
  let svc: EmailChangeService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    svc = TestBed.inject(EmailChangeService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('POSTs the new email + current password to /api/profile/email', async () => {
    const p = svc.requestChange({ newEmail: 'new@x.com', currentPassword: 'pw' });
    const r = http.expectOne('/api/profile/email');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ newEmail: 'new@x.com', currentPassword: 'pw' });
    r.flush(null, { status: 202, statusText: 'Accepted' });
    await p;
  });

  it('POSTs to /api/profile/email/confirm and returns the response', async () => {
    const p = svc.confirm();
    const r = http.expectOne('/api/profile/email/confirm');
    expect(r.request.method).toBe('POST');
    r.flush({ changed: true, email: 'new@x.com' });
    await expect(p).resolves.toEqual({ changed: true, email: 'new@x.com' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-profile --skip-nx-cache -- email-change.service`
Expected: FAIL — service not found.

- [ ] **Step 3: Create the service**

Create `libs/web-profile/src/lib/email/email-change.service.ts`:

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  ChangeEmailRequest,
  ConfirmEmailChangeResponse,
} from '@learnwren/shared-data-models';

@Injectable({ providedIn: 'root' })
export class EmailChangeService {
  private readonly http = inject(HttpClient);

  requestChange(input: ChangeEmailRequest): Promise<void> {
    return firstValueFrom(this.http.post<void>('/api/profile/email', input));
  }

  confirm(): Promise<ConfirmEmailChangeResponse> {
    return firstValueFrom(
      this.http.post<ConfirmEmailChangeResponse>('/api/profile/email/confirm', {}),
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test web-profile --skip-nx-cache -- email-change.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-profile/src/lib/email/email-change.service.ts libs/web-profile/src/lib/email/email-change.service.spec.ts
git commit -m "feat(web-profile): email-change HTTP service"
```

---

### Task 11: "Change email" section on the profile page

**Files:**
- Modify: `libs/web-profile/src/lib/profile-page/profile-page.component.ts`
- Modify: `libs/web-profile/src/lib/profile-page/profile-page.component.html`
- Test: `libs/web-profile/src/lib/profile-page/profile-page.component.spec.ts` (create or append)

- [ ] **Step 1: Write the failing test**

Append a new `describe` block to the existing `libs/web-profile/src/lib/profile-page/profile-page.component.spec.ts`. Follow the file's established pattern — real root services driven through `HttpTestingController` (NOT `useValue` mocks), which is what keeps the `lib-profile-picture-uploader` child component's dependencies satisfied. `MOCK_PROFILE`, `provideHttpClient`, `provideHttpClientTesting`, and `ComponentFixture` are already imported at the top of the file.

```ts
describe('ProfilePageComponent — change email', () => {
  let fixture: ComponentFixture<ProfilePageComponent>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProfilePageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(ProfilePageComponent);
    http = TestBed.inject(HttpTestingController);
  });

  async function flushGet() {
    fixture.detectChanges();
    http.expectOne('/api/profile').flush(MOCK_PROFILE);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('on success shows the "verification sent" state with the new address', async () => {
    await flushGet();
    const cmp = fixture.componentInstance;
    cmp.emailForm.setValue({ newEmail: 'new@x.com', currentPassword: 'pw' });
    const p = cmp.submitEmailChange();
    const req = http.expectOne('/api/profile/email');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ newEmail: 'new@x.com', currentPassword: 'pw' });
    req.flush(null, { status: 202, statusText: 'Accepted' });
    await p;
    expect(cmp.emailStatus()).toBe('sent');
    expect(cmp.pendingEmail()).toBe('new@x.com');
  });

  it('maps a CURRENT_PASSWORD_INVALID error to the password field', async () => {
    await flushGet();
    const cmp = fixture.componentInstance;
    cmp.emailForm.setValue({ newEmail: 'new@x.com', currentPassword: 'wrong' });
    const p = cmp.submitEmailChange();
    http.expectOne('/api/profile/email').flush(
      { error: { code: 'CURRENT_PASSWORD_INVALID', message: 'Current password is incorrect.', details: { field: 'currentPassword' } } },
      { status: 400, statusText: 'Bad Request' },
    );
    await p;
    expect(cmp.emailForm.controls.currentPassword.errors?.['server']).toBe('Current password is incorrect.');
    expect(cmp.emailStatus()).toBe('error');
  });

  it('maps an EMAIL_ALREADY_IN_USE error (409) to the newEmail field', async () => {
    await flushGet();
    const cmp = fixture.componentInstance;
    cmp.emailForm.setValue({ newEmail: 'taken@x.com', currentPassword: 'pw' });
    const p = cmp.submitEmailChange();
    http.expectOne('/api/profile/email').flush(
      { error: { code: 'EMAIL_ALREADY_IN_USE', message: 'That email address is already in use.', details: { field: 'newEmail' } } },
      { status: 409, statusText: 'Conflict' },
    );
    await p;
    expect(cmp.emailForm.controls.newEmail.errors?.['server']).toBe('That email address is already in use.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-profile --skip-nx-cache -- profile-page`
Expected: FAIL — `emailForm`/`submitEmailChange` not on the component.

- [ ] **Step 3: Extend the component**

In `libs/web-profile/src/lib/profile-page/profile-page.component.ts`:

Add the import:

```ts
import { EmailChangeService } from '../email/email-change.service';
import type { EmailChangeErrorBody } from '@learnwren/shared-data-models';
```

Add an injected service next to the others:

```ts
  private readonly emailSvc = inject(EmailChangeService);
```

Add a status type alongside the existing `Status` type:

```ts
type EmailStatus = 'idle' | 'sending' | 'sent' | 'error';
```

Add these members to the class (next to the existing `form`/`status`/`readonly`):

```ts
  readonly emailForm = this.fb.nonNullable.group({
    // server is authoritative; email Validators give fast client feedback only
    newEmail: ['', [Validators.required, Validators.email]],
    currentPassword: ['', [Validators.required]],
  });

  readonly emailStatus = signal<EmailStatus>('idle');
  readonly emailFormOpen = signal(false);
  readonly pendingEmail = signal<string | null>(null);

  toggleEmailForm(): void {
    this.emailFormOpen.update((v) => !v);
  }

  async submitEmailChange(): Promise<void> {
    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }
    this.emailStatus.set('sending');
    const newEmail = this.emailForm.controls.newEmail.value;
    try {
      await this.emailSvc.requestChange(this.emailForm.getRawValue());
      this.pendingEmail.set(newEmail);
      this.emailStatus.set('sent');
      this.emailFormOpen.set(false);
      this.emailForm.reset();
    } catch (err) {
      this.applyEmailServerError(err);
      this.emailStatus.set('error');
    }
  }

  private applyEmailServerError(err: unknown): void {
    if (!(err instanceof HttpErrorResponse)) return;
    const body = err.error as EmailChangeErrorBody | undefined;
    const field = body?.error?.details?.field;
    const message = body?.error?.message ?? 'Could not change email.';
    if (field === 'newEmail' || field === 'currentPassword') {
      this.emailForm.controls[field].setErrors({ server: message });
    }
  }
```

`EmailChangeService` is `providedIn: 'root'`, so no `imports`/`providers` change is needed on the component — it is injected, not declared.

- [ ] **Step 4: Add the template section**

In `libs/web-profile/src/lib/profile-page/profile-page.component.html`, replace the read-only `@if (readonly(); as ro) { … }` block with one that keeps the read-only rows AND adds the change-email affordance:

```html
    @if (readonly(); as ro) {
      <dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        <dt class="text-ink-2">Email</dt><dd>{{ ro.email }}</dd>
        <dt class="text-ink-2">Role</dt><dd>{{ ro.role }}</dd>
      </dl>

      <div class="mt-1">
        @if (emailStatus() === 'sent' && pendingEmail(); as pending) {
          <p class="text-sm text-good" data-testid="email-change-sent">
            We've sent a verification link to {{ pending }}. Click it to finish changing your
            email — your current address stays active until you do.
          </p>
        } @else {
          <button
            lwButton
            variant="ghost"
            type="button"
            data-testid="toggle-email-change"
            (click)="toggleEmailForm()"
          >
            Change email
          </button>
        }
      </div>

      @if (emailFormOpen()) {
        <div [formGroup]="emailForm" class="flex flex-col gap-3 border border-line rounded p-4 mt-1">
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-2">New email address</span>
            <input lwInput type="email" formControlName="newEmail" aria-describedby="newEmail-err" />
            @if (emailForm.controls.newEmail.touched && emailForm.controls.newEmail.invalid) {
              <span id="newEmail-err" class="text-sm text-bad">
                @if (emailForm.controls.newEmail.errors?.['server']) {
                  {{ emailForm.controls.newEmail.errors?.['server'] }}
                } @else {
                  Enter a valid email address.
                }
              </span>
            }
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-2">Current password</span>
            <input lwInput type="password" formControlName="currentPassword" aria-describedby="curpw-err" />
            @if (emailForm.controls.currentPassword.touched && emailForm.controls.currentPassword.invalid) {
              <span id="curpw-err" class="text-sm text-bad">
                @if (emailForm.controls.currentPassword.errors?.['server']) {
                  {{ emailForm.controls.currentPassword.errors?.['server'] }}
                } @else {
                  Your current password is required.
                }
              </span>
            }
          </label>
          <div>
            <button
              lwButton
              variant="primary"
              type="button"
              data-testid="submit-email-change"
              [disabled]="emailStatus() === 'sending'"
              (click)="submitEmailChange()"
            >
              Send verification
            </button>
          </div>
        </div>
      }
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test web-profile --skip-nx-cache -- profile-page`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm nx typecheck web-profile`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add libs/web-profile/src/lib/profile-page
git commit -m "feat(web-profile): change-email section on profile page"
```

---

### Task 12: EmailChangedComponent + unguarded route

**Files:**
- Create: `libs/web-profile/src/lib/email/email-changed/email-changed.component.ts`
- Modify: `libs/web-profile/src/lib/profile.routes.ts`
- Test: `libs/web-profile/src/lib/email/email-changed/email-changed.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/web-profile/src/lib/email/email-changed/email-changed.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';

import { EmailChangedComponent } from './email-changed.component';
import { EmailChangeService } from '../email-change.service';
import { AuthService } from '@learnwren/web-auth';

function setup(confirmImpl: () => Promise<unknown>) {
  const navigate = vi.fn().mockResolvedValue(true);
  const logout = vi.fn().mockResolvedValue(undefined);
  TestBed.configureTestingModule({
    imports: [EmailChangedComponent],
    providers: [
      { provide: EmailChangeService, useValue: { confirm: vi.fn(confirmImpl) } },
      { provide: AuthService, useValue: { logout } },
      { provide: Router, useValue: { navigate } },
    ],
  });
  const fixture = TestBed.createComponent(EmailChangedComponent);
  return { fixture, navigate, logout };
}

describe('EmailChangedComponent', () => {
  it('on changed:true logs out and routes to /login?emailChanged=1', async () => {
    const { fixture, navigate, logout } = setup(() => Promise.resolve({ changed: true, email: 'new@x.com' }));
    await fixture.componentInstance.ngOnInit();
    expect(logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { emailChanged: 1 } });
  });

  it('treats a 401 (session already revoked) as success', async () => {
    const { fixture, navigate, logout } = setup(() =>
      Promise.reject(new HttpErrorResponse({ status: 401 })),
    );
    await fixture.componentInstance.ngOnInit();
    expect(logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { emailChanged: 1 } });
  });

  it('on changed:false routes back to the profile page', async () => {
    const { fixture, navigate, logout } = setup(() => Promise.resolve({ changed: false }));
    await fixture.componentInstance.ngOnInit();
    expect(logout).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/settings/profile']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-profile --skip-nx-cache -- email-changed`
Expected: FAIL — component not found.

- [ ] **Step 3: Create the component**

Create `libs/web-profile/src/lib/email/email-changed/email-changed.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';

import { AuthService } from '@learnwren/web-auth';

import { EmailChangeService } from '../email-change.service';

@Component({
  selector: 'lib-email-changed',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-md px-6 py-16 text-center">
      <p class="text-ink-2">Finishing your email change…</p>
    </section>
  `,
})
export class EmailChangedComponent implements OnInit {
  private readonly emailSvc = inject(EmailChangeService);
  private readonly authSvc = inject(AuthService);
  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    try {
      const result = await this.emailSvc.confirm();
      if (result.changed) {
        await this.finishWithRelogin();
      } else {
        await this.router.navigate(['/settings/profile']);
      }
    } catch (err) {
      // A 401 means the swap already revoked this session — treat as success.
      if (err instanceof HttpErrorResponse && err.status === 401) {
        await this.finishWithRelogin();
        return;
      }
      await this.router.navigate(['/settings/profile']);
    }
  }

  private async finishWithRelogin(): Promise<void> {
    await this.authSvc.logout();
    await this.router.navigate(['/login'], { queryParams: { emailChanged: 1 } });
  }
}
```

> Note: clearing client auth state goes through `authSvc.logout()` — `setCurrentUser` only accepts a non-null user, whereas `logout()` best-effort clears any lingering cookie and sets the `currentUser` signal to `null`.

- [ ] **Step 4: Add the unguarded route**

In `libs/web-profile/src/lib/profile.routes.ts`, add a second route (NO `canActivate`):

```ts
  {
    path: 'settings/profile/email-changed',
    loadComponent: () =>
      import('./email/email-changed/email-changed.component').then((m) => m.EmailChangedComponent),
  },
```

Place it before or after the existing `settings/profile` route — order does not matter since the paths are distinct.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test web-profile --skip-nx-cache -- email-changed`
Expected: PASS.

- [ ] **Step 6: Run the full web-profile suite + typecheck**

Run: `pnpm nx test web-profile --skip-nx-cache`
Run: `pnpm nx typecheck web-profile`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add libs/web-profile/src/lib/email/email-changed libs/web-profile/src/lib/profile.routes.ts
git commit -m "feat(web-profile): email-changed confirm page + unguarded route"
```

---

### Task 13: Login page `?emailChanged=1` notice

**Files:**
- Modify: `libs/web-auth/src/lib/login-page/login-page.component.ts`
- Modify: `libs/web-auth/src/lib/login-page/login-page.component.html`
- Test: `libs/web-auth/src/lib/login-page/login-page.component.spec.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `libs/web-auth/src/lib/login-page/login-page.component.spec.ts`. The file already has a `setup(queryParamMap: Map<string, string>)` helper that stubs `ActivatedRoute` with `{ queryParamMap: of({ get: (k) => queryParamMap.get(k) ?? null }) }` and returns `{ fixture, httpMock }`. Reuse it directly:

```ts
it('flags justChangedEmail when ?emailChanged=1 is present', () => {
  const { fixture } = setup(new Map([['emailChanged', '1']]));
  expect(fixture.componentInstance.justChangedEmail()).toBe(true);
});

it('does not flag justChangedEmail without the query param', () => {
  const { fixture } = setup(new Map());
  expect(fixture.componentInstance.justChangedEmail()).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-auth --skip-nx-cache -- login-page`
Expected: FAIL — `justChangedEmail` not defined.

- [ ] **Step 3: Add the computed**

In `libs/web-auth/src/lib/login-page/login-page.component.ts`, next to `justResetPassword`:

```ts
  readonly justChangedEmail = computed(() => this.queryParams()?.get('emailChanged') === '1');
```

- [ ] **Step 4: Add the notice to the template**

In `libs/web-auth/src/lib/login-page/login-page.component.html`, near the existing reset notice, add:

```html
@if (justChangedEmail()) {
  <p class="text-sm text-good" data-testid="email-changed-notice">
    Your email was changed. Please sign in with your new address.
  </p>
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test web-auth --skip-nx-cache -- login-page`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/web-auth/src/lib/login-page
git commit -m "feat(web-auth): login notice after email change (?emailChanged=1)"
```

---

## Phase 4 — End-to-end & docs

### Task 14: api-e2e — email-change flow

**Files:**
- Create: `apps/api-e2e/src/email-change.e2e-spec.ts`

**Preamble — running api-e2e:** the suite needs the emulators and the api running. In separate terminals: `pnpm emulators`, then `pnpm start` (or the project's documented api-e2e launch). The suite talks to `http://localhost:3333/api` and the Auth emulator at `127.0.0.1:9099` via the Admin SDK (`apps/api-e2e/src/_helpers/auth.ts`).

**Testing note — simulating the swap:** rather than redeeming the raw `oobCode` through the Identity Toolkit REST endpoint (brittle), this suite follows the established harness convention and simulates Firebase's swap with the Admin SDK: `admin.auth().updateUser(uid, { email: newEmail, emailVerified: true })`. The Admin-SDK swap does NOT revoke refresh tokens, so the existing session cookie stays valid and the confirm endpoint exercises the full happy path (`changed: true`, Firestore sync, token revoke, cookie clear). The initiate path is verified separately via the outbox.

- [ ] **Step 1: Write the test**

Create `apps/api-e2e/src/email-change.e2e-spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import * as admin from 'firebase-admin';

import { API_BASE, initAdmin, uniqueEmail } from './_helpers/auth';

initAdmin();

const PASSWORD = 'Aa1!aaaaaaaa';

async function registerVerifiedSession(request: import('@playwright/test').APIRequestContext) {
  const email = uniqueEmail('emailchg');
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password: PASSWORD, displayName: 'E' },
  });
  expect(reg.status()).toBe(201);
  const { uid } = (await reg.json()) as { uid: string };
  await admin.auth().updateUser(uid, { emailVerified: true });
  const login = await request.post(`${API_BASE}/auth/login`, { data: { email, password: PASSWORD } });
  expect(login.status()).toBe(200);
  const setCookie = login.headers()['set-cookie'];
  const cookieHeader = `__session=${setCookie!.match(/__session=([^;]+)/)![1]}`;
  return { uid, email, cookieHeader };
}

test('initiate sends a verification email to the new address (202)', async ({ request }) => {
  const { email, cookieHeader } = await registerVerifiedSession(request);
  const newEmail = uniqueEmail('emailchg-new');

  const res = await request.post(`${API_BASE}/profile/email`, {
    headers: { cookie: cookieHeader },
    data: { newEmail, currentPassword: PASSWORD },
  });
  expect(res.status()).toBe(202);

  // The current email still works for login (nothing swapped yet).
  const stillOld = await request.post(`${API_BASE}/auth/login`, { data: { email, password: PASSWORD } });
  expect(stillOld.status()).toBe(200);

  // An email-change verification landed in the outbox for the NEW address.
  const outbox = await request.get(
    `${API_BASE}/auth/_test/last-email?to=${encodeURIComponent(newEmail)}&kind=email-change`,
  );
  expect(outbox.status()).toBe(200);
  expect((await outbox.json()).url).toContain('oobCode');
});

test('wrong current password is rejected with CURRENT_PASSWORD_INVALID', async ({ request }) => {
  const { cookieHeader } = await registerVerifiedSession(request);
  const res = await request.post(`${API_BASE}/profile/email`, {
    headers: { cookie: cookieHeader },
    data: { newEmail: uniqueEmail('emailchg-x'), currentPassword: 'WrongPass1!' },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error.code).toBe('CURRENT_PASSWORD_INVALID');
});

test('an address already belonging to another account is rejected (409)', async ({ request }) => {
  const taken = await registerVerifiedSession(request); // owns taken.email
  const mover = await registerVerifiedSession(request);
  const res = await request.post(`${API_BASE}/profile/email`, {
    headers: { cookie: mover.cookieHeader },
    data: { newEmail: taken.email, currentPassword: PASSWORD },
  });
  expect(res.status()).toBe(409);
  expect((await res.json()).error.code).toBe('EMAIL_ALREADY_IN_USE');
});

test('confirm finalizes the swap, forces re-login, and login follows the new address', async ({ request }) => {
  const { uid, email, cookieHeader } = await registerVerifiedSession(request);
  const newEmail = uniqueEmail('emailchg-final');

  // Initiate (sends the email).
  const init = await request.post(`${API_BASE}/profile/email`, {
    headers: { cookie: cookieHeader },
    data: { newEmail, currentPassword: PASSWORD },
  });
  expect(init.status()).toBe(202);

  // Simulate the user clicking the verify-and-change link (Admin SDK swap).
  await admin.auth().updateUser(uid, { email: newEmail, emailVerified: true });

  // Confirm — the old session cookie is still valid (Admin swap doesn't revoke).
  const confirm = await request.post(`${API_BASE}/profile/email/confirm`, {
    headers: { cookie: cookieHeader },
  });
  expect(confirm.status()).toBe(200);
  expect(await confirm.json()).toMatchObject({ changed: true, email: newEmail });
  // Cookie cleared on confirm.
  expect(confirm.headers()['set-cookie']).toContain('Max-Age=0');

  // Login now succeeds with the NEW email and fails with the OLD.
  const newLogin = await request.post(`${API_BASE}/auth/login`, { data: { email: newEmail, password: PASSWORD } });
  expect(newLogin.status()).toBe(200);
  const oldLogin = await request.post(`${API_BASE}/auth/login`, { data: { email, password: PASSWORD } });
  expect(oldLogin.status()).toBe(401);

  // Firestore mirror was synced.
  const doc = await admin.firestore().collection('users').doc(uid).get();
  expect(doc.data()?.email).toBe(newEmail);
});

test('confirm is a no-op when nothing has swapped', async ({ request }) => {
  const { cookieHeader } = await registerVerifiedSession(request);
  const res = await request.post(`${API_BASE}/profile/email/confirm`, {
    headers: { cookie: cookieHeader },
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ changed: false });
});
```

- [ ] **Step 2: Verify `generateVerifyAndChangeEmailLink` works against the emulator**

Run only the initiate test first:

Run: `pnpm nx e2e api-e2e -- --grep "initiate sends a verification email"`
Expected: PASS. If it fails with a Firebase "unsupported" error on `generateVerifyAndChangeEmailLink`, the emulator build in use does not support that admin call — STOP and report: the unit tests already cover initiate; the e2e initiate + outbox assertions would need to be replaced with an Admin-SDK-only swap path, and `EMAIL_ALREADY_IN_USE` coverage moves to a pre-check. Do not silently skip.

- [ ] **Step 3: Run the full email-change e2e file**

Run: `pnpm nx e2e api-e2e -- --grep "email"` (or run the single spec file per the project's e2e invocation)
Expected: PASS — all five tests.

- [ ] **Step 4: Commit**

```bash
git add apps/api-e2e/src/email-change.e2e-spec.ts
git commit -m "test(api-e2e): email-change initiate + confirm flow"
```

---

### Task 15: web-e2e — change-email UI

**Files:**
- Create: `apps/web-e2e/src/email-change.spec.ts`

**Preamble:** web-e2e runs the Angular app via Playwright. Inspect an existing spec (e.g. the profile-picture web-e2e spec, if present, or `apps/web-e2e/src/`) for the project's login helper and `baseURL` conventions, and reuse them. Stub network where the existing specs stub.

- [ ] **Step 1: Write the test**

Create `apps/web-e2e/src/email-change.spec.ts` (adapt the login helper / route-stub helper to match sibling specs):

```ts
import { test, expect } from '@playwright/test';

// Reuse the project's existing authenticated-session helper here (see sibling
// web-e2e specs). The two behaviors under test:

test('change-email form shows the verification-sent confirmation', async ({ page }) => {
  // Arrange: signed-in user on /settings/profile (use the shared login helper).
  await page.route('**/api/profile/email', (route) =>
    route.fulfill({ status: 202, body: '' }),
  );
  await page.goto('/settings/profile');

  await page.getByTestId('toggle-email-change').click();
  await page.getByLabel('New email address').fill('new@example.com');
  await page.getByLabel('Current password').fill('Aa1!aaaaaaaa');
  await page.getByTestId('submit-email-change').click();

  await expect(page.getByTestId('email-change-sent')).toContainText('new@example.com');
});

test('email-changed landing redirects to /login?emailChanged=1 on changed:true', async ({ page }) => {
  await page.route('**/api/profile/email/confirm', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ changed: true, email: 'new@example.com' }) }),
  );
  await page.route('**/api/auth/logout', (route) => route.fulfill({ status: 204, body: '' }));

  await page.goto('/settings/profile/email-changed');

  await expect(page).toHaveURL(/\/login\?emailChanged=1/);
  await expect(page.getByTestId('email-changed-notice')).toBeVisible();
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm nx e2e web-e2e -- --grep "email"`
Expected: PASS. Adjust the login helper / selectors to match sibling specs if the first run reveals a mismatch (the `getByLabel` strings must match the `<span>` label text in the template from Task 11).

- [ ] **Step 3: Commit**

```bash
git add apps/web-e2e/src/email-change.spec.ts
git commit -m "test(web-e2e): change-email form + email-changed redirect"
```

---

### Task 16: Docs reconciliation

**Files:**
- Modify: `README.md`
- Modify: `docs/USER_GUIDE.md`
- Modify: `docs/use-cases/01-user-identity-and-access.md` (the UC-01-03 status banner)
- Modify: `docs/quality/spec-drift-report.md`

- [ ] **Step 1: README**

In `README.md`, find where UC-01-03 Slices A/B are recorded and add a line noting Slice C (change email, ext 3b) is wired up: `POST /api/profile/email` + `/confirm`, current-password gated, new-address verified, force re-login on confirm.

- [ ] **Step 2: USER_GUIDE**

In `docs/USER_GUIDE.md`, in the profile-management section, document the change-email flow: from `/settings/profile`, "Change email" → enter new address + current password → a verification link is sent to the new address; the current address stays active until the link is clicked; after confirming, the user is signed out and signs back in with the new address.

- [ ] **Step 3: Use-case status banner**

In `docs/use-cases/01-user-identity-and-access.md`, update the UC-01-03 banner: ext 3b (email change) **shipped 2026-05-28 (Slice C)**; ext 3c / 3c-3a / 3c-4a (password change) remain deferred (Slice D). Keep the existing Slice A/B wording.

- [ ] **Step 4: Drift report**

In `docs/quality/spec-drift-report.md`, update the EP-01 / UC-01-03 row to mark ext 3b implemented, and record the deliberate divergence: the email-change endpoint returns a specific `EMAIL_ALREADY_IN_USE` (409) rather than registration's enumeration-resistant generic error, because self-service email change is an authenticated, expected-feedback operation.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/USER_GUIDE.md docs/use-cases/01-user-identity-and-access.md docs/quality/spec-drift-report.md
git commit -m "docs: reconcile UC-01-03 Slice C (change email) across guide + drift report"
```

---

## Final verification

- [ ] **Run affected lib unit tests**

Run: `pnpm nx run-many -t test -p shared-data-models api-auth api-profile web-profile web-auth --skip-nx-cache`
Expected: ALL PASS.

- [ ] **Typecheck the touched projects**

Run: `pnpm nx run-many -t typecheck -p shared-data-models api-auth api-profile web-profile web-auth`
Expected: ALL PASS. (Catches anything `vitest` masked.)

- [ ] **Lint**

Run: `pnpm nx run-many -t lint -p api-auth api-profile web-profile web-auth shared-data-models`
Expected: PASS.

- [ ] **e2e** (emulators + api running)

Run: `pnpm nx e2e api-e2e` and `pnpm nx e2e web-e2e`
Expected: PASS (new email-change specs green; no regressions).

- [ ] **Final review against the spec** — confirm each spec section (§2 exports, §4.1 initiate, §4.2 confirm, §4.3 401-tolerance, §5 error table, §6 UI, §7 testing, §8 docs) has a corresponding completed task.
