# Shared Exception-Filter Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the duplicated rendering logic from the nine per-feature NestJS exception filters into a new `api-http-errors` util lib, leaving each filter a thin delegating shell.

**Architecture:** A new framework-light TS lib (`@learnwren/api-http-errors`, tag `scope:api`) exports one `handleException(host, exception, logger, { validation })` orchestrator plus `codeForStatus`, `isDomainShaped`, `respondValidation`, `formatLogLine`, and the `ErrorBody`/`DomainShapedException` types. Each existing filter keeps its class, `@Catch(...)` allowlist, DI, and `@UseFilters` registration; its `catch()` body becomes a single delegating call. The status→code table is unified (`HTTP_ERROR` default; cover/picture keep 413/415).

**Tech Stack:** Nx (pnpm), NestJS 11, TypeScript, Vitest. Spec: `docs/superpowers/specs/2026-05-29-shared-exception-filter-helper-design.md`.

**Working directory:** the worktree at `.worktrees/shared-exception-filter` (branch `refactor/api-http-errors-shared-filter`). Run all `nx` commands with `NX_DAEMON=false` (parallel-worktree dist hazard). Never `git add -A` (the `node_modules` symlink must stay untracked) — stage explicit paths.

---

## File Structure

- **Create** `libs/api-http-errors/` — new `@nx/js` lib (scaffolded). Key files:
  - `libs/api-http-errors/src/lib/exception-response.ts` — the helper module (all exports).
  - `libs/api-http-errors/src/lib/exception-response.spec.ts` — the consolidated, authoritative test.
  - `libs/api-http-errors/src/index.ts` — re-exports the public API.
- **Modify** the nine filters (catch body → delegation; delete their private helpers/types):
  - `libs/api-auth/src/lib/auth.exception-filter.ts`
  - `libs/api-courses/src/lib/courses.exception-filter.ts`
  - `libs/api-courses/src/lib/video/video.exception-filter.ts`
  - `libs/api-courses/src/lib/learn/learn.exception-filter.ts`
  - `libs/api-courses/src/lib/materials/materials.exception-filter.ts`
  - `libs/api-courses/src/lib/cover/cover.exception-filter.ts`
  - `libs/api-profile/src/lib/profile.exception-filter.ts`
  - `libs/api-profile/src/lib/email/email.exception-filter.ts`
  - `libs/api-profile/src/lib/picture/picture.exception-filter.ts`
- **Modify** `libs/api-courses/src/lib/cover/cover.exception-filter.spec.ts:85-86` — `'ERROR'` → `'HTTP_ERROR'`.
- **Modify** `tsconfig.base.json` (path alias, added by the generator — verify) and the three consuming libs' dependency on the new lib is satisfied by the path alias (no package.json edit needed for tsc path-alias libs).

---

## Task 1: Scaffold the `api-http-errors` library

**Files:**
- Create: `libs/api-http-errors/**` (generator output)
- Modify: `tsconfig.base.json` (path alias — generator usually adds it; verify)

- [ ] **Step 1: Scaffold the lib via the nx generator**

Use the **nx-generate skill** (per repo convention) to create a `@nx/js` library. Do NOT guess flags — confirm with `pnpm nx g @nx/js:library --help` first. Target configuration (mirror `libs/api-auth`):
- name/directory: `libs/api-http-errors`
- import path: `@learnwren/api-http-errors`
- unit test runner: `vitest`
- bundler/compiler: none/`tsc` (non-buildable, like `shared-data-models`/`api-auth`)
- tags: `scope:api`

Candidate command (verify against `--help` before running):

```bash
NX_DAEMON=false pnpm nx g @nx/js:library api-http-errors \
  --directory=libs/api-http-errors \
  --importPath=@learnwren/api-http-errors \
  --unitTestRunner=vitest \
  --bundler=none \
  --tags=scope:api \
  --no-interactive
```

- [ ] **Step 2: Verify the path alias and tag**

