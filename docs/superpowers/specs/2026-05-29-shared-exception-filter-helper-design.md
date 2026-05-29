> [!NOTE]
> DOCUMENT STATUS: DRAFT

# Shared Exception-Filter Helper (`api-http-errors`)

## Context

The API has **nine** NestJS exception filters, one per feature/submodule, following the
project's standing convention: each feature owns its own `@Catch(...)` filter, registered
via `@UseFilters(...)` (never a single shared global filter). See
`feedback_api_courses_per_feature_filters` — the pattern was set by `VideoExceptionFilter`.

| Filter | Lib | Validation? | Default code |
| :-- | :-- | :-- | :-- |
| `AuthExceptionFilter` | api-auth | no | `HTTP_ERROR` |
| `CoursesExceptionFilter` | api-courses | yes | `HTTP_ERROR` |
| `VideoExceptionFilter` | api-courses | yes | `HTTP_ERROR` |
| `LearnExceptionFilter` | api-courses | yes | `HTTP_ERROR` |
| `MaterialsExceptionFilter` | api-courses | yes | `HTTP_ERROR` |
| `CoverExceptionFilter` | api-courses | no | `ERROR` |
| `ProfileExceptionFilter` | api-profile | no | `ERROR` |
| `EmailChangeExceptionFilter` | api-profile | no | `ERROR` |
| `PictureExceptionFilter` | api-profile | no | `ERROR` |

These filters total ~786 LOC and are heavily duplicated: the response envelope, the
`status → code` mapping, the `BadRequestException` → `VALIDATION_FAILED` field-error
parsing, the log-line formatter, and the `500 INTERNAL` fallback are byte-identical (or
near-identical) across most of them. Two recent production bugs (a `CoursesException`
escaping `VideoExceptionFilter` as a 500; a missing `@UseFilters` on
`TranscoderEventsController`) both stemmed from this filter layer, underscoring the value
of a single, well-tested rendering core.

The duplication has also drifted: the api-profile tier and `CoverExceptionFilter` return
`ERROR` for an unknown status where the api-auth/api-courses tier returns `HTTP_ERROR`
(flagged in the codebase audit).

## Goals

- Extract the duplicated rendering logic into **one** shared, well-tested helper module.
- **Preserve** the per-feature-filter convention: every filter keeps its own class,
  its explicit `@Catch(...)` allowlist, its DI, and its `@UseFilters` registration.
- **Unify** the divergent `status → code` mapping into one canonical table (resolving the
  `ERROR` vs `HTTP_ERROR` inconsistency).
- Reduce the nine filters to thin shells delegating to the shared helper.

## Non-Goals

- No move to a single global filter (`APP_FILTER` / `useGlobalFilters`). The per-feature
  ownership model is retained deliberately.
- No change to which exceptions each filter catches (each `@Catch(...)` list is unchanged).
- No change to the response **envelope** shape — all nine already emit
  `{ error: { code, message, details? } }`.
- No new error codes or messages beyond unifying the existing `status → code` table.

## The new library: `api-http-errors`

A new plain TypeScript util lib (`@nx/js:lib`, **non-buildable/tsc, no Nest module**) at
`libs/api-http-errors`, path alias `@learnwren/api-http-errors`.

- **Dependencies:** `@nestjs/common` (for `ArgumentsHost`, `BadRequestException`,
  `HttpException`, `Logger`) and the express `Response` type only. It imports **none** of
  the api-* domain libs, so there is no dependency cycle: api-auth, api-courses, and
  api-profile may all depend on it.
- **Nx tags:** `scope:api`, `type:util`. The `enforce-module-boundaries` rule permits
  `scope:api` libs to import a `scope:api` util lib.

### Exports

```ts
// The canonical error envelope every filter emits.
export interface ErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

// Structural shape shared by every domain exception (AuthException, CoursesException,
// VideoException, ProfileException, …). The helper is domain-agnostic: it never imports
// or references a specific exception class. The per-filter @Catch(...) list remains the
// explicit allowlist of what may reach the filter; isDomainShaped only ROUTES what
// @Catch already admitted.
export type DomainShapedException = Error & {
  code: string;
  status: number;
  details?: Record<string, unknown>;
};
export function isDomainShaped(exception: unknown): exception is DomainShapedException;

// The unified status → code mapping (single source of truth).
export function codeForStatus(status: number): string;

// The byte-identical class-validator field-error parser, used only by filters that opt
// into validation handling.
export function respondValidation(res: Response, exception: BadRequestException): void;

// Log-line formatter for the unknown-exception path.
export function formatLogLine(exception: unknown): string;

// The orchestrator. Runs the exact current order of checks and writes the response.
export interface HandleExceptionOptions {
  /** Map a NestJS BadRequestException to VALIDATION_FAILED + fieldErrors. Default false. */
  validation?: boolean;
}
export function handleException(
  host: ArgumentsHost,
  exception: unknown,
  logger: Logger,
  opts?: HandleExceptionOptions,
): void;
```

### Canonical `codeForStatus` table

