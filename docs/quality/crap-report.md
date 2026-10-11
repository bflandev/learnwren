# CRAP Score Report

> Generated 2026-10-11T23:59:35.913Z

Threshold: **30** (canonical Savoia/Evans cutoff for "crappy").

Formula: `CRAP(m) = comp(m)² × (1 − cov(m)/100)³ + comp(m)`. Complexity counts `if`, `case`, `?:`, `&&`/`||`/`??`, `for`/`while`/`do`, `catch`. Coverage is **branch coverage** from Vitest V8→Istanbul `coverage-final.json`, joined per function by AST line range. Falls back to function-hit (0% / 100%) and then statement coverage when no branches exist in the range.

## Projects covered

- ✅ `coverage/libs/api-auth`
- ✅ `coverage/libs/api-courses`
- ✅ `coverage/libs/api-document-store`
- ✅ `coverage/libs/api-firebase`
- ✅ `coverage/libs/api-http-errors`
- ✅ `coverage/libs/api-object-storage`
- ✅ `coverage/libs/api-profile`
- ✅ `coverage/libs/shared-data-models`
- ✅ `coverage/libs/web-admin`
- ✅ `coverage/libs/web-auth`
- ✅ `coverage/libs/web-catalog`
- ✅ `coverage/libs/web-courses`
- ✅ `coverage/libs/web-data-table`
- ✅ `coverage/libs/web-design-system`
- ✅ `coverage/libs/web-enrollment`
- ✅ `coverage/libs/web-landing`
- ✅ `coverage/libs/web-learn`
- ✅ `coverage/libs/web-profile`
- ✅ `coverage/libs/web-ui`
- ✅ `coverage/libs/web-video`
- ✅ `coverage/apps/api`
- ❌ `coverage/apps/web` — no coverage emitted (no tests, or test run skipped)

## Codebase summary

- Functions analyzed (excluding modules/configs/tests): **2766**
- Clean (≤5): **2647**
- Acceptable (6–15): **119**
- Risky (16–30): **0**
- Crappy (>30): **0**

## Top offenders (max 20, complexity > 1)

| # | Function | File:line | Comp | Cov % | Basis | CRAP | Verdict |
|---|----------|-----------|------|-------|-------|------|---------|
| 1 | `<anonymous>` | `libs/api-courses/src/lib/enrollment/enrollment.repository.ts:167` | 13 | 100.0 | branch | 13.00 | acceptable |
| 2 | `getReport` | `libs/api-courses/src/lib/health/admin-health.service.ts:35` | 13 | 100.0 | branch | 13.00 | acceptable |
| 3 | `applyMaskWithSkeleton` | `libs/web-ui/src/lib/masked-date/masked-date-core.ts:123` | 13 | 100.0 | file-branch-fallback | 13.00 | acceptable |
| 4 | `projectOutline` | `libs/api-courses/src/lib/learn/learn.service.ts:111` | 11 | 100.0 | branch | 11.00 | acceptable |
| 5 | `displayValue` | `libs/web-data-table/src/lib/inline-editor/data-table-inline-editor.component.ts:230` | 11 | 100.0 | file-branch-fallback | 11.00 | acceptable |
| 6 | `<anonymous>` | `libs/api-courses/src/lib/analytics/analytics.service.ts:61` | 10 | 100.0 | branch | 10.00 | acceptable |
| 7 | `parseEvent` | `libs/api-courses/src/lib/video/transcoder/gcp-transcoder.adapter.ts:63` | 10 | 100.0 | branch | 10.00 | acceptable |
| 8 | `store` | `libs/api-courses/src/lib/video/upload/video-upload-proxy.controller.ts:112` | 10 | 100.0 | branch | 10.00 | acceptable |
| 9 | `codeForStatus` | `libs/api-http-errors/src/lib/exception-response.ts:39` | 10 | 100.0 | branch | 10.00 | acceptable |
| 10 | `<anonymous>` | `libs/web-ui/src/lib/state/hlm-state-pill.component.ts:52` | 10 | 100.0 | file-branch-fallback | 10.00 | acceptable |
| 11 | `<anonymous>` | `libs/api-auth/src/lib/auth-attempts.repository.ts:73` | 9 | 100.0 | branch | 9.00 | acceptable |
| 12 | `<anonymous>` | `libs/api-auth/src/lib/identity/local-identity-provider.ts:236` | 9 | 100.0 | branch | 9.00 | acceptable |
| 13 | `uploadCover` | `libs/api-courses/src/lib/cover/cover-image.service.ts:33` | 9 | 100.0 | branch | 9.00 | acceptable |
| 14 | `<anonymous>` | `libs/api-courses/src/lib/enrollment/enrollment.repository.ts:303` | 9 | 100.0 | branch | 9.00 | acceptable |
| 15 | `canActivate` | `libs/api-courses/src/lib/learn/guards/lesson-enrollment.guard.ts:21` | 9 | 100.0 | branch | 9.00 | acceptable |
| 16 | `getDetail` | `libs/api-profile/src/lib/users/admin-users.service.ts:80` | 9 | 100.0 | branch | 9.00 | acceptable |
| 17 | `load` | `libs/web-catalog/src/lib/catalog-page/catalog-page.component.ts:91` | 9 | 100.0 | file-branch-fallback | 9.00 | acceptable |
| 18 | `load` | `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts:185` | 9 | 100.0 | file-branch-fallback | 9.00 | acceptable |
| 19 | `onMetadata` | `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts:238` | 9 | 100.0 | file-branch-fallback | 9.00 | acceptable |
| 20 | `applyMask` | `libs/web-ui/src/lib/masked-date/masked-date-core.ts:58` | 9 | 100.0 | file-branch-fallback | 9.00 | acceptable |

