# CRAP Score Report

> Generated 2026-05-22T23:30:24.212Z

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
- ✅ `coverage/libs/web-ui`
- ✅ `coverage/libs/web-video`
- ✅ `coverage/apps/api`
- ❌ `coverage/apps/web` — no coverage emitted (no tests, or test run skipped)

## Codebase summary

- Functions analyzed (excluding modules/configs/tests): **692**
- Clean (≤5): **640**
- Acceptable (6–15): **48**
- Risky (16–30): **4**
- Crappy (>30): **0**

## Top offenders (max 20, complexity > 1)

| # | Function | File:line | Comp | Cov % | Basis | CRAP | Verdict |
|---|----------|-----------|------|-------|-------|------|---------|
| 1 | `submit` | `libs/web-courses/src/lib/course-create-page/course-create-page.component.ts:44` | 11 | 50.0 | file-branch-fallback | 26.13 | risky |
| 2 | `headObject` | `libs/api-courses/src/lib/video/video-storage.adapter.ts:85` | 4 | 0.0 | branch | 20.00 | risky |
| 3 | `catch` | `libs/api-courses/src/lib/courses.exception-filter.ts:24` | 11 | 66.7 | branch | 15.48 | risky |
| 4 | `catch` | `libs/api-courses/src/lib/video/video.exception-filter.ts:24` | 12 | 71.4 | branch | 15.36 | risky |
| 5 | `register` | `libs/api-auth/src/lib/auth.service.ts:92` | 14 | 93.8 | branch | 14.05 | acceptable |
| 6 | `reasonText` | `libs/web-courses/src/lib/publish/publish-eligibility-panel.component.ts:40` | 9 | 60.6 | file-branch-fallback | 13.95 | acceptable |
| 7 | `canActivate` | `libs/api-courses/src/lib/video/webhook/pubsub-push.guard.ts:30` | 13 | 95.2 | branch | 13.02 | acceptable |
| 8 | `catch` | `libs/api-courses/src/lib/materials/materials.exception-filter.ts:25` | 12 | 94.7 | branch | 12.02 | acceptable |
| 9 | `deleteObject` | `libs/api-courses/src/lib/video/video-storage.adapter.ts:98` | 3 | 0.0 | branch | 12.00 | acceptable |
| 10 | `parseEvent` | `libs/api-courses/src/lib/video/transcoder/gcp-transcoder.adapter.ts:58` | 9 | 68.8 | branch | 11.47 | acceptable |
| 11 | `parseEvent` | `libs/api-courses/src/lib/video/transcoder/fake-transcoder.adapter.ts:41` | 8 | 64.3 | branch | 10.92 | acceptable |
| 12 | `toLoginErr` | `libs/web-auth/src/lib/auth.service.ts:115` | 7 | 57.9 | file-branch-fallback | 10.66 | acceptable |
| 13 | `composeReasons` | `libs/api-courses/src/lib/publish/publish-eligibility.ts:10` | 10 | 100.0 | branch | 10.00 | acceptable |
| 14 | `completeUpload` | `libs/api-courses/src/lib/video/video.service.ts:131` | 9 | 92.9 | branch | 9.03 | acceptable |
| 15 | `userMessageFor` | `libs/web-video/src/lib/player/video-player.service.ts:12` | 9 | 100.0 | file-branch-fallback | 9.00 | acceptable |
| 16 | `onConfirmClosed` | `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts:109` | 8 | 85.0 | file-branch-fallback | 8.22 | acceptable |
| 17 | `onJump` | `libs/web-courses/src/lib/publish/publish-eligibility-panel.component.ts:61` | 6 | 60.6 | file-branch-fallback | 8.20 | acceptable |
| 18 | `<anonymous>` | `libs/web-video/src/lib/video-state-badge.component.ts:28` | 8 | 93.8 | file-branch-fallback | 8.02 | acceptable |
| 19 | `<anonymous>` | `libs/web-video/src/lib/video-state-badge.component.ts:47` | 8 | 93.8 | file-branch-fallback | 8.02 | acceptable |
| 20 | `<anonymous>` | `libs/api-courses/src/lib/enrollment/enrollment.repository.ts:52` | 8 | 100.0 | branch | 8.00 | acceptable |

