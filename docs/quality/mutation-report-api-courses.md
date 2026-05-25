# Mutation Test Report — `libs/api-courses`

> Generated 2026-05-25T17:09:18.984Z

**Headline mutation score: 90.75%** (killed=1865, survived=163, no-cov=27, ignored=0). Score on covered mutants only: 91.96%.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/video/video-storage.adapter.ts` | 67.7% | 88 | 31 | 11 |
| `src/lib/video/webhook/fake-transcoder.controller.ts` | 69.6% | 16 | 7 | 0 |
| `src/lib/video/webhook/transcoder-events.controller.ts` | 70.6% | 12 | 5 | 0 |
| `src/lib/video/transcoder/fake-transcoder.adapter.ts` | 70.8% | 34 | 9 | 5 |
| `src/lib/learn/learn.exception-filter.ts` | 76.6% | 59 | 16 | 2 |
| `src/lib/video/video.exception-filter.ts` | 77.9% | 60 | 15 | 2 |
| `src/lib/video/video.service.ts` | 83.5% | 142 | 27 | 1 |
| `src/lib/learn/errors/learn.exception.ts` | 85.7% | 6 | 1 | 0 |
| `src/lib/catalog/catalog.service.ts` | 87.9% | 94 | 11 | 2 |
| `src/lib/video/webhook/pubsub-push.guard.ts` | 89.7% | 61 | 5 | 2 |
| `src/lib/learn/guards/lesson-enrollment-or-owner.guard.ts` | 90.6% | 29 | 3 | 0 |
| `src/lib/video/transcoder/gcp-transcoder.adapter.ts` | 91.5% | 54 | 4 | 1 |
| `src/lib/catalog/parse-course-id.pipe.ts` | 92.3% | 12 | 1 | 0 |
| `src/lib/materials/webhook/fake-materials.controller.ts` | 92.3% | 24 | 2 | 0 |
| `src/lib/materials/materials.repository.ts` | 92.9% | 13 | 1 | 0 |
| `src/lib/video/playback/enrollment-or-owner.guard.ts` | 92.9% | 26 | 2 | 0 |
| `src/lib/enrollment/enrollment.service.ts` | 93.3% | 14 | 1 | 0 |
| `src/lib/enrollment/enrollment.repository.ts` | 93.8% | 60 | 4 | 0 |
| `src/lib/video/video.repository.ts` | 94.9% | 94 | 5 | 0 |
| `src/lib/materials/errors/material.exception.ts` | 95.0% | 19 | 1 | 0 |
| `src/lib/materials/materials.exception-filter.ts` | 95.5% | 63 | 3 | 0 |
| `src/lib/materials/materials.service.ts` | 95.7% | 67 | 3 | 0 |
| `src/lib/materials/material-access.guard.ts` | 95.8% | 23 | 1 | 0 |
| `src/lib/publish/publish-eligibility.ts` | 96.1% | 49 | 2 | 0 |
| `src/lib/materials/materials-storage.adapter.ts` | 98.0% | 50 | 1 | 0 |
| `src/lib/materials/materials.config.ts` | 98.2% | 54 | 1 | 0 |
| `src/lib/video/video.config.ts` | 98.3% | 115 | 1 | 1 |
| `src/lib/catalog/catalog.controller.ts` | 100.0% | 3 | 0 | 0 |
| `src/lib/catalog/instructor-directory.ts` | 100.0% | 8 | 0 | 0 |
| `src/lib/course-owner.guard.ts` | 100.0% | 13 | 0 | 0 |
| `src/lib/courses.controller.ts` | 100.0% | 24 | 0 | 0 |
| `src/lib/courses.service.ts` | 100.0% | 63 | 0 | 0 |
| `src/lib/enrollment/enrollment.controller.ts` | 100.0% | 3 | 0 | 0 |
| `src/lib/errors/courses.exception.ts` | 100.0% | 36 | 0 | 0 |
| `src/lib/learn/learn.controller.ts` | 100.0% | 8 | 0 | 0 |
| `src/lib/learn/learn.service.ts` | 100.0% | 12 | 0 | 0 |
| `src/lib/materials/material-owner.guard.ts` | 100.0% | 13 | 0 | 0 |
| `src/lib/materials/materials.controller.ts` | 100.0% | 14 | 0 | 0 |
| `src/lib/publish/publish.service.ts` | 100.0% | 67 | 0 | 0 |
| `src/lib/reorder.util.ts` | 100.0% | 11 | 0 | 0 |
| `src/lib/video/errors/video.exception.ts` | 100.0% | 45 | 0 | 0 |
| `src/lib/video/playback/current-video.decorator.ts` | 100.0% | 6 | 0 | 0 |
| `src/lib/video/playback/key.service.ts` | 100.0% | 12 | 0 | 0 |
| `src/lib/video/playback/manifest.rewriter.ts` | 100.0% | 89 | 0 | 0 |
| `src/lib/video/playback/manifest.service.ts` | 100.0% | 8 | 0 | 0 |
| `src/lib/video/playback/playback.controller.ts` | 100.0% | 19 | 0 | 0 |
| `src/lib/video/transcoder/transcoder-job.builder.ts` | 100.0% | 48 | 0 | 0 |
| `src/lib/video/video-owner.guard.ts` | 100.0% | 13 | 0 | 0 |
| `src/lib/video/video.controller.ts` | 100.0% | 12 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/video/video-storage.adapter.ts` — 42 surviving mutants