Run:
```bash
grep -A1 'api-http-errors' tsconfig.base.json
grep '"tags"' libs/api-http-errors/project.json
```
Expected: `"@learnwren/api-http-errors": ["./libs/api-http-errors/src/index.ts"]` present, and `"tags": ["scope:api"]`. If the alias is missing, add it to `tsconfig.base.json` `compilerOptions.paths`. If the tag differs, set it to `["scope:api"]` (the `enforce-module-boundaries` rule only allows `scope:api` libs to depend on `scope:api`/`scope:shared`).

- [ ] **Step 3: Confirm the lib's test target is wired**

Run:
```bash
NX_DAEMON=false pnpm nx test api-http-errors --skip-nx-cache
```
Expected: PASS (the generator's placeholder test). Confirms vitest is inferred for the lib.

- [ ] **Step 4: Commit**

```bash
git add libs/api-http-errors tsconfig.base.json
git commit -m "chore(api-http-errors): scaffold shared exception-filter util lib"
```

---

## Task 2: Implement the helper module (TDD)

**Files:**
- Create/replace: `libs/api-http-errors/src/lib/exception-response.ts`
- Create/replace: `libs/api-http-errors/src/lib/exception-response.spec.ts`
- Modify: `libs/api-http-errors/src/index.ts`
- Delete: the generator's placeholder `*.ts`/`*.spec.ts` (e.g. `libs/api-http-errors/src/lib/api-http-errors.ts` and its spec), if present.

- [ ] **Step 1: Write the failing test**

Create `libs/api-http-errors/src/lib/exception-response.spec.ts`:

```ts
import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  Logger,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  codeForStatus,
  formatLogLine,
  handleException,
  isDomainShaped,
} from './exception-response';

function buildHost(): {
  host: ArgumentsHost;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

function quietLogger(): Logger {
  const logger = new Logger('test');
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  return logger;
}

class FakeDomainException extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

describe('codeForStatus', () => {
  it.each<[number, string]>([
    [400, 'BAD_REQUEST'],
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [413, 'PAYLOAD_TOO_LARGE'],
    [415, 'UNSUPPORTED_MEDIA_TYPE'],
    [422, 'VALIDATION_ERROR'],
    [418, 'HTTP_ERROR'],
    [500, 'HTTP_ERROR'],
  ])('maps %i to %s', (status, code) => {
    expect(codeForStatus(status)).toBe(code);
  });
});

describe('isDomainShaped', () => {
  it('is true for an Error with string code + number status', () => {
    expect(isDomainShaped(new FakeDomainException('X', 'm', 403))).toBe(true);
  });
  it('is false for a plain HttpException (no code property)', () => {
    expect(isDomainShaped(new HttpException('x', 403))).toBe(false);
  });
  it('is false for a BadRequestException', () => {
    expect(isDomainShaped(new BadRequestException('x'))).toBe(false);
  });
  it('is false for a plain object that happens to have code/status', () => {
    expect(isDomainShaped({ code: 'X', status: 400 })).toBe(false);
  });
});

describe('formatLogLine', () => {
  it('returns the stack for an Error', () => {
    const e = new Error('boom');
    expect(formatLogLine(e)).toBe(e.stack);
  });
  it('stringifies a non-Error', () => {
    expect(formatLogLine('weird')).toBe('weird');
  });
});

describe('handleException', () => {
  it('renders a domain-shaped exception with its status/code and details', () => {
    const { host, status, json } = buildHost();
    handleException(host, new FakeDomainException('NOT_OWNER', 'no', 403, { a: 1 }), quietLogger());
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'NOT_OWNER', message: 'no', details: { a: 1 } },
    });
  });

  it('omits details when the domain exception has none', () => {
    const { host, json } = buildHost();
    handleException(host, new FakeDomainException('GONE', 'g', 404), quietLogger());
    expect(json).toHaveBeenCalledWith({ error: { code: 'GONE', message: 'g' } });
  });

  it('maps a BadRequestException to VALIDATION_FAILED + fieldErrors when validation is on', () => {
    const { host, status, json } = buildHost();
    const dtoErr = new BadRequestException({
      message: ['title must be longer', 'title must not be empty', 'price must be a number'],
      error: 'Bad Request',
      statusCode: 400,
    });
    handleException(host, dtoErr, quietLogger(), { validation: true });
    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details.fieldErrors.title).toHaveLength(2);
    expect(body.error.details.fieldErrors.price).toHaveLength(1);
  });

  it('treats a BadRequestException as a plain HttpException when validation is off', () => {
    const { host, status, json } = buildHost();
    handleException(host, new BadRequestException('x'), quietLogger());
    expect(status).toHaveBeenCalledWith(400);
    expect(json.mock.calls[0][0].error.code).toBe('BAD_REQUEST');
  });

  it('maps a plain HttpException via codeForStatus', () => {
    const { host, status, json } = buildHost();
    handleException(host, new ForbiddenException('nope'), quietLogger());
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: { code: 'FORBIDDEN', message: 'nope' } });
  });

  it('maps 413/415 HttpExceptions to their media codes', () => {
    const { host, json } = buildHost();
    handleException(host, new PayloadTooLargeException('big'), quietLogger());
    expect(json.mock.calls[0][0].error.code).toBe('PAYLOAD_TOO_LARGE');
    const second = buildHost();
    handleException(second.host, new UnsupportedMediaTypeException('type'), quietLogger());
    expect(second.json.mock.calls[0][0].error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('falls back to 500 INTERNAL for an unknown exception and logs it', () => {
    const { host, status, json } = buildHost();
    const logger = quietLogger();
    handleException(host, new Error('boom'), logger);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    });
    expect(logger.error).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `NX_DAEMON=false pnpm nx test api-http-errors --skip-nx-cache`
Expected: FAIL — `Cannot find module './exception-response'` (or unresolved exports).

- [ ] **Step 3: Implement the helper module**

Create `libs/api-http-errors/src/lib/exception-response.ts`:

```ts
import { ArgumentsHost, BadRequestException, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';

/** The canonical error envelope every API exception filter emits. */
export interface ErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

/**
 * Structural shape shared by every domain exception (AuthException,
 * CoursesException, VideoException, ProfileException, …). The helper is
 * domain-agnostic — it never imports a specific exception class. Each filter's
 * `@Catch(...)` list remains the explicit allowlist; this only routes what
 * `@Catch` already admitted.
 */
export type DomainShapedException = Error & {
  code: string;
  status: number;
  details?: Record<string, unknown>;
};

export interface HandleExceptionOptions {
  /** Map a NestJS BadRequestException to VALIDATION_FAILED + fieldErrors. */
  validation?: boolean;
}

const INTERNAL_ERROR_BODY: ErrorBody = {
  error: { code: 'INTERNAL', message: 'An internal error occurred.' },
};

export function isDomainShaped(exception: unknown): exception is DomainShapedException {
  return (
    exception instanceof Error &&
    typeof (exception as { code?: unknown }).code === 'string' &&
    typeof (exception as { status?: unknown }).status === 'number'
  );
}

export function codeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 415:
      return 'UNSUPPORTED_MEDIA_TYPE';
    case 422:
      return 'VALIDATION_ERROR';
    default:
      return 'HTTP_ERROR';
  }
}

