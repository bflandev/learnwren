# CRAP Score Report

> Generated 2026-05-26T13:49:28.630Z

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

- Functions analyzed (excluding modules/configs/tests): **941**
- Clean (≤5): **875**
- Acceptable (6–15): **66**
- Risky (16–30): **0**
- Crappy (>30): **0**

## Top offenders (max 20, complexity > 1)

| # | Function | File:line | Comp | Cov % | Basis | CRAP | Verdict |
|---|----------|-----------|------|-------|-------|------|---------|
| 1 | `deleteObject` | `libs/api-courses/src/lib/cover/cover-storage.adapter.ts:40` | 3 | 0.0 | branch | 12.00 | acceptable |
| 2 | `<anonymous>` | `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.ts:68` | 3 | 0.0 | branch | 12.00 | acceptable |
| 3 | `onMetadata` | `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts:180` | 9 | 80.5 | file-branch-fallback | 9.60 | acceptable |
| 4 | `<anonymous>` | `libs/api-courses/src/lib/enrollment/enrollment.repository.ts:133` | 9 | 93.8 | branch | 9.02 | acceptable |
| 5 | `<anonymous>` | `libs/api-courses/src/lib/enrollment/enrollment.repository.ts:217` | 9 | 93.8 | branch | 9.02 | acceptable |
| 6 | `uploadCover` | `libs/api-courses/src/lib/cover/cover-image.service.ts:32` | 8 | 75.0 | branch | 9.00 | acceptable |
| 7 | `canActivate` | `libs/api-courses/src/lib/learn/guards/lesson-enrollment.guard.ts:21` | 9 | 100.0 | branch | 9.00 | acceptable |
| 8 | `parseEvent` | `libs/api-courses/src/lib/video/transcoder/gcp-transcoder.adapter.ts:58` | 9 | 100.0 | branch | 9.00 | acceptable |
| 9 | `userMessageFor` | `libs/web-video/src/lib/player/video-player.service.ts:12` | 9 | 100.0 | file-branch-fallback | 9.00 | acceptable |
| 10 | `onConfirmClosed` | `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts:121` | 8 | 82.5 | file-branch-fallback | 8.34 | acceptable |
| 11 | `<anonymous>` | `libs/web-video/src/lib/video-state-badge.component.ts:28` | 8 | 93.8 | file-branch-fallback | 8.02 | acceptable |
| 12 | `<anonymous>` | `libs/web-video/src/lib/video-state-badge.component.ts:47` | 8 | 93.8 | file-branch-fallback | 8.02 | acceptable |
| 13 | `canActivate` | `libs/api-courses/src/lib/video/playback/enrollment-or-owner.guard.ts:23` | 8 | 100.0 | branch | 8.00 | acceptable |
| 14 | `parseEvent` | `libs/api-courses/src/lib/video/transcoder/fake-transcoder.adapter.ts:41` | 8 | 100.0 | branch | 8.00 | acceptable |
| 15 | `<anonymous>` | `libs/web-auth/src/lib/password-policy.validator.ts:21` | 8 | 100.0 | file-branch-fallback | 8.00 | acceptable |
| 16 | `load` | `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts:131` | 7 | 80.5 | file-branch-fallback | 7.36 | acceptable |
| 17 | `savePosition` | `libs/api-courses/src/lib/learn/learn.controller.ts:51` | 7 | 90.0 | branch | 7.05 | acceptable |
| 18 | `getLessonView` | `libs/api-courses/src/lib/learn/learn.service.ts:32` | 7 | 90.0 | branch | 7.05 | acceptable |
| 19 | `toLoginErr` | `libs/web-auth/src/lib/auth.service.ts:119` | 7 | 90.5 | file-branch-fallback | 7.04 | acceptable |
| 20 | `start` | `libs/web-video/src/lib/upload/video-upload.service.ts:66` | 7 | 93.2 | file-branch-fallback | 7.02 | acceptable |

## Recommendation per offender

