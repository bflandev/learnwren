# Mutation Test Report — `libs/api-courses`

> Generated 2026-10-02T11:23:22.873Z

**Headline mutation score: 99.31%** (killed=3474, survived=18, no-cov=6, ignored=109). Score on covered mutants only: 99.48%. Adjusted (equivalent candidates excluded): 99.43%.


Target band: core domain logic — 75–85% target.

## Full run and scoped run — US-09-04 Slice D3c (2026-10-02)

Full-config run: **99.31%** raw, 99.43% adjusted (3474 killed, 18 survived, 6 no-coverage,
109 ignored). Every one of the 24 survivors and no-coverage mutants sits in a file the
D3c slice did not touch (categories, enrollment, video repository/service, catalog,
analytics, webvtt validator, pubsub guard, `materials.repository.ts`). They predate the
slice: the last full-lib table (92.26%, May) had been overtaken by scoped rounds, so this
is the first full run since. They are not equivalents and are listed under "Survivor
clusters" below as open gaps.

The slice changed `video/upload/video-upload-proxy.controller.ts` (chunk size cap,
exact-length read, hang-up and already-read-body refusal) and
`materials/webhook/materials-proxy.controller.ts` (`exactBody` length-checking stream):
scoped to those two files, **100%** (165 mutants). One survivor in the materials
controller (the `close` handler destroying the counter after a fully received body)
was killed by a test where the store reads the body after the request has closed.

## Scoped run — US-09-04 Slice C (2026-09-26)

Stryker scoped with `--mutate` to the files this slice added or changed
(`video/upload/video-upload-proxy.controller.ts`, `video/upload/video-upload-sessions.ts`,
`video/video-storage.adapter.ts`, `materials/materials-storage.adapter.ts`,
`materials/webhook/materials-proxy.controller.ts`, `cover/cover-storage.adapter.ts`,
`health/admin-health.service.ts`): first pass 96.69% (13 survivors), then
**100%** after tightening assertions (Content-Range regex anchors and detail
strings, a single-byte final chunk, the request-stream error path, the fake
playlist header, a mux-key-prefixed non-playlist path). The adapters that now
merely delegate to the `ObjectStorage` port lost most of their mutable surface;
the port's own backends are mutation-tested in `mutation-report-api-object-storage.md`.

## Scoped run — US-09-04 Slice B (2026-09-25)