export function formatLogLine(exception: unknown): string {
  if (exception instanceof Error) return exception.stack ?? exception.message;
  return String(exception);
}

/** class-validator emits "field must be …"; key field errors by the leading word. */
function parseFieldErrors(messages: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const msg of messages) {
    const field = msg.split(' ')[0];
    if (!field) continue;
    if (!out[field]) out[field] = [];
    out[field].push(msg);
  }
  return out;
}

function normalizeMessages(message: string[] | string | undefined): string[] {
  if (Array.isArray(message)) return message;
  return message ? [message] : [];
}

export function respondValidation(res: Response, exception: BadRequestException): void {
  const payload = exception.getResponse() as { message?: string[] | string };
  const messages = normalizeMessages(payload.message);
  res.status(400).json({
    error: {
      code: 'VALIDATION_FAILED',
      message: 'Request body failed validation.',
      details: { fieldErrors: parseFieldErrors(messages) },
    },
  } satisfies ErrorBody);
}

/**
 * Render `exception` to the HTTP response. Order: domain-shaped → (optional)
 * validation → plain HttpException → 500 INTERNAL. A BadRequestException is an
 * HttpException and is NOT domain-shaped (no own `code`), so the validation
 * branch is only reached when `opts.validation` is set.
 */
export function handleException(
  host: ArgumentsHost,
  exception: unknown,
  logger: Logger,
  opts: HandleExceptionOptions = {},
): void {
  const res = host.switchToHttp().getResponse<Response>();

  if (isDomainShaped(exception)) {
    const body: ErrorBody = { error: { code: exception.code, message: exception.message } };
    if (exception.details) body.error.details = exception.details;
    res.status(exception.status).json(body);
    return;
  }
  if (opts.validation && exception instanceof BadRequestException) {
    respondValidation(res, exception);
    return;
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    res.status(status).json({
      error: { code: codeForStatus(status), message: exception.message },
    } satisfies ErrorBody);
    return;
  }
  logger.error(formatLogLine(exception));
  res.status(500).json(INTERNAL_ERROR_BODY);
}
```

- [ ] **Step 4: Re-export from the lib index**

Replace `libs/api-http-errors/src/index.ts` with:

```ts
export * from './lib/exception-response';
```

Delete the generator placeholder if present:
```bash
rm -f libs/api-http-errors/src/lib/api-http-errors.ts libs/api-http-errors/src/lib/api-http-errors.spec.ts
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `NX_DAEMON=false pnpm nx test api-http-errors --skip-nx-cache`
Expected: PASS (all describe blocks green).

