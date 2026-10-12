# Mutation Test Report — `libs/api-courses`

> Generated 2026-10-12T02:58:48.298Z

**Headline mutation score: 99.67%** (killed=3627, survived=12, no-cov=0, ignored=102). Score on covered mutants only: 99.67%. Adjusted (equivalent candidates excluded): 99.70%.


Target band: core domain logic — 75–85% target.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/materials/attachment-disposition.ts` | 90.5% | 19 | 2 | 0 |
| `src/lib/video/captions/webvtt.validator.ts` | 91.2% | 31 | 3 | 0 |
| `src/lib/notifications/notifications.service.ts` | 96.9% | 63 | 2 | 0 |
| `src/lib/video/transcoder/ffmpeg-transcoder.adapter.ts` | 98.0% | 198 | 4 | 0 |
| `src/lib/video/upload/video-upload-proxy.controller.ts` | 99.2% | 129 | 1 | 0 |
| `src/lib/analytics/analytics.controller.ts` | 100.0% | 5 | 0 | 0 |
| `src/lib/analytics/analytics.service.ts` | 100.0% | 81 | 0 | 0 |
| `src/lib/catalog/catalog.service.ts` | 100.0% | 105 | 0 | 0 |
| `src/lib/categories/categories.exception-filter.ts` | 100.0% | 3 | 0 | 0 |
| `src/lib/courses.service.ts` | 100.0% | 90 | 0 | 0 |
| `src/lib/cover/cover.exception-filter.ts` | 100.0% | 1 | 0 | 0 |
| `src/lib/enrollment/enrollment.repository.ts` | 100.0% | 232 | 0 | 0 |
| `src/lib/enrollment/purge-withdrawn.ts` | 100.0% | 32 | 0 | 0 |
| `src/lib/health/admin-health.service.ts` | 100.0% | 113 | 0 | 0 |
| `src/lib/learn/learn.controller.ts` | 100.0% | 44 | 0 | 0 |
| `src/lib/learn/learn.exception-filter.ts` | 100.0% | 3 | 0 | 0 |
| `src/lib/learn/learn.service.ts` | 100.0% | 89 | 0 | 0 |
| `src/lib/materials/materials.exception-filter.ts` | 100.0% | 3 | 0 | 0 |
| `src/lib/materials/materials.service.ts` | 100.0% | 68 | 0 | 0 |
| `src/lib/notifications/notifications.controller.ts` | 100.0% | 5 | 0 | 0 |
| `src/lib/roster/roster.controller.ts` | 100.0% | 5 | 0 | 0 |
| `src/lib/video/transcoder/gcp-transcoder.adapter.ts` | 100.0% | 61 | 0 | 0 |
| `src/lib/video/video-storage.adapter.ts` | 100.0% | 140 | 0 | 0 |
| `src/lib/video/video.exception-filter.ts` | 100.0% | 3 | 0 | 0 |
| `src/lib/video/video.repository.ts` | 100.0% | 215 | 0 | 0 |
| `src/lib/video/video.service.ts` | 100.0% | 166 | 0 | 0 |
| `src/lib/video/webhook/transcoder-events.controller.ts` | 100.0% | 16 | 0 | 0 |
| `src/lib/catalog/catalog.controller.ts` | 100.0% | 4 | 0 | 0 |
| `src/lib/catalog/instructor-directory.ts` | 100.0% | 14 | 0 | 0 |
| `src/lib/catalog/parse-course-id.pipe.ts` | 100.0% | 13 | 0 | 0 |
| `src/lib/categories/admin-categories.controller.ts` | 100.0% | 13 | 0 | 0 |
| `src/lib/categories/categories.controller.ts` | 100.0% | 1 | 0 | 0 |
| `src/lib/categories/categories.exception.ts` | 100.0% | 16 | 0 | 0 |
| `src/lib/categories/categories.repository.ts` | 100.0% | 95 | 0 | 0 |
| `src/lib/categories/categories.service.ts` | 100.0% | 39 | 0 | 0 |
| `src/lib/course-owner.guard.ts` | 100.0% | 13 | 0 | 0 |
| `src/lib/courses.controller.ts` | 100.0% | 24 | 0 | 0 |
| `src/lib/cover/cover-image.service.ts` | 100.0% | 41 | 0 | 0 |
| `src/lib/cover/cover-storage.adapter.ts` | 100.0% | 6 | 0 | 0 |
| `src/lib/cover/cover.config.ts` | 100.0% | 42 | 0 | 0 |
| `src/lib/cover/cover.controller.ts` | 100.0% | 15 | 0 | 0 |
| `src/lib/cover/errors/cover.exception.ts` | 100.0% | 14 | 0 | 0 |
| `src/lib/cover/fake-cover-storage.adapter.ts` | 100.0% | 6 | 0 | 0 |
| `src/lib/enrollment/enrollment.controller.ts` | 100.0% | 4 | 0 | 0 |
| `src/lib/enrollment/enrollment.service.ts` | 100.0% | 26 | 0 | 0 |
| `src/lib/errors/courses.exception.ts` | 100.0% | 48 | 0 | 0 |
| `src/lib/health/admin-health.controller.ts` | 100.0% | 1 | 0 | 0 |
| `src/lib/health/health.config.ts` | 100.0% | 27 | 0 | 0 |
| `src/lib/learn/errors/learn.exception.ts` | 100.0% | 13 | 0 | 0 |
| `src/lib/learn/guards/find-lesson-in-course.ts` | 100.0% | 7 | 0 | 0 |
| `src/lib/learn/guards/lesson-enrollment-or-owner.guard.ts` | 100.0% | 36 | 0 | 0 |
| `src/lib/learn/guards/lesson-enrollment.guard.ts` | 100.0% | 27 | 0 | 0 |
| `src/lib/materials/errors/material.exception.ts` | 100.0% | 24 | 0 | 0 |
| `src/lib/materials/material-access.guard.ts` | 100.0% | 24 | 0 | 0 |
| `src/lib/materials/material-owner.guard.ts` | 100.0% | 13 | 0 | 0 |
| `src/lib/materials/materials-storage.adapter.ts` | 100.0% | 27 | 0 | 0 |
| `src/lib/materials/materials.config.ts` | 100.0% | 55 | 0 | 0 |
| `src/lib/materials/materials.controller.ts` | 100.0% | 14 | 0 | 0 |
| `src/lib/materials/materials.repository.ts` | 100.0% | 19 | 0 | 0 |
| `src/lib/materials/webhook/materials-proxy.controller.ts` | 100.0% | 42 | 0 | 0 |
| `src/lib/publish/publish-eligibility.ts` | 100.0% | 57 | 0 | 0 |
| `src/lib/publish/publish.service.ts` | 100.0% | 66 | 0 | 0 |
| `src/lib/reorder.util.ts` | 100.0% | 11 | 0 | 0 |
| `src/lib/roster/roster.service.ts` | 100.0% | 34 | 0 | 0 |
| `src/lib/video/captions/captions.controller.ts` | 100.0% | 6 | 0 | 0 |
| `src/lib/video/captions/captions.service.ts` | 100.0% | 22 | 0 | 0 |
| `src/lib/video/errors/video.exception.ts` | 100.0% | 74 | 0 | 0 |
| `src/lib/video/hls-naming.ts` | 100.0% | 16 | 0 | 0 |
| `src/lib/video/playback/current-video.decorator.ts` | 100.0% | 6 | 0 | 0 |
| `src/lib/video/playback/enrollment-or-owner.guard.ts` | 100.0% | 28 | 0 | 0 |
| `src/lib/video/playback/key.service.ts` | 100.0% | 12 | 0 | 0 |
| `src/lib/video/playback/manifest.rewriter.ts` | 100.0% | 126 | 0 | 0 |
| `src/lib/video/playback/manifest.service.ts` | 100.0% | 13 | 0 | 0 |
| `src/lib/video/playback/playback-config.controller.ts` | 100.0% | 6 | 0 | 0 |
| `src/lib/video/playback/playback.controller.ts` | 100.0% | 41 | 0 | 0 |
| `src/lib/video/transcoder/binaries.ts` | 100.0% | 7 | 0 | 0 |
| `src/lib/video/transcoder/fake-transcoder.adapter.ts` | 100.0% | 48 | 0 | 0 |
| `src/lib/video/transcoder/ffmpeg-event.bridge.ts` | 100.0% | 5 | 0 | 0 |
| `src/lib/video/transcoder/transcoder-job.builder.ts` | 100.0% | 47 | 0 | 0 |
| `src/lib/video/upload/video-upload-sessions.ts` | 100.0% | 14 | 0 | 0 |
| `src/lib/video/video-owner.guard.ts` | 100.0% | 13 | 0 | 0 |
| `src/lib/video/video.config.ts` | 100.0% | 155 | 0 | 0 |
| `src/lib/video/video.controller.ts` | 100.0% | 12 | 0 | 0 |
| `src/lib/video/webhook/fake-transcoder.controller.ts` | 100.0% | 29 | 0 | 0 |
| `src/lib/video/webhook/pubsub-push.guard.ts` | 100.0% | 83 | 0 | 0 |
| `src/lib/categories/categories.seed.ts` | 100.0% | 13 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/video/transcoder/ffmpeg-transcoder.adapter.ts` — 3 surviving mutants