| Status | Code |
| :-- | :-- |
| 400 | `BAD_REQUEST` |
| 401 | `UNAUTHORIZED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `VALIDATION_ERROR` |
| *(default)* | `HTTP_ERROR` |

### `handleException` control flow

Exact order preserved from the current filters:

1. `isDomainShaped(exception)` → write `exception.status` + `{ error: { code, message,
   details? } }` (details included only when present).
2. `opts.validation && exception instanceof BadRequestException` → `respondValidation`
   (`VALIDATION_FAILED` / "Request body failed validation." / `{ fieldErrors }`).
   A `BadRequestException` is an `HttpException` and is **not** domain-shaped (no `code`
   field), so this branch is correctly reached only when validation is enabled.
3. `exception instanceof HttpException` → `exception.getStatus()` +
   `{ error: { code: codeForStatus(status), message: exception.message } }`.
4. otherwise → `logger.error(formatLogLine(exception))` + `500`
   `{ error: { code: 'INTERNAL', message: 'An internal error occurred.' } }`.

## Per-filter shape after migration

Each filter keeps its class name, `@Catch(...)` allowlist, logger, and registration, and
delegates its body to the helper. Example:

```ts
@Catch(VideoException, AuthException, CoursesException, HttpException)
export class VideoExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('VideoExceptionFilter');
  catch(exception: unknown, host: ArgumentsHost): void {
    handleException(host, exception, this.logger, { validation: true });
  }
}
```

- Validation-handling filters (`Courses`, `Video`, `Learn`, `Materials`) pass
  `{ validation: true }`.
- The other five pass no options (validation defaults to off), exactly matching today's
  behavior.

Each filter shrinks to ~10–15 lines; the shared logic lives once in the lib.

## Behavior change (from the unify decision)

Common statuses (400/401/403/404/409/413/415/422 where each filter already mapped them)
are **byte-identical** before and after. The only changes:

- The four api-profile-tier / cover filters now return `HTTP_ERROR` (was `ERROR`) for an
  **unknown** status. This only affects status codes none of those routes currently emit;
  it is the intended consistency fix.
- All filters now carry the full table (e.g. courses-tier filters gain 413/415 entries),
  harmless on paths that never produce those statuses.

### Tests to update for the unified mapping

Exactly one assertion pins the divergent default (verified):

- `libs/api-courses/src/lib/cover/cover.exception-filter.spec.ts:85-86` — the
  "defaults unknown statuses to ERROR" case asserts `418 → 'ERROR'`; update the label and
  expectation to `'HTTP_ERROR'`.

The api-profile specs (`profile`, `email`, `picture`) do **not** test the unknown-status
branch, so no changes are needed there for the mapping change. (`cover` also exposes a
testable `mapHttpException` helper today — prior art for the extraction.)

## Testing strategy

- **New lib spec** (`libs/api-http-errors`): the consolidated, authoritative coverage —
  the full `codeForStatus` table including the unified default; `isDomainShaped`
  (true for a `{code,status}` Error, false for a plain `HttpException` /
  `BadRequestException` / arbitrary object); `respondValidation` field-error parsing
  (single + multiple messages); `formatLogLine`; and `handleException` routing through all
  four branches with and without `validation`.
- **Existing filter specs** stay as the proof each filter's `@Catch`/delegation still
  produces the correct output. Most pass unchanged; the few pinning the `ERROR` default
  are updated as above. Where a filter spec currently re-tests the full mapping table
  in-place, those redundant cases may be trimmed to a representative assertion (the lib
  spec now owns exhaustive coverage), but trimming is optional and not required for
  correctness.
- **Regression gate:** `nx run-many -t test` for `api-http-errors`, `api-auth`,
  `api-courses`, `api-profile`; `lint` + `typecheck` for all changed projects; and the
  `api-e2e` suite (which exercises the real filter chain end-to-end, including the auth
  rejection / validation / ownership paths).

## Migration order

1. Scaffold `libs/api-http-errors` via the nx generator; wire the path alias + tags.
2. Implement the helper module and its spec (TDD); get the lib green in isolation.
3. Migrate the five api-courses filters; run api-courses unit + lint/typecheck.
4. Migrate the three api-profile filters; run api-profile unit + lint/typecheck.
5. Migrate the one api-auth filter; run api-auth unit + lint/typecheck.
6. Full regression gate (unit run-many + affected e2e).

## Risks & mitigations

- **Structural `isDomainShaped` over-matching.** A plain `HttpException` has no own `code`
  property, so it is not domain-shaped; the `@Catch(...)` allowlist further bounds inputs.
  The lib spec pins this explicitly.
- **Order sensitivity.** Validation must be checked before the generic `HttpException`
  branch; encoded once in `handleException` and unit-tested, removing the chance of
  per-filter drift.
- **Cross-lib dependency direction.** The helper imports no api-* lib, so adding it as a
  dependency of api-auth/api-courses/api-profile cannot create a cycle.
- **Nx module boundaries.** New lib tagged `scope:api`/`type:util`; if the workspace's
  `depConstraints` are stricter than expected, adjust tags during step 1 before migrating.
