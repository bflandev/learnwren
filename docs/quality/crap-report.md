# CRAP Score Report

> Generated 2026-05-14T08:18:20.470Z

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

- Functions analyzed (excluding modules/configs/tests): **412**
- Clean (≤5): **362**
- Acceptable (6–15): **42**
- Risky (16–30): **5**
- Crappy (>30): **3**

## Top offenders (max 20, complexity > 1)

| # | Function | File:line | Comp | Cov % | Basis | CRAP | Verdict |
|---|----------|-----------|------|-------|-------|------|---------|
| 1 | `<anonymous>` | `libs/api-video/src/lib/video.repository.ts:123` | 7 | 0.0 | branch | 56.00 | crappy |
| 2 | `putChunkWithRetry` | `libs/web-video/src/lib/upload/video-upload.service.ts:155` | 7 | 0.0 | branch | 56.00 | crappy |
| 3 | `onConfirmClosed` | `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts:73` | 6 | 0.0 | branch | 42.00 | crappy |
| 4 | `submit` | `libs/web-courses/src/lib/course-create-page/course-create-page.component.ts:42` | 11 | 50.0 | file-branch-fallback | 26.13 | risky |
| 5 | `headObject` | `libs/api-video/src/lib/video-storage.adapter.ts:85` | 4 | 0.0 | branch | 20.00 | risky |
| 6 | `<anonymous>` | `libs/api-video/src/lib/video.repository.ts:174` | 4 | 0.0 | branch | 20.00 | risky |
| 7 | `catch` | `libs/api-courses/src/lib/courses.exception-filter.ts:24` | 11 | 66.7 | branch | 15.48 | risky |
| 8 | `catch` | `libs/api-video/src/lib/video.exception-filter.ts:24` | 12 | 71.4 | branch | 15.36 | risky |
| 9 | `register` | `libs/api-auth/src/lib/auth.service.ts:86` | 14 | 93.8 | branch | 14.05 | acceptable |
| 10 | `canActivate` | `libs/api-video/src/lib/webhook/pubsub-push.guard.ts:30` | 13 | 85.7 | branch | 13.49 | acceptable |
| 11 | `deleteObject` | `libs/api-video/src/lib/video-storage.adapter.ts:98` | 3 | 0.0 | branch | 12.00 | acceptable |
| 12 | `<anonymous>` | `libs/api-video/src/lib/video.repository.ts:61` | 3 | 0.0 | branch | 12.00 | acceptable |
| 13 | `refresh` | `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts:42` | 3 | 0.0 | fn-hit | 12.00 | acceptable |
| 14 | `addModule` | `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts:94` | 3 | 0.0 | fn-hit | 12.00 | acceptable |
| 15 | `onReorderModules` | `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts:134` | 3 | 0.0 | branch | 12.00 | acceptable |
| 16 | `retry` | `libs/web-video/src/lib/upload/video-upload.service.ts:126` | 3 | 0.0 | fn-hit | 12.00 | acceptable |
| 17 | `parseEvent` | `libs/api-video/src/lib/transcoder/gcp-transcoder.adapter.ts:58` | 9 | 68.8 | branch | 11.47 | acceptable |
| 18 | `parseEvent` | `libs/api-video/src/lib/transcoder/fake-transcoder.adapter.ts:41` | 8 | 64.3 | branch | 10.92 | acceptable |
| 19 | `toLoginErr` | `libs/web-auth/src/lib/auth.service.ts:115` | 7 | 57.9 | file-branch-fallback | 10.66 | acceptable |
| 20 | `completeUpload` | `libs/api-video/src/lib/video.service.ts:131` | 9 | 92.9 | branch | 9.03 | acceptable |

## Recommendation per offender