- [ ] **Step 6: Lint + typecheck the new lib**

Run: `NX_DAEMON=false pnpm nx run-many -t lint typecheck -p api-http-errors --skip-nx-cache`
Expected: PASS (0 errors).

- [ ] **Step 7: Commit**

```bash
git add libs/api-http-errors
git commit -m "feat(api-http-errors): handleException orchestrator + unified codeForStatus"
```

---

## Task 3: Migrate the five api-courses filters

**Files (modify):** the five courses filters + the cover spec. Each migrated filter keeps its `@Catch(...)` list and `Logger` name; the body becomes a single `handleException(...)` call and all module-private helpers/types are deleted.

- [ ] **Step 1: Migrate `CoursesExceptionFilter`**

Replace `libs/api-courses/src/lib/courses.exception-filter.ts` entirely with:

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { AuthException } from '@learnwren/api-auth';
import { handleException } from '@learnwren/api-http-errors';

import { CoursesException } from './errors/courses.exception';

/**
 * Narrowed to the domain + framework exception types with a stable wire shape;
 * anything else falls through to a generic 500 (no detail leaked). Rendering is
 * delegated to the shared api-http-errors helper.
 */
@Catch(CoursesException, AuthException, HttpException)
export class CoursesExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('CoursesExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger, { validation: true });
  }
}
```

- [ ] **Step 2: Migrate `VideoExceptionFilter`**

Replace `libs/api-courses/src/lib/video/video.exception-filter.ts` entirely with:

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { AuthException } from '@learnwren/api-auth';
import { handleException } from '@learnwren/api-http-errors';

import { CoursesException } from '../errors/courses.exception';
import { VideoException } from './errors/video.exception';

// Catches CoursesException because video routes reuse CourseOwnerGuard (which
// throws NotCourseOwnerException). Rendering delegated to the shared helper.
@Catch(VideoException, AuthException, CoursesException, HttpException)
export class VideoExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('VideoExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger, { validation: true });
  }
}
```

- [ ] **Step 3: Migrate `LearnExceptionFilter`**

Replace `libs/api-courses/src/lib/learn/learn.exception-filter.ts` entirely with:

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { AuthException } from '@learnwren/api-auth';
import { handleException } from '@learnwren/api-http-errors';

import { LearnException } from './errors/learn.exception';

@Catch(LearnException, AuthException, HttpException)
export class LearnExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('LearnExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger, { validation: true });
  }
}
```

- [ ] **Step 4: Migrate `MaterialsExceptionFilter`**

Replace `libs/api-courses/src/lib/materials/materials.exception-filter.ts` entirely with:

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { AuthException } from '@learnwren/api-auth';
import { handleException } from '@learnwren/api-http-errors';

import { CoursesException } from '../errors/courses.exception';
import { MaterialException } from './errors/material.exception';

@Catch(MaterialException, CoursesException, AuthException, HttpException)
export class MaterialsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('MaterialsExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger, { validation: true });
  }
}
```