1. `deleteObject` (libs/api-courses/src/lib/cover/cover-storage.adapter.ts:40) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
2. `<anonymous>` (libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.ts:68) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
3. `onMetadata` (libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts:180) — **refactor — coverage is fine; the branching is the problem**
4. `<anonymous>` (libs/api-courses/src/lib/enrollment/enrollment.repository.ts:133) — **refactor — coverage is fine; the branching is the problem**
5. `<anonymous>` (libs/api-courses/src/lib/enrollment/enrollment.repository.ts:217) — **refactor — coverage is fine; the branching is the problem**
6. `uploadCover` (libs/api-courses/src/lib/cover/cover-image.service.ts:32) — **refactor — coverage is fine; the branching is the problem**
7. `canActivate` (libs/api-courses/src/lib/learn/guards/lesson-enrollment.guard.ts:21) — **refactor — coverage is fine; the branching is the problem**
8. `parseEvent` (libs/api-courses/src/lib/video/transcoder/gcp-transcoder.adapter.ts:58) — **refactor — coverage is fine; the branching is the problem**
9. `userMessageFor` (libs/web-video/src/lib/player/video-player.service.ts:12) — **refactor — coverage is fine; the branching is the problem**
10. `onConfirmClosed` (libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts:121) — **refactor — coverage is fine; the branching is the problem**
11. `<anonymous>` (libs/web-video/src/lib/video-state-badge.component.ts:28) — **refactor — coverage is fine; the branching is the problem**
12. `<anonymous>` (libs/web-video/src/lib/video-state-badge.component.ts:47) — **refactor — coverage is fine; the branching is the problem**
13. `canActivate` (libs/api-courses/src/lib/video/playback/enrollment-or-owner.guard.ts:23) — **refactor — coverage is fine; the branching is the problem**
14. `parseEvent` (libs/api-courses/src/lib/video/transcoder/fake-transcoder.adapter.ts:41) — **refactor — coverage is fine; the branching is the problem**
15. `<anonymous>` (libs/web-auth/src/lib/password-policy.validator.ts:21) — **refactor — coverage is fine; the branching is the problem**
16. `load` (libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts:131) — **refactor — coverage is fine; the branching is the problem**
17. `savePosition` (libs/api-courses/src/lib/learn/learn.controller.ts:51) — **refactor — coverage is fine; the branching is the problem**
18. `getLessonView` (libs/api-courses/src/lib/learn/learn.service.ts:32) — **refactor — coverage is fine; the branching is the problem**
19. `toLoginErr` (libs/web-auth/src/lib/auth.service.ts:119) — **refactor — coverage is fine; the branching is the problem**
20. `start` (libs/web-video/src/lib/upload/video-upload.service.ts:66) — **refactor — coverage is fine; the branching is the problem**

## Caveats

- **Coverage basis column** indicates how each function's coverage was computed: `branch` (per-function branch coverage in source line range — most accurate), `statement`/`fn-hit` (degraded fallback), `file-branch-fallback` (the V8 coverage line numbers were post-transform — usually @analogjs/vite-plugin-angular — so we attribute the file's overall branch coverage to every function in the file). Treat `*-fallback` rows as estimates.
- **Function-to-coverage join is line-range-based.** A nested arrow inside a class property may inherit the enclosing function's branch hits; treat scores within ±20% as noise.
- **Test quality is unmeasured.** Coverage records that a line ran, not that the assertion was meaningful. Pair with mutation testing (Stryker / vitest mutation runners) for high-stakes modules.
- **Coupling and churn are absent.** A crappy method nobody touches is lower priority than a moderate-CRAP method edited every sprint. Cross-reference with `git log --follow` before declaring a remediation order.
- **Files with no Istanbul record are not in this report.** Source modules never imported by any test are silently absent — they may be the bigger risk. The "Projects covered" list shows what was actually exercised.
- **Index, main, module, and config files are excluded.** They are barrel files / framework wiring whose CRAP is rarely actionable.
