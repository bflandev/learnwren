# CRAP Score Report

> Generated 2026-05-20T23:53:42.277Z

Threshold: **30** (canonical Savoia/Evans cutoff for "crappy").

Formula: `CRAP(m) = comp(m)² × (1 − cov(m)/100)³ + comp(m)`. Complexity counts `if`, `case`, `?:`, `&&`/`||`/`??`, `for`/`while`/`do`, `catch`. Coverage is **branch coverage** from Vitest V8→Istanbul `coverage-final.json`, joined per function by AST line range. Falls back to function-hit (0% / 100%) and then statement coverage when no branches exist in the range.

## Projects covered

- ✅ `coverage/libs/api-auth`
- ✅ `coverage/libs/api-courses`
- ✅ `coverage/libs/api-firebase`
- ✅ `coverage/libs/api-video`
- ✅ `coverage/libs/shared-data-models`
- ✅ `coverage/libs/web-auth`
- ✅ `coverage/libs/web-courses`
- ✅ `coverage/libs/web-video`
- ✅ `coverage/apps/api`
- ❌ `coverage/apps/web` — no coverage emitted (no tests, or test run skipped)

## Codebase summary

- Functions analyzed (excluding modules/configs/tests): **488**
- Clean (≤5): **422**
- Acceptable (6–15): **52**
- Risky (16–30): **9**
- Crappy (>30): **5**

## Top offenders (max 20, complexity > 1)

| # | Function | File:line | Comp | Cov % | Basis | CRAP | Verdict |
|---|----------|-----------|------|-------|-------|------|---------|
| 1 | `onConfirmClosed` | `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts:108` | 8 | 0.0 | branch | 72.00 | crappy |
| 2 | `updateStatusInTxn` | `libs/api-courses/src/lib/courses.repository.ts:324` | 7 | 0.0 | branch | 56.00 | crappy |
| 3 | `<anonymous>` | `libs/api-video/src/lib/video.repository.ts:123` | 7 | 0.0 | branch | 56.00 | crappy |
| 4 | `putChunkWithRetry` | `libs/web-video/src/lib/upload/video-upload.service.ts:155` | 7 | 0.0 | branch | 56.00 | crappy |
| 5 | `reasonText` | `libs/web-courses/src/lib/publish/publish-eligibility-panel.component.ts:38` | 9 | 28.6 | branch | 38.52 | crappy |
| 6 | `onPrimary` | `libs/web-courses/src/lib/publish/course-publish-bar.component.ts:57` | 5 | 0.0 | branch | 30.00 | risky |
| 7 | `doTransition` | `libs/web-courses/src/lib/publish/course-publish-bar.component.ts:78` | 5 | 0.0 | branch | 30.00 | risky |
| 8 | `submit` | `libs/web-courses/src/lib/course-create-page/course-create-page.component.ts:42` | 11 | 50.0 | file-branch-fallback | 26.13 | risky |
| 9 | `resolveEmailTransport` | `libs/api-auth/src/lib/email-transport/email-transport.factory.ts:13` | 4 | 0.0 | file-branch-fallback | 20.00 | risky |
| 10 | `headObject` | `libs/api-video/src/lib/video-storage.adapter.ts:85` | 4 | 0.0 | branch | 20.00 | risky |
| 11 | `<anonymous>` | `libs/api-video/src/lib/video.repository.ts:174` | 4 | 0.0 | branch | 20.00 | risky |
| 12 | `register` | `libs/api-auth/src/lib/auth.service.ts:86` | 14 | 75.0 | branch | 17.06 | risky |
| 13 | `catch` | `libs/api-courses/src/lib/courses.exception-filter.ts:24` | 11 | 66.7 | branch | 15.48 | risky |
| 14 | `catch` | `libs/api-video/src/lib/video.exception-filter.ts:24` | 12 | 71.4 | branch | 15.36 | risky |
| 15 | `confirmMessage` | `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts:213` | 6 | 40.0 | file-branch-fallback | 13.78 | acceptable |
| 16 | `canActivate` | `libs/api-video/src/lib/webhook/pubsub-push.guard.ts:30` | 13 | 85.7 | branch | 13.49 | acceptable |
| 17 | `deleteObject` | `libs/api-video/src/lib/video-storage.adapter.ts:98` | 3 | 0.0 | branch | 12.00 | acceptable |
| 18 | `<anonymous>` | `libs/api-video/src/lib/video.repository.ts:61` | 3 | 0.0 | branch | 12.00 | acceptable |
| 19 | `refresh` | `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts:50` | 3 | 0.0 | fn-hit | 12.00 | acceptable |
| 20 | `addModule` | `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts:133` | 3 | 0.0 | fn-hit | 12.00 | acceptable |