**Cluster 1** (lines 200–203 — `if()`): 3 mutants surviving — ConditionalExpression×1, BooleanLiteral×1, ArrowFunction×1

Sample mutation:
```diff
- if (dir) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `ffmpeg-transcoder.adapter.ts:200` in `if` with assertions that distinguish the outcomes.

### `src/lib/video/captions/webvtt.validator.ts` — 3 surviving mutants

**Cluster 2** (lines 2): 2 mutants surviving — Regex×2

Sample mutation:
```diff
- const CUE_TIMING = /(?:\d{2}:)?\d{2}:\d{2}\.\d{3}\s*-->\s*(?:\d{2}:)?\d{2}:\d{2}\.\d{3}/;
+ <replaced with: /(?:\d:)?\d{2}:\d{2}\.\d{3}\s*-->\s*(?:\d{2}:)?\d{2}:\d{2}\.\d{3}/>
```

_Diagnosis._ A regex literal could be replaced with `/.*/` and tests pass. Assert against inputs that should and should not match.

_Recommended test._ Inspect `webvtt.validator.ts:2` and add an assertion that distinguishes the original from the surviving mutation.

**Cluster 3** (lines 11 — `slice()`): 1 mutant surviving — Regex×1

Sample mutation:
```diff
- if (!/^WEBVTT(?:[ \t\r\n]|$)/.test(body)) return false;
+ <replaced with: /^WEBVTT(?:[ \t\r\n])/>
```

_Diagnosis._ A regex literal could be replaced with `/.*/` and tests pass. Assert against inputs that should and should not match.

_Recommended test._ Inspect `webvtt.validator.ts:11` in `slice` and add an assertion that distinguishes the original from the surviving mutation.

### `src/lib/notifications/notifications.service.ts` — 2 surviving mutants

**Cluster 4** (lines 122 — `settleWithConcurrency()`): 1 mutant surviving — ArrayDeclaration×1

Sample mutation:
```diff
- const results: PromiseSettledResult<R>[] = new Array(items.length);
+ <replaced with: new Array()>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `notifications.service.ts:122` in `settleWithConcurrency`, not just truthiness.

