---
name: new-slice
description: Use when implementing a new feature slice, API endpoint, controller, or web page in Learn Wren — before writing code in libs/api-* or libs/web-*, or when a typed error code comes back as a generic 400, a guard-coverage test fails, or a shared-type change breaks a lib silently.
---

# New Slice Conventions (Learn Wren)

The repo's load-bearing seams. Reuse them; re-deriving any of these has produced real bugs.

## API (libs/api-*)

- **Feature folder** per concern inside the lib (mirror `libs/api-courses/src/lib/analytics/` — controller + service + specs).
- **Exceptions** are `{code, status, details?}`-shaped classes; each feature has a per-feature exception filter whose rendering delegates to `handleException()` from `api-http-errors`. The filter must catch **every** exception type its guards/routes can throw.
- **DTOs are type guards only.** No `@Length`/`@Min` etc. — ValidationPipe decorators pre-empt the service's typed error codes (a `WEAK_PASSWORD` becomes a generic 400). Validate in the service.
- **Guards:** every controller carries `@UseGuards(FirebaseSessionGuard, …)` on one class-level line, or joins `PUBLIC_ALLOWLIST` in `apps/api/src/controller-guard-coverage.spec.ts`. A truly-admin route uses `AdminRoleGuard`; never allowlist to silence the spec.
- **Repositories** are thin Firestore adapters (mutation-excluded, e2e-verified). Cross-cutting seams to route through, not re-implement: `nowIso()`, `evaluatePasswordPolicy()`, `PasswordVerificationService`, `revokeAllUserSessions`, `runTransactionWithRetry`, `readStoredUserProfiles`.
- **Config** = `Symbol.for` token + `read<X>ConfigFromEnv(env)` that fails startup on invalid values, provided via `useFactory` in the module (pattern: `video.config.ts`).
- **Fake adapters must mirror the real provider's output shape** (derive names from the shared seam, e.g. `hls-naming.ts`) — a hand-invented fake layout once masked broken real playback.

## Web (libs/web-*)

- **Service = thin Promise-returning HTTP wrapper** (`firstValueFrom(this.http…)`); no state, no logic.
- **Component owns state** via signals, `OnPush`, `inject()`; pages that load data use the `loadToken` idiom so stale responses can't overwrite fresh ones.
- **Separate `.html` templateUrl** (Stryker skips templates; inline templates get mutated).
- Route in the lib's `*.routes.ts` (lazy `loadComponent`); nav links live in `apps/web/src/app/app.html`.

## Traps that fail silently

| Trap | Symptom | Fix |
|---|---|---|
| New `@learnwren/<lib>` import reachable from apps/web routes | `nx test web` passes, `nx typecheck web` fails (or vice versa) | Hand-add the project ref in `apps/web/tsconfig.spec.json` |
| vitest masks tsc errors | Suite green but the lib doesn't compile | Always run `nx typecheck <lib>` too |
| Adding a required field to a shared type | api-courses breaks with no test failure | Same: typecheck every consumer |
| api-e2e importing `@learnwren/shared-data-models` | Unresolvable — no project ref | Inline structural types (sibling-spec convention) |

## Definition of done

TDD throughout; guard-coverage green with no allowlist edit; docs sync = README status block + `docs/USER_GUIDE.md` + `docs/quality/spec-drift-report.md`; specs keep their DRAFT banner.