## Recommendation per offender

1. `submit` (libs/web-courses/src/lib/course-create-page/course-create-page.component.ts:44) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
2. `headObject` (libs/api-courses/src/lib/video/video-storage.adapter.ts:85) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
3. `catch` (libs/api-courses/src/lib/courses.exception-filter.ts:24) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
4. `catch` (libs/api-courses/src/lib/video/video.exception-filter.ts:24) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
5. `register` (libs/api-auth/src/lib/auth.service.ts:92) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
6. `reasonText` (libs/web-courses/src/lib/publish/publish-eligibility-panel.component.ts:40) — **refactor — coverage is fine; the branching is the problem**
7. `canActivate` (libs/api-courses/src/lib/video/webhook/pubsub-push.guard.ts:30) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
8. `catch` (libs/api-courses/src/lib/materials/materials.exception-filter.ts:25) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
9. `deleteObject` (libs/api-courses/src/lib/video/video-storage.adapter.ts:98) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
10. `parseEvent` (libs/api-courses/src/lib/video/transcoder/gcp-transcoder.adapter.ts:58) — **refactor — coverage is fine; the branching is the problem**
11. `parseEvent` (libs/api-courses/src/lib/video/transcoder/fake-transcoder.adapter.ts:41) — **refactor — coverage is fine; the branching is the problem**
12. `toLoginErr` (libs/web-auth/src/lib/auth.service.ts:115) — **refactor — coverage is fine; the branching is the problem**
13. `composeReasons` (libs/api-courses/src/lib/publish/publish-eligibility.ts:10) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
14. `completeUpload` (libs/api-courses/src/lib/video/video.service.ts:131) — **refactor — coverage is fine; the branching is the problem**
15. `userMessageFor` (libs/web-video/src/lib/player/video-player.service.ts:12) — **refactor — coverage is fine; the branching is the problem**
16. `onConfirmClosed` (libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts:109) — **refactor — coverage is fine; the branching is the problem**
17. `onJump` (libs/web-courses/src/lib/publish/publish-eligibility-panel.component.ts:61) — **refactor — coverage is fine; the branching is the problem**
18. `<anonymous>` (libs/web-video/src/lib/video-state-badge.component.ts:28) — **refactor — coverage is fine; the branching is the problem**
19. `<anonymous>` (libs/web-video/src/lib/video-state-badge.component.ts:47) — **refactor — coverage is fine; the branching is the problem**
20. `<anonymous>` (libs/api-courses/src/lib/enrollment/enrollment.repository.ts:52) — **refactor — coverage is fine; the branching is the problem**

## Caveats

- **Coverage basis column** indicates how each function's coverage was computed: `branch` (per-function branch coverage in source line range — most accurate), `statement`/`fn-hit` (degraded fallback), `file-branch-fallback` (the V8 coverage line numbers were post-transform — usually @analogjs/vite-plugin-angular — so we attribute the file's overall branch coverage to every function in the file). Treat `*-fallback` rows as estimates.
- **Function-to-coverage join is line-range-based.** A nested arrow inside a class property may inherit the enclosing function's branch hits; treat scores within ±20% as noise.
- **Test quality is unmeasured.** Coverage records that a line ran, not that the assertion was meaningful. Pair with mutation testing (Stryker / vitest mutation runners) for high-stakes modules.
- **Coupling and churn are absent.** A crappy method nobody touches is lower priority than a moderate-CRAP method edited every sprint. Cross-reference with `git log --follow` before declaring a remediation order.
- **Files with no Istanbul record are not in this report.** Source modules never imported by any test are silently absent — they may be the bigger risk. The "Projects covered" list shows what was actually exercised.
- **Index, main, module, and config files are excluded.** They are barrel files / framework wiring whose CRAP is rarely actionable.