Stryker scoped with `--mutate` to the files the slice added or changed
(`video/transcoder/ffmpeg-transcoder.adapter.ts`, `ffmpeg-event.bridge.ts`,
`binaries.ts`, `hls-naming.ts`, `video.config.ts`, `playback/manifest.service.ts`,
`playback/playback.controller.ts`, `video-storage.adapter.ts`): **100%** on
every file (575 mutants; 3 marked equivalent in-line with `Stryker disable`
comments — an empty `stdio` array, a regex `$` anchor on a greedy `.*`, and a
non-terminal fallback reason). The first pass scored 90.76%; the 56 survivors
were killed by tests for the spawn runner, cancellation between pipeline
steps, `gs://` parsing, delivery logging, and the local probe's temp-file
lifecycle. The full-lib table below predates this slice.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/categories/categories.exception-filter.ts` | 0.0% | 0 | 0 | 4 |
| `src/lib/video/captions/webvtt.validator.ts` | 91.2% | 31 | 3 | 0 |
| `src/lib/categories/admin-categories.controller.ts` | 92.3% | 12 | 1 | 0 |
| `src/lib/materials/materials.repository.ts` | 94.7% | 18 | 1 | 0 |
| `src/lib/video/video.service.ts` | 98.2% | 163 | 3 | 0 |
| `src/lib/enrollment/enrollment.repository.ts` | 98.3% | 228 | 3 | 1 |
| `src/lib/video/video.repository.ts` | 98.4% | 185 | 3 | 0 |
| `src/lib/video/errors/video.exception.ts` | 98.5% | 67 | 1 | 0 |
| `src/lib/analytics/analytics.service.ts` | 98.8% | 81 | 1 | 0 |
| `src/lib/video/webhook/pubsub-push.guard.ts` | 98.8% | 82 | 1 | 0 |
| `src/lib/categories/categories.repository.ts` | 98.9% | 94 | 0 | 1 |
| `src/lib/catalog/catalog.service.ts` | 99.0% | 104 | 1 | 0 |
| `src/lib/analytics/analytics.controller.ts` | 100.0% | 5 | 0 | 0 |
| `src/lib/courses.service.ts` | 100.0% | 89 | 0 | 0 |
| `src/lib/cover/cover.exception-filter.ts` | 100.0% | 1 | 0 | 0 |
| `src/lib/health/admin-health.service.ts` | 100.0% | 113 | 0 | 0 |
| `src/lib/learn/learn.controller.ts` | 100.0% | 44 | 0 | 0 |
| `src/lib/learn/learn.exception-filter.ts` | 100.0% | 3 | 0 | 0 |
| `src/lib/learn/learn.service.ts` | 100.0% | 88 | 0 | 0 |
| `src/lib/materials/materials.exception-filter.ts` | 100.0% | 3 | 0 | 0 |
| `src/lib/materials/materials.service.ts` | 100.0% | 68 | 0 | 0 |
| `src/lib/notifications/notifications.controller.ts` | 100.0% | 5 | 0 | 0 |
| `src/lib/notifications/notifications.service.ts` | 100.0% | 49 | 0 | 0 |
| `src/lib/roster/roster.controller.ts` | 100.0% | 5 | 0 | 0 |
| `src/lib/video/transcoder/ffmpeg-transcoder.adapter.ts` | 100.0% | 195 | 0 | 0 |
| `src/lib/video/transcoder/gcp-transcoder.adapter.ts` | 100.0% | 61 | 0 | 0 |
| `src/lib/video/video-storage.adapter.ts` | 100.0% | 126 | 0 | 0 |
| `src/lib/video/video.exception-filter.ts` | 100.0% | 3 | 0 | 0 |
| `src/lib/video/webhook/transcoder-events.controller.ts` | 100.0% | 16 | 0 | 0 |
| `src/lib/catalog/catalog.controller.ts` | 100.0% | 4 | 0 | 0 |
| `src/lib/catalog/instructor-directory.ts` | 100.0% | 14 | 0 | 0 |
| `src/lib/catalog/parse-course-id.pipe.ts` | 100.0% | 13 | 0 | 0 |
| `src/lib/categories/categories.controller.ts` | 100.0% | 1 | 0 | 0 |
| `src/lib/categories/categories.exception.ts` | 100.0% | 16 | 0 | 0 |
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
| `src/lib/errors/courses.exception.ts` | 100.0% | 45 | 0 | 0 |
| `src/lib/health/admin-health.controller.ts` | 100.0% | 1 | 0 | 0 |
| `src/lib/health/health.config.ts` | 100.0% | 27 | 0 | 0 |
| `src/lib/learn/errors/learn.exception.ts` | 100.0% | 13 | 0 | 0 |
| `src/lib/learn/guards/find-lesson-in-course.ts` | 100.0% | 7 | 0 | 0 |
| `src/lib/learn/guards/lesson-enrollment-or-owner.guard.ts` | 100.0% | 36 | 0 | 0 |
| `src/lib/learn/guards/lesson-enrollment.guard.ts` | 100.0% | 27 | 0 | 0 |
| `src/lib/materials/errors/material.exception.ts` | 100.0% | 24 | 0 | 0 |
| `src/lib/materials/material-access.guard.ts` | 100.0% | 24 | 0 | 0 |
| `src/lib/materials/material-owner.guard.ts` | 100.0% | 13 | 0 | 0 |
| `src/lib/materials/materials-storage.adapter.ts` | 100.0% | 31 | 0 | 0 |
| `src/lib/materials/materials.config.ts` | 100.0% | 55 | 0 | 0 |
| `src/lib/materials/materials.controller.ts` | 100.0% | 14 | 0 | 0 |
| `src/lib/materials/webhook/materials-proxy.controller.ts` | 100.0% | 48 | 0 | 0 |
| `src/lib/publish/publish-eligibility.ts` | 100.0% | 57 | 0 | 0 |
| `src/lib/publish/publish.service.ts` | 100.0% | 66 | 0 | 0 |
| `src/lib/reorder.util.ts` | 100.0% | 11 | 0 | 0 |
| `src/lib/roster/roster.service.ts` | 100.0% | 34 | 0 | 0 |
| `src/lib/video/captions/captions.controller.ts` | 100.0% | 6 | 0 | 0 |
| `src/lib/video/captions/captions.service.ts` | 100.0% | 17 | 0 | 0 |
| `src/lib/video/hls-naming.ts` | 100.0% | 16 | 0 | 0 |
| `src/lib/video/playback/current-video.decorator.ts` | 100.0% | 6 | 0 | 0 |
| `src/lib/video/playback/enrollment-or-owner.guard.ts` | 100.0% | 28 | 0 | 0 |
| `src/lib/video/playback/key.service.ts` | 100.0% | 12 | 0 | 0 |
| `src/lib/video/playback/manifest.rewriter.ts` | 100.0% | 126 | 0 | 0 |
| `src/lib/video/playback/manifest.service.ts` | 100.0% | 13 | 0 | 0 |
| `src/lib/video/playback/playback-config.controller.ts` | 100.0% | 6 | 0 | 0 |
| `src/lib/video/playback/playback.controller.ts` | 100.0% | 43 | 0 | 0 |
| `src/lib/video/transcoder/binaries.ts` | 100.0% | 7 | 0 | 0 |
| `src/lib/video/transcoder/fake-transcoder.adapter.ts` | 100.0% | 48 | 0 | 0 |
| `src/lib/video/transcoder/ffmpeg-event.bridge.ts` | 100.0% | 5 | 0 | 0 |
| `src/lib/video/transcoder/transcoder-job.builder.ts` | 100.0% | 47 | 0 | 0 |
| `src/lib/video/upload/video-upload-proxy.controller.ts` | 100.0% | 117 | 0 | 0 |
| `src/lib/video/upload/video-upload-sessions.ts` | 100.0% | 5 | 0 | 0 |
| `src/lib/video/video-owner.guard.ts` | 100.0% | 13 | 0 | 0 |
| `src/lib/video/video.config.ts` | 100.0% | 155 | 0 | 0 |
| `src/lib/video/video.controller.ts` | 100.0% | 12 | 0 | 0 |
| `src/lib/video/webhook/fake-transcoder.controller.ts` | 100.0% | 29 | 0 | 0 |
| `src/lib/categories/categories.seed.ts` | 100.0% | 13 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/enrollment/enrollment.repository.ts` — 4 surviving mutants