## Recommendation per offender

1. `onConfirmClosed` (libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts:108) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
2. `updateStatusInTxn` (libs/api-courses/src/lib/courses.repository.ts:324) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
3. `<anonymous>` (libs/api-video/src/lib/video.repository.ts:123) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
4. `putChunkWithRetry` (libs/web-video/src/lib/upload/video-upload.service.ts:155) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
5. `reasonText` (libs/web-courses/src/lib/publish/publish-eligibility-panel.component.ts:38) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
6. `onPrimary` (libs/web-courses/src/lib/publish/course-publish-bar.component.ts:57) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
7. `doTransition` (libs/web-courses/src/lib/publish/course-publish-bar.component.ts:78) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
8. `submit` (libs/web-courses/src/lib/course-create-page/course-create-page.component.ts:42) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
9. `resolveEmailTransport` (libs/api-auth/src/lib/email-transport/email-transport.factory.ts:13) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
10. `headObject` (libs/api-video/src/lib/video-storage.adapter.ts:85) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
11. `<anonymous>` (libs/api-video/src/lib/video.repository.ts:174) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
12. `register` (libs/api-auth/src/lib/auth.service.ts:86) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
13. `catch` (libs/api-courses/src/lib/courses.exception-filter.ts:24) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
14. `catch` (libs/api-video/src/lib/video.exception-filter.ts:24) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
15. `confirmMessage` (libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts:213) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
16. `canActivate` (libs/api-video/src/lib/webhook/pubsub-push.guard.ts:30) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
17. `deleteObject` (libs/api-video/src/lib/video-storage.adapter.ts:98) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
18. `<anonymous>` (libs/api-video/src/lib/video.repository.ts:61) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
19. `refresh` (libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts:50) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
20. `addModule` (libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts:133) — **test — modest complexity; a handful of branch-covering tests will collapse the score**

## Caveats

- **Coverage basis column** indicates how each function's coverage was computed: `branch` (per-function branch coverage in source line range — most accurate), `statement`/`fn-hit` (degraded fallback), `file-branch-fallback` (the V8 coverage line numbers were post-transform — usually @analogjs/vite-plugin-angular — so we attribute the file's overall branch coverage to every function in the file). Treat `*-fallback` rows as estimates.
- **Function-to-coverage join is line-range-based.** A nested arrow inside a class property may inherit the enclosing function's branch hits; treat scores within ±20% as noise.
- **Test quality is unmeasured.** Coverage records that a line ran, not that the assertion was meaningful. Pair with mutation testing (Stryker / vitest mutation runners) for high-stakes modules.
- **Coupling and churn are absent.** A crappy method nobody touches is lower priority than a moderate-CRAP method edited every sprint. Cross-reference with `git log --follow` before declaring a remediation order.
- **Files with no Istanbul record are not in this report.** Source modules never imported by any test are silently absent — they may be the bigger risk. The "Projects covered" list shows what was actually exercised.
- **Index, main, module, and config files are excluded.** They are barrel files / framework wiring whose CRAP is rarely actionable.