**Cluster 5** (lines 130 — `catch()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- results[i] = { status: 'rejected', reason };
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `notifications.service.ts:130` in `catch`. If it's a log message, classify as equivalent.

### `src/lib/materials/attachment-disposition.ts` — 2 surviving mutants

**Cluster 6** (lines 18 — `attachmentDisposition()`): 2 mutants surviving — Regex×2

Sample mutation:
```diff
- const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
+ <replaced with: /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<=[\uD800-\uDBFF])[\uDC00-\uDFFF]/g>
```

_Diagnosis._ A regex literal could be replaced with `/.*/` and tests pass. Assert against inputs that should and should not match.

_Recommended test._ Inspect `attachment-disposition.ts:18` in `attachmentDisposition` and add an assertion that distinguishes the original from the surviving mutation.

### `src/lib/video/upload/video-upload-proxy.controller.ts` — 1 surviving mutant

**Cluster 7** (lines 137 — `if()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (!session.uploadId) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `video-upload-proxy.controller.ts:137` in `if` with assertions that distinguish the outcomes.

## Equivalent-mutant candidates (excluded from adjusted score)

1 mutants flagged as likely equivalent — these are excluded from the **adjusted** score above. Reviewer should confirm each before treating the adjusted score as authoritative:

| File:line | Mutator | Reason |
|-----------|---------|--------|
| `src/lib/video/transcoder/ffmpeg-transcoder.adapter.ts:203` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.api-courses.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.