**Cluster 1** (lines 183 — `listAllLessonIds()`): 1 mutant surviving — ArrayDeclaration×1

Sample mutation:
```diff
- const allLessonIds = existing.completedAt == null ? await listAllLessonIds(t) : [];
+ <replaced with: ["Stryker was here"]>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `enrollment.repository.ts:183` in `listAllLessonIds`, not just truthiness.

**Cluster 2** (lines 199 — `if()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (allComplete && existing.completedAt == null) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `enrollment.repository.ts:199` in `if` with assertions that distinguish the outcomes.

**Cluster 3** (lines 345 — `stamp()`): 2 mutants surviving — ArrayDeclaration×1, ConditionalExpression×1

Sample mutation:
```diff
- (existing.progress ?? []).map((p) => [p.lessonId, p.completedAt != null]),
+ <replaced with: ["Stryker was here"]>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `enrollment.repository.ts:345` in `stamp`, not just truthiness.

### `src/lib/categories/categories.exception-filter.ts` — 3 surviving mutants

**Cluster 4** (lines 17–19 — `catch()`): 3 mutants surviving — BlockStatement×1, ObjectLiteral×1, BooleanLiteral×1

Sample mutation:
```diff
- catch(exception: unknown, host: ArgumentsHost): void {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `categories.exception-filter.ts:17` in `catch` — verify state change, mock invocation, or returned value.

### `src/lib/video/video.repository.ts` — 3 surviving mutants

**Cluster 5** (lines 84 — `getVideoByLesson()`): 3 mutants surviving — ConditionalExpression×2, StringLiteral×1

Sample mutation:
```diff
- const failedRank = Number(a.state === 'FAILED') - Number(b.state === 'FAILED');
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `video.repository.ts:84` in `getVideoByLesson` with assertions that distinguish the outcomes.

### `src/lib/video/captions/webvtt.validator.ts` — 3 surviving mutants

**Cluster 6** (lines 2): 2 mutants surviving — Regex×2

Sample mutation:
```diff
- const CUE_TIMING = /(?:\d{2}:)?\d{2}:\d{2}\.\d{3}\s*-->\s*(?:\d{2}:)?\d{2}:\d{2}\.\d{3}/;
+ <replaced with: /(?:\d:)?\d{2}:\d{2}\.\d{3}\s*-->\s*(?:\d{2}:)?\d{2}:\d{2}\.\d{3}/>
```

_Diagnosis._ A regex literal could be replaced with `/.*/` and tests pass. Assert against inputs that should and should not match.

_Recommended test._ Inspect `webvtt.validator.ts:2` and add an assertion that distinguishes the original from the surviving mutation.

**Cluster 7** (lines 11 — `slice()`): 1 mutant surviving — Regex×1

Sample mutation:
```diff
- if (!/^WEBVTT(?:[ \t\r\n]|$)/.test(body)) return false;
+ <replaced with: /^WEBVTT(?:[ \t\r\n])/>
```

_Diagnosis._ A regex literal could be replaced with `/.*/` and tests pass. Assert against inputs that should and should not match.

_Recommended test._ Inspect `webvtt.validator.ts:11` in `slice` and add an assertion that distinguishes the original from the surviving mutation.

### `src/lib/categories/categories.repository.ts` — 1 surviving mutant

**Cluster 8** (lines 78–81 — `get()`): 1 mutant surviving — BlockStatement×1

Sample mutation:
```diff
- ): Promise<CourseCategoryDoc | null> {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `categories.repository.ts:78` in `get` — verify state change, mock invocation, or returned value.

### `src/lib/analytics/analytics.service.ts` — 1 surviving mutant

**Cluster 9** (lines 57 — `for()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (!byLesson.has(p.lessonId)) byLesson.set(p.lessonId, p);
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `analytics.service.ts:57` in `for` with assertions that distinguish the outcomes.

### `src/lib/catalog/catalog.service.ts` — 1 surviving mutant

**Cluster 10** (lines 137–140 — `if()`): 1 mutant surviving — BlockStatement×1

Sample mutation:
```diff
- } else {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `catalog.service.ts:137` in `if` — verify state change, mock invocation, or returned value.

### `src/lib/categories/admin-categories.controller.ts` — 1 surviving mutant

**Cluster 11** (lines 47 — `if()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- throw new CategoryValidationException('reassignTo must be a single category id.');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `admin-categories.controller.ts:47` in `if`. If it's a log message, classify as equivalent.

### `src/lib/materials/materials.repository.ts` — 1 surviving mutant

**Cluster 12** (lines 44 — `if()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (err instanceof DocumentNotFoundError) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `materials.repository.ts:44` in `if` with assertions that distinguish the outcomes.

### `src/lib/video/errors/video.exception.ts` — 1 surviving mutant

**Cluster 13** (lines 150 — `constructor()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- 'No open upload session for this video; start the upload again.',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video.exception.ts:150` in `constructor`. If it's a log message, classify as equivalent.

### `src/lib/video/webhook/pubsub-push.guard.ts` — 1 surviving mutant

**Cluster 14** (lines 106 — `assertAudience()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- ? expected !== undefined && payload.aud.includes(expected)
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `pubsub-push.guard.ts:106` in `assertAudience` with assertions that distinguish the outcomes.

## Equivalent-mutant candidates (excluded from adjusted score)

4 mutants flagged as likely equivalent — these are excluded from the **adjusted** score above. Reviewer should confirm each before treating the adjusted score as authoritative:

| File:line | Mutator | Reason |
|-----------|---------|--------|
| `src/lib/categories/categories.exception-filter.ts:15` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/video/video.service.ts:196` | BlockStatement | Catch block contains only logging — emptying it preserves the silent-swallow behavior. |
| `src/lib/video/video.service.ts:213` | BlockStatement | Catch block contains only logging — emptying it preserves the silent-swallow behavior. |
| `src/lib/video/video.service.ts:219` | BlockStatement | Catch block contains only logging — emptying it preserves the silent-swallow behavior. |

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.api-courses.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.