## Recommendation per offender

1. `<anonymous>` (libs/api-courses/src/lib/enrollment/enrollment.repository.ts:167) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
2. `getReport` (libs/api-courses/src/lib/health/admin-health.service.ts:35) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
3. `applyMaskWithSkeleton` (libs/web-ui/src/lib/masked-date/masked-date-core.ts:123) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
4. `projectOutline` (libs/api-courses/src/lib/learn/learn.service.ts:111) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
5. `displayValue` (libs/web-data-table/src/lib/inline-editor/data-table-inline-editor.component.ts:230) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
6. `<anonymous>` (libs/api-courses/src/lib/analytics/analytics.service.ts:61) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
7. `parseEvent` (libs/api-courses/src/lib/video/transcoder/gcp-transcoder.adapter.ts:63) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
8. `store` (libs/api-courses/src/lib/video/upload/video-upload-proxy.controller.ts:112) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
9. `codeForStatus` (libs/api-http-errors/src/lib/exception-response.ts:39) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
10. `<anonymous>` (libs/web-ui/src/lib/state/hlm-state-pill.component.ts:52) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
11. `<anonymous>` (libs/api-auth/src/lib/auth-attempts.repository.ts:73) — **refactor — coverage is fine; the branching is the problem**
12. `<anonymous>` (libs/api-auth/src/lib/identity/local-identity-provider.ts:236) — **refactor — coverage is fine; the branching is the problem**
13. `uploadCover` (libs/api-courses/src/lib/cover/cover-image.service.ts:33) — **refactor — coverage is fine; the branching is the problem**
14. `<anonymous>` (libs/api-courses/src/lib/enrollment/enrollment.repository.ts:303) — **refactor — coverage is fine; the branching is the problem**
15. `canActivate` (libs/api-courses/src/lib/learn/guards/lesson-enrollment.guard.ts:21) — **refactor — coverage is fine; the branching is the problem**
16. `getDetail` (libs/api-profile/src/lib/users/admin-users.service.ts:80) — **refactor — coverage is fine; the branching is the problem**
17. `load` (libs/web-catalog/src/lib/catalog-page/catalog-page.component.ts:91) — **refactor — coverage is fine; the branching is the problem**
18. `load` (libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts:185) — **refactor — coverage is fine; the branching is the problem**
19. `onMetadata` (libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts:238) — **refactor — coverage is fine; the branching is the problem**
20. `applyMask` (libs/web-ui/src/lib/masked-date/masked-date-core.ts:58) — **refactor — coverage is fine; the branching is the problem**

## Caveats

- **Coverage basis column** indicates how each function's coverage was computed: `branch` (per-function branch coverage in source line range — most accurate), `statement`/`fn-hit` (degraded fallback), `file-branch-fallback` (the V8 coverage line numbers were post-transform — usually @analogjs/vite-plugin-angular — so we attribute the file's overall branch coverage to every function in the file). Treat `*-fallback` rows as estimates.
- **Function-to-coverage join is line-range-based.** A nested arrow inside a class property may inherit the enclosing function's branch hits; treat scores within ±20% as noise.
- **Test quality is unmeasured.** Coverage records that a line ran, not that the assertion was meaningful. Pair with mutation testing (Stryker / vitest mutation runners) for high-stakes modules.
- **Coupling and churn are absent.** A crappy method nobody touches is lower priority than a moderate-CRAP method edited every sprint. Cross-reference with `git log --follow` before declaring a remediation order.
- **Files with no Istanbul record are not in this report.** Source modules never imported by any test are silently absent — they may be the bigger risk. The "Projects covered" list shows what was actually exercised.
- **Index, main, module, and config files are excluded.** They are barrel files / framework wiring whose CRAP is rarely actionable.