- [ ] **Step 5: Migrate `CoverExceptionFilter` (no validation)**

Replace `libs/api-courses/src/lib/cover/cover.exception-filter.ts` entirely with:

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { handleException } from '@learnwren/api-http-errors';

import { CoverException } from './errors/cover.exception';

@Catch(CoverException, HttpException)
export class CoverExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('CoverExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger);
  }
}
```

- [ ] **Step 6: Update the cover spec's unified-default assertion**

In `libs/api-courses/src/lib/cover/cover.exception-filter.spec.ts`, change the unknown-status case (around line 85-86):

```ts
  it('defaults unknown statuses to HTTP_ERROR', () => {
    expect(mapHttpException(new HttpException('teapot', 418))).toEqual({ status: 418, code: 'HTTP_ERROR' });
  });
```

(If the spec's `mapHttpException` test helper references a now-deleted exported function, repoint it to drive the filter's `catch()` and read the captured response — the other cases in that same `describe` show the pattern. If it already drives the filter, only the expected `code` string changes.)

- [ ] **Step 7: Run the api-courses unit suite**

Run: `NX_DAEMON=false pnpm nx test api-courses --skip-nx-cache -- --run`
Expected: PASS (all suites; the five migrated filters' existing specs still pass, cover's updated assertion passes).

- [ ] **Step 8: Lint + typecheck api-courses**

Run: `NX_DAEMON=false pnpm nx run-many -t lint typecheck -p api-courses --skip-nx-cache`
Expected: PASS (0 errors; no unused-import warnings from the removed imports).

- [ ] **Step 9: Commit**

```bash
git add libs/api-courses/src/lib/courses.exception-filter.ts \
        libs/api-courses/src/lib/video/video.exception-filter.ts \
        libs/api-courses/src/lib/learn/learn.exception-filter.ts \
        libs/api-courses/src/lib/materials/materials.exception-filter.ts \
        libs/api-courses/src/lib/cover/cover.exception-filter.ts \
        libs/api-courses/src/lib/cover/cover.exception-filter.spec.ts
git commit -m "refactor(api-courses): delegate exception filters to api-http-errors"
```

---

## Task 4: Migrate the three api-profile filters

**Files (modify):** the three profile filters. All three are no-validation; the email filter's separate `AuthException` branch collapses into the shared domain-shaped path (AuthException is domain-shaped), and its `@Catch` list keeps `AuthException`.

- [ ] **Step 1: Migrate `ProfileExceptionFilter`**

Replace `libs/api-profile/src/lib/profile.exception-filter.ts` entirely with:

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { handleException } from '@learnwren/api-http-errors';

import { ProfileException } from './errors/profile.exception';

@Catch(ProfileException, HttpException)
export class ProfileExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProfileExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger);
  }
}
```

- [ ] **Step 2: Migrate `EmailChangeExceptionFilter`**

Replace `libs/api-profile/src/lib/email/email.exception-filter.ts` entirely with:

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { AuthException } from '@learnwren/api-auth';
import { handleException } from '@learnwren/api-http-errors';

import { EmailChangeException } from './errors/email-change.exception';

@Catch(EmailChangeException, AuthException, HttpException)
export class EmailChangeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('EmailChangeExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger);
  }
}
```

- [ ] **Step 3: Migrate `PictureExceptionFilter`**

Replace `libs/api-profile/src/lib/picture/picture.exception-filter.ts` entirely with:

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { handleException } from '@learnwren/api-http-errors';

import { PictureException } from './errors/picture.exception';

@Catch(PictureException, HttpException)
export class PictureExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('PictureExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger);
  }
}
```

- [ ] **Step 4: Run the api-profile unit suite**

Run: `NX_DAEMON=false pnpm nx test api-profile --skip-nx-cache -- --run`
Expected: PASS. If any spec pins an unknown-status default of `'ERROR'` for these filters, update it to `'HTTP_ERROR'` (per the spec, none currently do — but fix if surfaced).

