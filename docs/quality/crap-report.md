# CRAP Score Report

> Generated 2026-05-25T16:42:39.067Z

Threshold: **30** (canonical Savoia/Evans cutoff for "crappy").

Formula: `CRAP(m) = comp(m)² × (1 − cov(m)/100)³ + comp(m)`. Complexity counts `if`, `case`, `?:`, `&&`/`||`/`??`, `for`/`while`/`do`, `catch`. Coverage is **branch coverage** from Vitest V8→Istanbul `coverage-final.json`, joined per function by AST line range. Falls back to function-hit (0% / 100%) and then statement coverage when no branches exist in the range.

## Projects covered

- ✅ `coverage/libs/api-auth`
- ✅ `coverage/libs/api-courses`
- ✅ `coverage/libs/api-firebase`
- ✅ `coverage/libs/shared-data-models`
- ✅ `coverage/libs/web-auth`
- ✅ `coverage/libs/web-catalog`
- ✅ `coverage/libs/web-courses`
- ✅ `coverage/libs/web-enrollment`
- ✅ `coverage/libs/web-learn`
- ✅ `coverage/libs/web-ui`
- ✅ `coverage/libs/web-video`
- ✅ `coverage/apps/api`
- ❌ `coverage/apps/web` — no coverage emitted (no tests, or test run skipped)

## Codebase summary

- Functions analyzed (excluding modules/configs/tests): **817**
- Clean (≤5): **767**
- Acceptable (6–15): **50**
- Risky (16–30): **0**
- Crappy (>30): **0**

## Top offenders (max 20, complexity > 1)

| # | Function | File:line | Comp | Cov % | Basis | CRAP | Verdict |
|---|----------|-----------|------|-------|-------|------|---------|
| 1 | `reasonText` | `libs/web-courses/src/lib/publish/publish-eligibility-panel.component.ts:40` | 9 | 90.9 | file-branch-fallback | 9.06 | acceptable |
| 2 | `<anonymous>` | `libs/api-courses/src/lib/enrollment/enrollment.repository.ts:53` | 9 | 100.0 | branch | 9.00 | acceptable |
| 3 | `parseEvent` | `libs/api-courses/src/lib/video/transcoder/gcp-transcoder.adapter.ts:58` | 9 | 100.0 | branch | 9.00 | acceptable |
| 4 | `userMessageFor` | `libs/web-video/src/lib/player/video-player.service.ts:12` | 9 | 100.0 | file-branch-fallback | 9.00 | acceptable |
| 5 | `onConfirmClosed` | `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts:111` | 8 | 86.8 | file-branch-fallback | 8.15 | acceptable |
| 6 | `<anonymous>` | `libs/web-video/src/lib/video-state-badge.component.ts:28` | 8 | 93.8 | file-branch-fallback | 8.02 | acceptable |
| 7 | `<anonymous>` | `libs/web-video/src/lib/video-state-badge.component.ts:47` | 8 | 93.8 | file-branch-fallback | 8.02 | acceptable |
| 8 | `canActivate` | `libs/api-courses/src/lib/video/playback/enrollment-or-owner.guard.ts:23` | 8 | 100.0 | branch | 8.00 | acceptable |
| 9 | `parseEvent` | `libs/api-courses/src/lib/video/transcoder/fake-transcoder.adapter.ts:41` | 8 | 100.0 | branch | 8.00 | acceptable |
| 10 | `<anonymous>` | `libs/web-auth/src/lib/password-policy.validator.ts:21` | 8 | 100.0 | file-branch-fallback | 8.00 | acceptable |
| 11 | `toLoginErr` | `libs/web-auth/src/lib/auth.service.ts:119` | 7 | 90.5 | file-branch-fallback | 7.04 | acceptable |
| 12 | `load` | `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts:47` | 7 | 92.9 | file-branch-fallback | 7.02 | acceptable |
| 13 | `start` | `libs/web-video/src/lib/upload/video-upload.service.ts:66` | 7 | 93.2 | file-branch-fallback | 7.02 | acceptable |
| 14 | `putChunkWithRetry` | `libs/web-video/src/lib/upload/video-upload.service.ts:155` | 7 | 93.2 | file-branch-fallback | 7.02 | acceptable |
| 15 | `codeForStatus` | `libs/api-auth/src/lib/auth.exception-filter.ts:63` | 7 | 100.0 | branch | 7.00 | acceptable |
| 16 | `validate` | `libs/api-auth/src/lib/password-policy.service.ts:26` | 7 | 100.0 | branch | 7.00 | acceptable |
| 17 | `codeForStatus` | `libs/api-courses/src/lib/courses.exception-filter.ts:66` | 7 | 100.0 | branch | 7.00 | acceptable |
| 18 | `codeForStatus` | `libs/api-courses/src/lib/learn/learn.exception-filter.ts:61` | 7 | 100.0 | branch | 7.00 | acceptable |
| 19 | `canActivate` | `libs/api-courses/src/lib/materials/material-access.guard.ts:27` | 7 | 100.0 | branch | 7.00 | acceptable |
| 20 | `codeForStatus` | `libs/api-courses/src/lib/materials/materials.exception-filter.ts:68` | 7 | 100.0 | branch | 7.00 | acceptable |