**Cluster 1** (lines 14–19): 3 mutants surviving — BlockStatement×2, StringLiteral×1

```diff
- try {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure.

_Recommended test._ Assert on the side effect at `video-storage.adapter.ts:14`.

**Cluster 2** (lines 59 — `signObjectUrl()`): 1 mutant surviving — ArrowFunction×1

```diff
- private runner: FfprobeRunner = (binary, args) => promisifiedExecFile(binary, args);
+ <replaced with: () => undefined>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing.

_Recommended test._ Assert on the side effect at `video-storage.adapter.ts:59` in `signObjectUrl`.

**Cluster 3** (lines 76–98 — `__setRunner()`): 9 mutants surviving — BlockStatement×1, LogicalOperator×1, StringLiteral×2, ObjectLiteral×4, ConditionalExpression×1

```diff
- }): Promise<ResumableSession> {
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass.

_Recommended test._ Assert on array length / object shape at `video-storage.adapter.ts:76` in `__setRunner`.

**Cluster 4** (lines 133–134 — `if()`): 2 mutants surviving — ArithmeticOperator×1, StringLiteral×1

```diff
- expires: Date.now() + 60_000,
+ <replaced with: Date.now() - 60_000>
```

_Diagnosis._ An arithmetic operator could be replaced. Pin the math with a deterministic input/output pair.

_Recommended test._ Inspect `video-storage.adapter.ts:133` in `if`.

**Cluster 5** (lines 141–158 — `runFfprobe()`): 12 mutants surviving — ArrayDeclaration×1, StringLiteral×7, OptionalChaining×2, ConditionalExpression×2

```diff
- const { stdout } = await this.runner(ffprobeBinaryPath, [
+ <replaced with: []>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `video-storage.adapter.ts:141` in `runFfprobe`.

**Cluster 6** (lines 190–214 — `fakeReadManifest()`): 15 mutants surviving — StringLiteral×15

```diff
- '#EXT-X-VERSION:6',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `video-storage.adapter.ts:190` in `fakeReadManifest`.

### `src/lib/video/video.service.ts` — 24 surviving mutants

**Cluster 7** (lines 47–48): 2 mutants surviving — StringLiteral×2

```diff
- 'UPLOADED',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `video.service.ts:47`.

**Cluster 8** (lines 87 — `nowIso()`): 2 mutants surviving — ArrowFunction×2

```diff
- this.sleep = deps?.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
+ <replaced with: () => undefined>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing.

_Recommended test._ Assert on the side effect at `video.service.ts:87` in `nowIso`.

**Cluster 9** (lines 171 — `verifyUploadObjectOrThrow()`): 1 mutant surviving — ObjectLiteral×1

```diff
- const head = await this.storage.headObject({ bucket: v.source.bucket, path: v.source.path });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass.

_Recommended test._ Assert on array length / object shape at `video.service.ts:171` in `verifyUploadObjectOrThrow`.

**Cluster 10** (lines 187–192 — `if()`): 2 mutants surviving — ObjectLiteral×2

```diff
- const probe = await this.storage.probeSource({ bucket: v.source.bucket, path: v.source.path });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass.

_Recommended test._ Assert on array length / object shape at `video.service.ts:187` in `if`.

**Cluster 11** (lines 214 — `generateContentKey()`): 2 mutants surviving — StringLiteral×1, LogicalOperator×1

```diff
- topic: this.cfg.transcoderTopic ?? '',
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `video.service.ts:214` in `generateContentKey`.

**Cluster 12** (lines 231 — `generateContentKey()`): 1 mutant surviving — MethodExpression×1

```diff
- failureReason: `${code}: ${detail}`.slice(0, 500),
+ <replaced with: `${code}: ${detail}`>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing.

_Recommended test._ Assert on the side effect at `video.service.ts:231` in `generateContentKey`.

**Cluster 13** (lines 240 — `generateContentKey()`): 1 mutant surviving — StringLiteral×1

```diff
- let lastError = 'unknown';
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `video.service.ts:240` in `generateContentKey`.

**Cluster 14** (lines 247 — `catch()`): 1 mutant surviving — ArithmeticOperator×1

```diff
- this.logger.warn(`submitJob attempt ${attempt + 1} failed: ${lastError}`);
+ <replaced with: attempt - 1>
```

_Diagnosis._ An arithmetic operator could be replaced. Pin the math with a deterministic input/output pair.

_Recommended test._ Inspect `video.service.ts:247` in `catch`.

**Cluster 15** (lines 281 — `delete()`): 2 mutants surviving — ObjectLiteral×1, BooleanLiteral×1

```diff
- await this.tearDownVideoSideEffects(v, { logCancelFailures: true });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass.

_Recommended test._ Assert on array length / object shape at `video.service.ts:281` in `delete`.

**Cluster 16** (lines 288 — `deleteForLesson()`): 2 mutants surviving — ObjectLiteral×1, BooleanLiteral×1

```diff
- await this.tearDownVideoSideEffects(v, { logCancelFailures: false });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass.

_Recommended test._ Assert on array length / object shape at `video.service.ts:288` in `deleteForLesson`.

**Cluster 17** (lines 306–314 — `if()`): 8 mutants surviving — ConditionalExpression×4, BlockStatement×2, LogicalOperator×1, OptionalChaining×1

```diff
- if (v.state === 'TRANSCODING' && v.transcoderJobName) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `video.service.ts:306` in `if`.

### `src/lib/learn/learn.exception-filter.ts` — 17 surviving mutants

**Cluster 18** (lines 73 — `respondShaped()`): 2 mutants surviving — ConditionalExpression×2

```diff
- if (err.details) body.error.details = err.details;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `learn.exception-filter.ts:73` in `respondShaped`.

**Cluster 19** (lines 83 — `respondValidation()`): 1 mutant surviving — StringLiteral×1

```diff
- message: 'Request body failed validation.',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `learn.exception-filter.ts:83` in `respondValidation`.

**Cluster 20** (lines 90–97 — `normalizeMessages()`): 7 mutants surviving — ConditionalExpression×3, ArrayDeclaration×2, BlockStatement×1, LogicalOperator×1

```diff
- if (Array.isArray(message)) return message;
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `learn.exception-filter.ts:90` in `normalizeMessages`.

**Cluster 21** (lines 105–111 — `for()`): 7 mutants surviving — BlockStatement×1, StringLiteral×1, BooleanLiteral×1, ConditionalExpression×3, ArrayDeclaration×1

```diff
- for (const msg of messages) {
+ <replaced with: {}>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass.

_Recommended test._ Drive both sides of the conditional at `learn.exception-filter.ts:105` in `for`.

### `src/lib/video/video.exception-filter.ts` — 16 surviving mutants

**Cluster 22** (lines 73 — `respondShaped()`): 1 mutant surviving — ConditionalExpression×1

```diff
- if (err.details) body.error.details = err.details;
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `video.exception-filter.ts:73` in `respondShaped`.

**Cluster 23** (lines 83 — `respondValidation()`): 1 mutant surviving — StringLiteral×1

```diff
- message: 'Request body failed validation.',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `video.exception-filter.ts:83` in `respondValidation`.

**Cluster 24** (lines 90–97 — `normalizeMessages()`): 7 mutants surviving — ConditionalExpression×3, ArrayDeclaration×2, BlockStatement×1, LogicalOperator×1

```diff
- if (Array.isArray(message)) return message;
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `video.exception-filter.ts:90` in `normalizeMessages`.

**Cluster 25** (lines 105–111 — `for()`): 7 mutants surviving — BlockStatement×1, StringLiteral×1, BooleanLiteral×1, ConditionalExpression×3, ArrayDeclaration×1

```diff
- for (const msg of messages) {
+ <replaced with: {}>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass.

_Recommended test._ Drive both sides of the conditional at `video.exception-filter.ts:105` in `for`.

### `src/lib/video/transcoder/fake-transcoder.adapter.ts` — 14 surviving mutants

**Cluster 26** (lines 37 — `submitJob()`): 2 mutants surviving — BooleanLiteral×1, ObjectLiteral×1

```diff
- this.jobs.set(jobName, { input, cancelled: false });
+ <replaced with: true>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass.

_Recommended test._ Drive both sides of the conditional at `fake-transcoder.adapter.ts:37` in `submitJob`.

**Cluster 27** (lines 43–50 — `parseEvent()`): 8 mutants surviving — OptionalChaining×2, StringLiteral×3, ConditionalExpression×2, LogicalOperator×1

```diff
- const dataB64 = envelope.message?.data;
+ <replaced with: envelope.message.data>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `fake-transcoder.adapter.ts:43` in `parseEvent`.

**Cluster 28** (lines 61–62 — `if()`): 3 mutants surviving — ConditionalExpression×1, StringLiteral×1, OptionalChaining×1

```diff
- if (job.state === 'FAILED') {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `fake-transcoder.adapter.ts:61` in `if`.

**Cluster 29** (lines 70 — `if()`): 1 mutant surviving — StringLiteral×1

```diff
- throw new Error(`Unexpected job.state: ${String(job.state)}`);
+ <replaced with: ``>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `fake-transcoder.adapter.ts:70` in `if`.

### `src/lib/catalog/catalog.service.ts` — 13 surviving mutants

**Cluster 30** (lines 42 — `if()`): 1 mutant surviving — ConditionalExpression×1

```diff
- if (query.category) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `catalog.service.ts:42` in `if`.

**Cluster 31** (lines 48–53 — `if()`): 2 mutants surviving — StringLiteral×1, MethodExpression×1

```diff
- courses = sortCourses(courses, query.sort ?? 'NEWEST');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `catalog.service.ts:48` in `if`.

**Cluster 32** (lines 87 — `if()`): 1 mutant surviving — StringLiteral×1

```diff
- instructorDisplayName: names.get(course.instructorId) ?? 'Instructor',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `catalog.service.ts:87` in `if`.

**Cluster 33** (lines 112–129 — `publishedAt()`): 8 mutants surviving — LogicalOperator×2, BlockStatement×2, ConditionalExpression×2, ObjectLiteral×1, MethodExpression×1

```diff
- return c.publishedAt ?? c.createdAt;
+ <replaced with: c.publishedAt && c.createdAt>
```

_Diagnosis._ `&&` / `||` swap survived. Add a test for the partial case.

_Recommended test._ Test the partial case for the logical expression at `catalog.service.ts:112` in `publishedAt`.

**Cluster 34** (lines 147 — `toSummary()`): 1 mutant surviving — StringLiteral×1

```diff
- instructorDisplayName: names.get(course.instructorId) ?? 'Instructor',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `catalog.service.ts:147` in `toSummary`.

### `src/lib/video/webhook/pubsub-push.guard.ts` — 7 surviving mutants

**Cluster 35** (lines 19 — `getPayload()`): 1 mutant surviving — StringLiteral×1

```diff
- export const ID_TOKEN_VERIFIER = Symbol.for('learnwren.api-video.idTokenVerifier');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `pubsub-push.guard.ts:19` in `getPayload`.

**Cluster 36** (lines 65–69 — `assertConfigComplete()`): 5 mutants surviving — BlockStatement×2, ConditionalExpression×1, LogicalOperator×1, StringLiteral×1

```diff
- function assertConfigComplete(cfg: VideoConfig): void {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure.

_Recommended test._ Assert on the side effect at `pubsub-push.guard.ts:65` in `assertConfigComplete`.

**Cluster 37** (lines 87 — `assertNotExpired()`): 1 mutant surviving — EqualityOperator×1

```diff
- if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) {
+ <replaced with: payload.exp * 1000 <= Date.now()>
```

_Diagnosis._ An equality / inequality operator could be flipped and tests still pass.

_Recommended test._ Add a boundary test at `pubsub-push.guard.ts:87` in `assertNotExpired`.

### `src/lib/video/webhook/fake-transcoder.controller.ts` — 7 surviving mutants

**Cluster 38** (lines 19–22 — `envelope()`): 2 mutants surviving — StringLiteral×2

```diff
- messageId: `fake-${Date.now()}`,
+ <replaced with: ``>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `fake-transcoder.controller.ts:19` in `envelope`.

**Cluster 39** (lines 34–37 — `constructor()`): 3 mutants surviving — StringLiteral×2, ObjectLiteral×1

```diff
- name: `projects/fake/locations/fake/jobs/${vid}`,
+ <replaced with: ``>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `fake-transcoder.controller.ts:34` in `constructor`.

**Cluster 40** (lines 52–54 — `constructor()`): 2 mutants surviving — StringLiteral×1, ObjectLiteral×1

```diff
- name: `projects/fake/locations/fake/jobs/${vid}`,
+ <replaced with: ``>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `fake-transcoder.controller.ts:52` in `constructor`.

### `src/lib/video/transcoder/gcp-transcoder.adapter.ts` — 5 surviving mutants

**Cluster 41** (lines 48 — `submitJob()`): 1 mutant surviving — OptionalChaining×1

```diff
- encryptions: cfg.encryptions?.map((e) => ({
+ <replaced with: cfg.encryptions.map>
```

_Diagnosis._ Removing `?.` didn't break tests. Add a case where the parent is null/undefined.

_Recommended test._ Add a null/undefined parent case at `gcp-transcoder.adapter.ts:48` in `submitJob`.

**Cluster 42** (lines 55–65 — `submitJob()`): 3 mutants surviving — StringLiteral×1, OptionalChaining×2

```diff
- return { jobName: job.name ?? '' };
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ Removing `?.` didn't break tests. Add a case where the parent is null/undefined.

_Recommended test._ Add a null/undefined parent case at `gcp-transcoder.adapter.ts:55` in `submitJob`.

**Cluster 43** (lines 85 — `if()`): 1 mutant surviving — MethodExpression×1

```diff
- reason: (job.error?.message ?? 'unknown').slice(0, 500),
+ <replaced with: job.error?.message ?? 'unknown'>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing.

_Recommended test._ Assert on the side effect at `gcp-transcoder.adapter.ts:85` in `if`.

### `src/lib/video/video.repository.ts` — 5 surviving mutants

**Cluster 44** (lines 36 — `lessonByIdQuery()`): 1 mutant surviving — StringLiteral×1

```diff
- return this.db.collectionGroup('lessons').where('id', '==', lid).limit(1);
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `video.repository.ts:36` in `lessonByIdQuery`.

**Cluster 45** (lines 51 — `getVideoByLesson()`): 1 mutant surviving — StringLiteral×1

```diff
- .where('lessonId', '==', lid)
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `video.repository.ts:51` in `getVideoByLesson`.

**Cluster 46** (lines 147 — `if()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

```diff
- const targetState = args.outcome.kind === 'READY' ? 'READY' : 'FAILED';
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `video.repository.ts:147` in `if`.

**Cluster 47** (lines 185 — `deleteVideoAndDetach()`): 1 mutant surviving — StringLiteral×1

```diff
- const keyQ = this.db.collection('videoKeys').where('videoId', '==', vid).limit(1);
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `video.repository.ts:185` in `deleteVideoAndDetach`.

### `src/lib/enrollment/enrollment.repository.ts` — 4 surviving mutants

**Cluster 48** (lines 85 — `if()`): 2 mutants surviving — ObjectLiteral×1, StringLiteral×1

```diff
- t.update(enrollmentRef, { status: 'ACTIVE', withdrawnAt: null, updatedAt: now });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass.

_Recommended test._ Assert on array length / object shape at `enrollment.repository.ts:85` in `if`.

**Cluster 49** (lines 127 — `if()`): 2 mutants surviving — MethodExpression×1, LogicalOperator×1

```diff
- const nextCount = Math.max(0, (course.enrollmentCount ?? 0) - 1);
+ <replaced with: Math.min(0, (course.enrollmentCount ?? 0) - 1)>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing.

_Recommended test._ Assert on the side effect at `enrollment.repository.ts:127` in `if`.

### `src/lib/learn/guards/lesson-enrollment-or-owner.guard.ts` — 3 surviving mutants

**Cluster 50** (lines 24 — `canActivate()`): 1 mutant surviving — ConditionalExpression×1

```diff
- if (!course) throw new LessonNotFoundException();
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `lesson-enrollment-or-owner.guard.ts:24` in `canActivate`.

**Cluster 51** (lines 30 — `if()`): 1 mutant surviving — OptionalChaining×1

```diff
- if (course.instructorId === req.user?.uid) {
+ <replaced with: req.user.uid>
```

_Diagnosis._ Removing `?.` didn't break tests. Add a case where the parent is null/undefined.

_Recommended test._ Add a null/undefined parent case at `lesson-enrollment-or-owner.guard.ts:30` in `if`.

**Cluster 52** (lines 54 — `for()`): 1 mutant surviving — ConditionalExpression×1

```diff
- if (lesson) return lesson;
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `lesson-enrollment-or-owner.guard.ts:54` in `for`.

### `src/lib/materials/materials.service.ts` — 3 surviving mutants

**Cluster 53** (lines 43 — `toLowerCase()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

```diff
- const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `materials.service.ts:43` in `toLowerCase`.

**Cluster 54** (lines 179–182 — `verifyUploadedObject()`): 1 mutant surviving — ObjectLiteral×1

```diff
- const head = await this.storage.headObject({
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass.

_Recommended test._ Assert on array length / object shape at `materials.service.ts:179` in `verifyUploadedObject`.

### `src/lib/video/video.config.ts` — 2 surviving mutants

**Cluster 55** (lines 1): 1 mutant surviving — StringLiteral×1

```diff
- export const VIDEO_CONFIG = Symbol.for('learnwren.api-video.config');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `video.config.ts:1`.

**Cluster 56** (lines 95 — `if()`): 1 mutant surviving — StringLiteral×1

```diff
- const implRaw = env['LEARNWREN_VIDEO_TRANSCODER'] ?? (isProduction ? 'gcp' : 'fake');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `video.config.ts:95` in `if`.

### `src/lib/materials/materials.exception-filter.ts` — 2 surviving mutants

**Cluster 57** (lines 46 — `catch()`): 1 mutant surviving — ConditionalExpression×1

```diff
- if (err.details) body.error.details = err.details;
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `materials.exception-filter.ts:46` in `catch`.

**Cluster 58** (lines 57 — `if()`): 1 mutant surviving — ArrayDeclaration×1

```diff
- : [];
+ <replaced with: ["Stryker was here"]>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass.

_Recommended test._ Assert on array length / object shape at `materials.exception-filter.ts:57` in `if`.

### `src/lib/materials/webhook/fake-materials.controller.ts` — 2 surviving mutants

**Cluster 59** (lines 21 — `collectStream()`): 1 mutant surviving — StringLiteral×1

```diff
- req.on('error', reject);
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `fake-materials.controller.ts:21` in `collectStream`.

**Cluster 60** (lines 27 — `sanitizeFilename()`): 1 mutant surviving — StringLiteral×1

```diff
- return name.replace(/["\\\r\n]/g, '_');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `fake-materials.controller.ts:27` in `sanitizeFilename`.

### `src/lib/publish/publish-eligibility.ts` — 2 surviving mutants

**Cluster 61** (lines 40–43 — `if()`): 2 mutants surviving — ConditionalExpression×1, BlockStatement×1

```diff
- if (!l.videoId) {
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `publish-eligibility.ts:40` in `if`.

### `src/lib/video/playback/enrollment-or-owner.guard.ts` — 2 surviving mutants

**Cluster 62** (lines 26 — `canActivate()`): 1 mutant surviving — ConditionalExpression×1

```diff
- if (!vid) throw new VideoNotFoundException();
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `enrollment-or-owner.guard.ts:26` in `canActivate`.

**Cluster 63** (lines 45 — `if()`): 1 mutant surviving — OptionalChaining×1

```diff
- if (course?.status === 'PUBLISHED') {
+ <replaced with: course.status>
```

_Diagnosis._ Removing `?.` didn't break tests. Add a case where the parent is null/undefined.

_Recommended test._ Add a null/undefined parent case at `enrollment-or-owner.guard.ts:45` in `if`.

### `src/lib/catalog/parse-course-id.pipe.ts` — 1 surviving mutant

**Cluster 64** (lines 24 — `transform()`): 1 mutant surviving — ConditionalExpression×1

```diff
- if (typeof value !== 'string' || !ParseCourseIdPipe.PATTERN.test(value)) {
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `parse-course-id.pipe.ts:24` in `transform`.

### `src/lib/enrollment/enrollment.service.ts` — 1 surviving mutant

**Cluster 65** (lines 43 — `unenroll()`): 1 mutant surviving — OptionalChaining×1

```diff
- return { enrollment, isOwner: course?.instructorId === userId };
+ <replaced with: course.instructorId>
```

_Diagnosis._ Removing `?.` didn't break tests. Add a case where the parent is null/undefined.

_Recommended test._ Add a null/undefined parent case at `enrollment.service.ts:43` in `unenroll`.

### `src/lib/learn/errors/learn.exception.ts` — 1 surviving mutant

**Cluster 66** (lines 11): 1 mutant surviving — StringLiteral×1

```diff
- this.name = 'LearnException';
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `learn.exception.ts:11`.

### `src/lib/materials/errors/material.exception.ts` — 1 surviving mutant

**Cluster 67** (lines 11): 1 mutant surviving — StringLiteral×1

```diff
- this.name = 'MaterialException';
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `material.exception.ts:11`.

### `src/lib/materials/material-access.guard.ts` — 1 surviving mutant

**Cluster 68** (lines 42 — `if()`): 1 mutant surviving — OptionalChaining×1

```diff
- if (course?.status === 'PUBLISHED') {
+ <replaced with: course.status>
```

_Diagnosis._ Removing `?.` didn't break tests. Add a case where the parent is null/undefined.

_Recommended test._ Add a null/undefined parent case at `material-access.guard.ts:42` in `if`.

### `src/lib/materials/materials-storage.adapter.ts` — 1 surviving mutant

**Cluster 69** (lines 84 — `Number()`): 1 mutant surviving — ConditionalExpression×1

```diff
- const size = typeof meta.size === 'string' ? Number(meta.size) : (meta.size as number);
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `materials-storage.adapter.ts:84` in `Number`.

### `src/lib/materials/materials.config.ts` — 1 surviving mutant

**Cluster 70** (lines 1): 1 mutant surviving — StringLiteral×1

```diff
- export const MATERIALS_CONFIG = Symbol.for('learnwren.api-courses.materials.config');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `materials.config.ts:1`.

### `src/lib/materials/materials.repository.ts` — 1 surviving mutant

**Cluster 71** (lines 22 — `listByLesson()`): 1 mutant surviving — StringLiteral×1

```diff
- .where('lessonId', '==', lessonId)
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `materials.repository.ts:22` in `listByLesson`.

### `src/lib/video/webhook/transcoder-events.controller.ts` — 1 surviving mutant

**Cluster 72** (lines 25 — `catch()`): 1 mutant surviving — StringLiteral×1

```diff
- res.status(200).json({ acked: true, reason: 'MALFORMED' });
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `transcoder-events.controller.ts:25` in `catch`.

## Equivalent-mutant candidates

| File:line | Mutator | Reason |
|-----------|---------|--------|
| `src/lib/learn/learn.exception-filter.ts:31` | StringLiteral | Logger name passed to `new Logger(...)`. |
| `src/lib/video/video.exception-filter.ts:31` | StringLiteral | Logger name passed to `new Logger(...)`. |
| `src/lib/video/video.service.ts:77` | StringLiteral | Logger name passed to `new Logger(...)`. |
| `src/lib/video/video.service.ts:191` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/video/video.service.ts:247` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/video/video.service.ts:310` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/materials/materials.exception-filter.ts:26` | StringLiteral | Logger name passed to `new Logger(...)`. |
| `src/lib/video/webhook/transcoder-events.controller.ts:11` | StringLiteral | Logger name passed to `new Logger(...)`. |
| `src/lib/video/webhook/transcoder-events.controller.ts:24` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/video/webhook/transcoder-events.controller.ts:36` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/video/webhook/transcoder-events.controller.ts:40` | StringLiteral | Inside logger call — observability, not behavior. |