- [ ] **Step 5: Lint + typecheck api-profile**

Run: `NX_DAEMON=false pnpm nx run-many -t lint typecheck -p api-profile --skip-nx-cache`
Expected: PASS (0 errors).

- [ ] **Step 6: Commit**

```bash
git add libs/api-profile/src/lib/profile.exception-filter.ts \
        libs/api-profile/src/lib/email/email.exception-filter.ts \
        libs/api-profile/src/lib/picture/picture.exception-filter.ts
git commit -m "refactor(api-profile): delegate exception filters to api-http-errors"
```

---

## Task 5: Migrate the api-auth filter

**Files (modify):** `libs/api-auth/src/lib/auth.exception-filter.ts`. No validation. `AuthException` is imported locally (it is defined in api-auth).

- [ ] **Step 1: Migrate `AuthExceptionFilter`**

Replace `libs/api-auth/src/lib/auth.exception-filter.ts` entirely with:

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import { handleException } from '@learnwren/api-http-errors';

import { AuthException } from './errors/auth.exception';

@Catch(AuthException, HttpException)
export class AuthExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('AuthExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger);
  }
}
```

- [ ] **Step 2: Run the api-auth unit suite**

Run: `NX_DAEMON=false pnpm nx test api-auth --skip-nx-cache -- --run`
Expected: PASS. The auth spec's `418 → HTTP_ERROR` fallback case already expects `HTTP_ERROR`, so no change.

- [ ] **Step 3: Lint + typecheck api-auth**

Run: `NX_DAEMON=false pnpm nx run-many -t lint typecheck -p api-auth --skip-nx-cache`
Expected: PASS (0 errors).

- [ ] **Step 4: Commit**

```bash
git add libs/api-auth/src/lib/auth.exception-filter.ts
git commit -m "refactor(api-auth): delegate AuthExceptionFilter to api-http-errors"
```

---

## Task 6: Full regression gate

**Files:** none (verification only).

- [ ] **Step 1: Unit + lint + typecheck across all touched libs**

Run:
```bash
NX_DAEMON=false pnpm nx run-many -t test lint typecheck \
  -p api-http-errors api-auth api-courses api-profile --skip-nx-cache
```
Expected: PASS for all targets.

- [ ] **Step 2: Run the api-e2e suite (exercises the real filter chain)**

Ensure the Firebase emulators are running (Auth/Firestore/Storage on 9099/8080/9199). If not, start them in a separate terminal (`pnpm emulators`) or use `firebase emulators:exec`. Then:
```bash
NX_DAEMON=false CI= pnpm nx e2e api-e2e --skip-nx-cache
```
Expected: PASS / 0 failures (the auth-rejection, validation, ownership, and webhook-auth paths all flow through the migrated filters). The `webhook auth — production-style route rejects unsigned envelopes` and the validation/403 cases are the key proofs.

- [ ] **Step 3: Confirm no leftover per-filter helpers**

Run:
```bash
grep -rn "function codeForStatus\|function respondValidation\|function parseFieldErrors\|function formatLogLine" libs/api-auth libs/api-courses libs/api-profile
```
Expected: no matches (all moved into `api-http-errors`).

---

## Self-Review notes

- **Spec coverage:** new lib (Tasks 1–2) ✓; unified mapping incl. `HTTP_ERROR` default + 413/415 (Task 2 `codeForStatus` + test) ✓; per-feature filters preserved (Tasks 3–5 keep `@Catch`/`Logger`/registration) ✓; validation only on the four courses-tier filters (`{ validation: true }`) ✓; cover spec update (Task 3 Step 6) ✓; regression gate incl. e2e (Task 6) ✓.
- **Type/name consistency:** `handleException(host, exception, logger, { validation })`, `isDomainShaped`, `codeForStatus`, `respondValidation`, `formatLogLine`, `ErrorBody`, `DomainShapedException`, `HandleExceptionOptions` are used identically in the lib, its spec, and every migrated filter.
- **No placeholders:** every migrated filter and the helper/spec are shown in full; the only "verify and adjust" notes are the generator flag check (Task 1, per repo's "never guess flags" rule) and the cover-spec helper repoint (only if it referenced an exported private fn).