## Recommendation per offender

1. `reasonText` (libs/web-courses/src/lib/publish/publish-eligibility-panel.component.ts:40) — **refactor — coverage is fine; the branching is the problem**
2. `<anonymous>` (libs/api-courses/src/lib/enrollment/enrollment.repository.ts:53) — **refactor — coverage is fine; the branching is the problem**
3. `parseEvent` (libs/api-courses/src/lib/video/transcoder/gcp-transcoder.adapter.ts:58) — **refactor — coverage is fine; the branching is the problem**
4. `userMessageFor` (libs/web-video/src/lib/player/video-player.service.ts:12) — **refactor — coverage is fine; the branching is the problem**
5. `onConfirmClosed` (libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts:111) — **refactor — coverage is fine; the branching is the problem**
6. `<anonymous>` (libs/web-video/src/lib/video-state-badge.component.ts:28) — **refactor — coverage is fine; the branching is the problem**
7. `<anonymous>` (libs/web-video/src/lib/video-state-badge.component.ts:47) — **refactor — coverage is fine; the branching is the problem**
8. `canActivate` (libs/api-courses/src/lib/video/playback/enrollment-or-owner.guard.ts:23) — **refactor — coverage is fine; the branching is the problem**
9. `parseEvent` (libs/api-courses/src/lib/video/transcoder/fake-transcoder.adapter.ts:41) — **refactor — coverage is fine; the branching is the problem**
10. `<anonymous>` (libs/web-auth/src/lib/password-policy.validator.ts:21) — **refactor — coverage is fine; the branching is the problem**
11. `toLoginErr` (libs/web-auth/src/lib/auth.service.ts:119) — **refactor — coverage is fine; the branching is the problem**
12. `load` (libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts:47) — **refactor — coverage is fine; the branching is the problem**
13. `start` (libs/web-video/src/lib/upload/video-upload.service.ts:66) — **refactor — coverage is fine; the branching is the problem**
14. `putChunkWithRetry` (libs/web-video/src/lib/upload/video-upload.service.ts:155) — **refactor — coverage is fine; the branching is the problem**
15. `codeForStatus` (libs/api-auth/src/lib/auth.exception-filter.ts:63) — **refactor — coverage is fine; the branching is the problem**
16. `validate` (libs/api-auth/src/lib/password-policy.service.ts:26) — **refactor — coverage is fine; the branching is the problem**
17. `codeForStatus` (libs/api-courses/src/lib/courses.exception-filter.ts:66) — **refactor — coverage is fine; the branching is the problem**
18. `codeForStatus` (libs/api-courses/src/lib/learn/learn.exception-filter.ts:61) — **refactor — coverage is fine; the branching is the problem**
19. `canActivate` (libs/api-courses/src/lib/materials/material-access.guard.ts:27) — **refactor — coverage is fine; the branching is the problem**
20. `codeForStatus` (libs/api-courses/src/lib/materials/materials.exception-filter.ts:68) — **refactor — coverage is fine; the branching is the problem**

## Caveats

- **Coverage basis column** indicates how each function's coverage was computed: `branch` (per-function branch coverage in source line range — most accurate), `statement`/`fn-hit` (degraded fallback), `file-branch-fallback` (the V8 coverage line numbers were post-transform — usually @analogjs/vite-plugin-angular — so we attribute the file's overall branch coverage to every function in the file). Treat `*-fallback` rows as estimates.
- **Function-to-coverage join is line-range-based.** A nested arrow inside a class property may inherit the enclosing function's branch hits; treat scores within ±20% as noise.
- **Test quality is unmeasured.** Coverage records that a line ran, not that the assertion was meaningful. Pair with mutation testing (Stryker / vitest mutation runners) for high-stakes modules.
- **Coupling and churn are absent.** A crappy method nobody touches is lower priority than a moderate-CRAP method edited every sprint. Cross-reference with `git log --follow` before declaring a remediation order.
- **Files with no Istanbul record are not in this report.** Source modules never imported by any test are silently absent — they may be the bigger risk. The "Projects covered" list shows what was actually exercised.
- **Index, main, module, and config files are excluded.** They are barrel files / framework wiring whose CRAP is rarely actionable.