1. `<anonymous>` (libs/api-video/src/lib/video.repository.ts:123) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
2. `putChunkWithRetry` (libs/web-video/src/lib/upload/video-upload.service.ts:155) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
3. `onConfirmClosed` (libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts:73) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
4. `submit` (libs/web-courses/src/lib/course-create-page/course-create-page.component.ts:42) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
5. `headObject` (libs/api-video/src/lib/video-storage.adapter.ts:85) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
6. `<anonymous>` (libs/api-video/src/lib/video.repository.ts:174) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
7. `catch` (libs/api-courses/src/lib/courses.exception-filter.ts:24) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
8. `catch` (libs/api-video/src/lib/video.exception-filter.ts:24) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
9. `register` (libs/api-auth/src/lib/auth.service.ts:86) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
10. `canActivate` (libs/api-video/src/lib/webhook/pubsub-push.guard.ts:30) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
11. `deleteObject` (libs/api-video/src/lib/video-storage.adapter.ts:98) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
12. `<anonymous>` (libs/api-video/src/lib/video.repository.ts:61) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
13. `refresh` (libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts:42) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
14. `addModule` (libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts:94) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
15. `onReorderModules` (libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts:134) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
16. `retry` (libs/web-video/src/lib/upload/video-upload.service.ts:126) — **test — modest complexity; a handful of branch-covering tests will collapse the score**
17. `parseEvent` (libs/api-video/src/lib/transcoder/gcp-transcoder.adapter.ts:58) — **refactor — coverage is fine; the branching is the problem**
18. `parseEvent` (libs/api-video/src/lib/transcoder/fake-transcoder.adapter.ts:41) — **refactor — coverage is fine; the branching is the problem**
19. `toLoginErr` (libs/web-auth/src/lib/auth.service.ts:115) — **refactor — coverage is fine; the branching is the problem**
20. `completeUpload` (libs/api-video/src/lib/video.service.ts:131) — **refactor — coverage is fine; the branching is the problem**

## Caveats

- **Coverage basis column** indicates how each function's coverage was computed: `branch` (per-function branch coverage in source line range — most accurate), `statement`/`fn-hit` (degraded fallback), `file-branch-fallback` (the V8 coverage line numbers were post-transform — usually @analogjs/vite-plugin-angular — so we attribute the file's overall branch coverage to every function in the file). Treat `*-fallback` rows as estimates.
- **Function-to-coverage join is line-range-based.** A nested arrow inside a class property may inherit the enclosing function's branch hits; treat scores within ±20% as noise.
- **Test quality is unmeasured.** Coverage records that a line ran, not that the assertion was meaningful. Pair with mutation testing (Stryker / vitest mutation runners) for high-stakes modules.
- **Coupling and churn are absent.** A crappy method nobody touches is lower priority than a moderate-CRAP method edited every sprint. Cross-reference with `git log --follow` before declaring a remediation order.
- **Files with no Istanbul record are not in this report.** Source modules never imported by any test are silently absent — they may be the bigger risk. The "Projects covered" list shows what was actually exercised.
- **Index, main, module, and config files are excluded.** They are barrel files / framework wiring whose CRAP is rarely actionable.

## 2026-05-14 — Slice C (playback) integration

Coverage scope expanded to include `api-courses`, `api-video`, `web-courses`, and `web-video`. Functions analyzed grew from 111 → 412 — most of the new surface was always there; slice A's report just hadn't joined those coverage dirs.

New slice C playback surface:

- `libs/api-video/src/lib/playback/manifest.rewriter.ts`
- `libs/api-video/src/lib/playback/manifest.service.ts`
- `libs/api-video/src/lib/playback/key.service.ts`
- `libs/api-video/src/lib/playback/enrollment-or-owner.guard.ts`
- `libs/api-video/src/lib/playback/playback.controller.ts`
- `libs/api-video/src/lib/playback/current-video.decorator.ts`
- `libs/web-video/src/lib/player/video-player.service.ts`
- `libs/web-video/src/lib/player/video-player.component.ts`

Top CRAP scores in new slice C files (all at 100% branch coverage):

- `manifest.rewriter.ts:rewriteMaster` — CRAP 6.00 (comp 6) — acceptable
- `manifest.rewriter.ts:isSegmentUri` — CRAP 5.00 (comp 5) — clean
- `manifest.rewriter.ts:rewriteRendition` — CRAP 4.00 (comp 4) — clean
- `enrollment-or-owner.guard.ts:canActivate` — CRAP 5.00 (comp 5) — clean
- `key.service.ts:fetch` — CRAP 3.00 (comp 3) — clean
- `playback.controller.ts:rendition` — CRAP 2.00 (comp 2) — clean
- `current-video.decorator.ts:currentVideoFactory` — CRAP 2.00 (comp 2) — clean
- `video-player.service.ts:userMessageFor` — CRAP 9.00 (comp 9) — acceptable (switch over error-class union; all cases exercised)
- `video-player.service.ts:attach` — CRAP 3.00 (comp 3) — clean

**None > 30** — slice C playback code is small, focused, and well-covered. No follow-ups.

Pre-existing high-CRAP methods unchanged from slice A (`api-auth/auth.service.ts:register` still CRAP 14.05, etc.). The three new "crappy" rows (`video.repository.ts:<anonymous>`, `web-video upload/putChunkWithRetry`, `course-editor/onConfirmClosed`) are not slice C work — they surfaced once the wider coverage scope was joined; their tests don't traverse those branches under Vitest's V8 coverage. Tracked separately.
