# Mutation Test Report — `libs/api-courses`

> Generated 2026-05-29T07:15:02.053Z

**Headline mutation score: 92.26%** (killed=2038, survived=142, no-cov=29, ignored=0). Score on covered mutants only: 93.49%. Adjusted (equivalent candidates excluded): 92.89%.


Target band: core domain logic — 75–85% target.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/cover/cover-storage.adapter.ts` | 0.0% | 0 | 1 | 12 |
| `src/lib/cover/cover.exception-filter.ts` | 50.0% | 1 | 1 | 0 |
| `src/lib/cover/errors/cover.exception.ts` | 71.4% | 10 | 4 | 0 |
| `src/lib/cover/cover-image.service.ts` | 74.4% | 29 | 10 | 0 |
| `src/lib/learn/guards/find-lesson-in-course.ts` | 75.0% | 3 | 1 | 0 |
| `src/lib/learn/learn.exception-filter.ts` | 75.0% | 3 | 1 | 0 |
| `src/lib/materials/materials.exception-filter.ts` | 75.0% | 3 | 1 | 0 |
| `src/lib/video/video.exception-filter.ts` | 75.0% | 3 | 1 | 0 |
| `src/lib/video/webhook/transcoder-events.controller.ts` | 76.5% | 13 | 4 | 0 |
| `src/lib/learn/learn.controller.ts` | 80.9% | 38 | 7 | 2 |
| `src/lib/video/webhook/fake-transcoder.controller.ts` | 82.8% | 24 | 5 | 0 |
| `src/lib/cover/fake-cover-storage.adapter.ts` | 83.3% | 5 | 0 | 1 |
| `src/lib/video/video.service.ts` | 83.5% | 142 | 27 | 1 |
| `src/lib/catalog/catalog.service.ts` | 84.3% | 97 | 16 | 2 |
| `src/lib/learn/learn.service.ts` | 84.5% | 49 | 6 | 3 |
| `src/lib/learn/guards/lesson-enrollment.guard.ts` | 85.2% | 23 | 4 | 0 |
| `src/lib/cover/cover.controller.ts` | 86.7% | 13 | 2 | 0 |
| `src/lib/video/webhook/pubsub-push.guard.ts` | 89.7% | 61 | 5 | 2 |
| `src/lib/video/transcoder/gcp-transcoder.adapter.ts` | 91.5% | 54 | 4 | 1 |
| `src/lib/video/transcoder/fake-transcoder.adapter.ts` | 91.7% | 44 | 4 | 0 |
| `src/lib/catalog/parse-course-id.pipe.ts` | 92.3% | 12 | 1 | 0 |
| `src/lib/learn/errors/learn.exception.ts` | 92.3% | 12 | 1 | 0 |
| `src/lib/materials/webhook/fake-materials.controller.ts` | 92.3% | 24 | 2 | 0 |
| `src/lib/materials/materials.repository.ts` | 92.9% | 13 | 1 | 0 |
| `src/lib/video/playback/enrollment-or-owner.guard.ts` | 92.9% | 26 | 2 | 0 |
| `src/lib/enrollment/enrollment.service.ts` | 93.3% | 14 | 1 | 0 |
| `src/lib/enrollment/enrollment.repository.ts` | 94.0% | 140 | 7 | 2 |
| `src/lib/learn/guards/lesson-enrollment-or-owner.guard.ts` | 94.4% | 34 | 2 | 0 |
| `src/lib/video/video.repository.ts` | 94.4% | 102 | 6 | 0 |
| `src/lib/materials/errors/material.exception.ts` | 95.0% | 19 | 1 | 0 |
| `src/lib/video/video-storage.adapter.ts` | 95.4% | 124 | 4 | 2 |
| `src/lib/cover/cover.config.ts` | 95.5% | 21 | 1 | 0 |
| `src/lib/materials/materials.service.ts` | 95.7% | 67 | 3 | 0 |
| `src/lib/materials/material-access.guard.ts` | 95.8% | 23 | 1 | 0 |
| `src/lib/publish/publish-eligibility.ts` | 96.5% | 55 | 2 | 0 |
| `src/lib/materials/materials-storage.adapter.ts` | 98.0% | 50 | 1 | 0 |
| `src/lib/materials/materials.config.ts` | 98.2% | 54 | 1 | 0 |
| `src/lib/video/video.config.ts` | 98.3% | 115 | 1 | 1 |
| `src/lib/catalog/catalog.controller.ts` | 100.0% | 3 | 0 | 0 |
| `src/lib/catalog/instructor-directory.ts` | 100.0% | 19 | 0 | 0 |
| `src/lib/course-owner.guard.ts` | 100.0% | 13 | 0 | 0 |
| `src/lib/courses.controller.ts` | 100.0% | 24 | 0 | 0 |
| `src/lib/courses.service.ts` | 100.0% | 63 | 0 | 0 |
| `src/lib/enrollment/enrollment.controller.ts` | 100.0% | 3 | 0 | 0 |
| `src/lib/errors/courses.exception.ts` | 100.0% | 36 | 0 | 0 |
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

### `src/lib/video/video.service.ts` — 24 surviving mutants

**Cluster 1** (lines 47–48): 2 mutants surviving — StringLiteral×2

Sample mutation:
```diff
- 'UPLOADED',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video.service.ts:47`. If it's a log message, classify as equivalent.

**Cluster 2** (lines 87 — `nowIso()`): 2 mutants surviving — ArrowFunction×2

Sample mutation:
```diff
- this.sleep = deps?.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
+ <replaced with: () => undefined>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing. The function is called but its effect isn't asserted.

_Recommended test._ Add an assertion on the side effect of the block/function at `video.service.ts:87` in `nowIso` — verify state change, mock invocation, or returned value.

**Cluster 3** (lines 171 — `verifyUploadObjectOrThrow()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- const head = await this.storage.headObject({ bucket: v.source.bucket, path: v.source.path });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `video.service.ts:171` in `verifyUploadObjectOrThrow`, not just truthiness.

**Cluster 4** (lines 187–192 — `if()`): 2 mutants surviving — ObjectLiteral×2

Sample mutation:
```diff
- const probe = await this.storage.probeSource({ bucket: v.source.bucket, path: v.source.path });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `video.service.ts:187` in `if`, not just truthiness.

**Cluster 5** (lines 214 — `generateContentKey()`): 2 mutants surviving — LogicalOperator×1, StringLiteral×1

Sample mutation:
```diff
- topic: this.cfg.transcoderTopic ?? '',
+ <replaced with: this.cfg.transcoderTopic && ''>
```

_Diagnosis._ `&&` / `||` swap survived: short-circuit semantics aren't exercised. Add a test for the partial case where one operand is true and the other false.

_Recommended test._ Add a test where one operand of the logical expression at `video.service.ts:214` in `generateContentKey` is true and the other is false.

**Cluster 6** (lines 231 — `generateContentKey()`): 1 mutant surviving — MethodExpression×1

Sample mutation:
```diff
- failureReason: `${code}: ${detail}`.slice(0, 500),
+ <replaced with: `${code}: ${detail}`>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing. The function is called but its effect isn't asserted.

_Recommended test._ Add an assertion on the side effect of the block/function at `video.service.ts:231` in `generateContentKey` — verify state change, mock invocation, or returned value.

**Cluster 7** (lines 240 — `generateContentKey()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- let lastError = 'unknown';
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video.service.ts:240` in `generateContentKey`. If it's a log message, classify as equivalent.

**Cluster 8** (lines 247 — `catch()`): 1 mutant surviving — ArithmeticOperator×1

Sample mutation:
```diff
- this.logger.warn(`submitJob attempt ${attempt + 1} failed: ${lastError}`);
+ <replaced with: attempt - 1>
```

_Diagnosis._ An arithmetic operator could be replaced. Pin the math with a deterministic input/output pair.

_Recommended test._ Inspect `video.service.ts:247` in `catch` and add an assertion that distinguishes the original from the surviving mutation.

**Cluster 9** (lines 281 — `delete()`): 2 mutants surviving — ObjectLiteral×1, BooleanLiteral×1

Sample mutation:
```diff
- await this.tearDownVideoSideEffects(v, { logCancelFailures: true });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `video.service.ts:281` in `delete`, not just truthiness.

**Cluster 10** (lines 288 — `deleteForLesson()`): 2 mutants surviving — ObjectLiteral×1, BooleanLiteral×1

Sample mutation:
```diff
- await this.tearDownVideoSideEffects(v, { logCancelFailures: false });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `video.service.ts:288` in `deleteForLesson`, not just truthiness.

**Cluster 11** (lines 306–314 — `if()`): 8 mutants surviving — ConditionalExpression×4, BlockStatement×2, LogicalOperator×1, OptionalChaining×1

Sample mutation:
```diff
- if (v.state === 'TRANSCODING' && v.transcoderJobName) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `video.service.ts:306` in `if` with assertions that distinguish the outcomes.

### `src/lib/catalog/catalog.service.ts` — 18 surviving mutants

**Cluster 12** (lines 42 — `if()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (query.category) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `catalog.service.ts:42` in `if` with assertions that distinguish the outcomes.

**Cluster 13** (lines 48–53 — `if()`): 2 mutants surviving — StringLiteral×1, MethodExpression×1

Sample mutation:
```diff
- courses = sortCourses(courses, query.sort ?? 'NEWEST');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `catalog.service.ts:48` in `if`. If it's a log message, classify as equivalent.

**Cluster 14** (lines 89–91 — `if()`): 4 mutants surviving — StringLiteral×1, OptionalChaining×3

Sample mutation:
```diff
- instructorDisplayName: ref?.displayName ?? 'Instructor',
+ <replaced with: "">
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `catalog.service.ts:89` in `if`.

**Cluster 15** (lines 117–134 — `publishedAt()`): 8 mutants surviving — LogicalOperator×2, BlockStatement×2, ConditionalExpression×2, ObjectLiteral×1, MethodExpression×1

Sample mutation:
```diff
- return c.publishedAt ?? c.createdAt;
+ <replaced with: c.publishedAt && c.createdAt>
```

_Diagnosis._ `&&` / `||` swap survived: short-circuit semantics aren't exercised. Add a test for the partial case where one operand is true and the other false.

_Recommended test._ Add a test where one operand of the logical expression at `catalog.service.ts:117` in `publishedAt` is true and the other is false.

**Cluster 16** (lines 154–155 — `toSummary()`): 3 mutants surviving — StringLiteral×1, OptionalChaining×2

Sample mutation:
```diff
- instructorDisplayName: ref?.displayName ?? 'Instructor',
+ <replaced with: "">
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `catalog.service.ts:154` in `toSummary`.

### `src/lib/cover/cover-storage.adapter.ts` — 13 surviving mutants

**Cluster 17** (lines 28–51 — `putObject()`): 13 mutants surviving — BlockStatement×4, ObjectLiteral×3, BooleanLiteral×2, ConditionalExpression×2, EqualityOperator×1, StringLiteral×1

Sample mutation:
```diff
- async putObject(input: PutObjectInput): Promise<void> {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `cover-storage.adapter.ts:28` in `putObject` — verify state change, mock invocation, or returned value.

### `src/lib/cover/cover-image.service.ts` — 10 surviving mutants

**Cluster 18** (lines 37): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- const pipeline = sharp(body, { failOn: 'truncated' });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `cover-image.service.ts:37`, not just truthiness.

**Cluster 19** (lines 46–53): 8 mutants surviving — ConditionalExpression×3, LogicalOperator×2, BooleanLiteral×2, ObjectLiteral×1

Sample mutation:
```diff
- if (!width || !height) throw new CoverDecodeFailedException();
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `cover-image.service.ts:46` with assertions that distinguish the outcomes.

**Cluster 20** (lines 83 — `removeCover()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- return { updatedAt };
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `cover-image.service.ts:83` in `removeCover`, not just truthiness.

### `src/lib/enrollment/enrollment.repository.ts` — 9 surviving mutants

**Cluster 21** (lines 102 — `if()`): 2 mutants surviving — ObjectLiteral×1, StringLiteral×1

Sample mutation:
```diff
- t.update(enrollmentRef, { status: 'ACTIVE', withdrawnAt: null, updatedAt: now });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `enrollment.repository.ts:102` in `if`, not just truthiness.

**Cluster 22** (lines 140–142 — `if()`): 2 mutants surviving — ArrayDeclaration×1, ConditionalExpression×1

Sample mutation:
```diff
- const progress = [...(existing.progress ?? [])];
+ <replaced with: ["Stryker was here"]>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `enrollment.repository.ts:140` in `if`, not just truthiness.

**Cluster 23** (lines 181 — `if()`): 2 mutants surviving — MethodExpression×1, LogicalOperator×1

Sample mutation:
```diff
- const nextCount = Math.max(0, (course.enrollmentCount ?? 0) - 1);
+ <replaced with: Math.min(0, (course.enrollmentCount ?? 0) - 1)>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing. The function is called but its effect isn't asserted.

_Recommended test._ Add an assertion on the side effect of the block/function at `enrollment.repository.ts:181` in `if` — verify state change, mock invocation, or returned value.

**Cluster 24** (lines 224–226 — `if()`): 3 mutants surviving — ArrayDeclaration×1, ConditionalExpression×2

Sample mutation:
```diff
- const progress = [...(existing.progress ?? [])];
+ <replaced with: ["Stryker was here"]>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `enrollment.repository.ts:224` in `if` with assertions that distinguish the outcomes.

### `src/lib/learn/learn.controller.ts` — 9 surviving mutants

**Cluster 25** (lines 58–62 — `if()`): 9 mutants surviving — BlockStatement×1, ConditionalExpression×3, LogicalOperator×2, StringLiteral×1, OptionalChaining×1, EqualityOperator×1

Sample mutation:
```diff
- if (!req.course || !req.lesson || !req.user) {
+ <replaced with: {}>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `learn.controller.ts:58` in `if` with assertions that distinguish the outcomes.

### `src/lib/video/webhook/pubsub-push.guard.ts` — 7 surviving mutants

**Cluster 26** (lines 19 — `getPayload()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- export const ID_TOKEN_VERIFIER = Symbol.for('learnwren.api-video.idTokenVerifier');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `pubsub-push.guard.ts:19` in `getPayload`. If it's a log message, classify as equivalent.

**Cluster 27** (lines 65–69 — `assertConfigComplete()`): 5 mutants surviving — BlockStatement×2, LogicalOperator×1, ConditionalExpression×1, StringLiteral×1

Sample mutation:
```diff
- function assertConfigComplete(cfg: VideoConfig): void {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `pubsub-push.guard.ts:65` in `assertConfigComplete` — verify state change, mock invocation, or returned value.

**Cluster 28** (lines 87 — `assertNotExpired()`): 1 mutant surviving — EqualityOperator×1

Sample mutation:
```diff
- if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) {
+ <replaced with: payload.exp * 1000 <= Date.now()>
```

_Diagnosis._ An equality / inequality operator could be flipped (`==`↔`!=`, `===`↔`!==`) and tests still pass. Test both equal and unequal inputs at the boundary.

_Recommended test._ Add a boundary test that exercises the equal / off-by-one case at `pubsub-push.guard.ts:87` in `assertNotExpired`.

### `src/lib/learn/learn.service.ts` — 6 surviving mutants

**Cluster 29** (lines 88 — `projectOutline()`): 1 mutant surviving — ArrowFunction×1

Sample mutation:
```diff
- const allLessonIds: LessonId[] = lessonsByModule.flat().map((l) => l.id);
+ <replaced with: () => undefined>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing. The function is called but its effect isn't asserted.

_Recommended test._ Add an assertion on the side effect of the block/function at `learn.service.ts:88` in `projectOutline` — verify state change, mock invocation, or returned value.

**Cluster 30** (lines 94 — `for()`): 1 mutant surviving — ArrayDeclaration×1

Sample mutation:
```diff
- for (const row of enrolment?.progress ?? []) {
+ <replaced with: ["Stryker was here"]>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `learn.service.ts:94` in `for`, not just truthiness.

**Cluster 31** (lines 103 — `for()`): 1 mutant surviving — ArrayDeclaration×1

Sample mutation:
```diff
- lessons: (lessonsByModule[i] ?? []).map((l) => ({
+ <replaced with: ["Stryker was here"]>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `learn.service.ts:103` in `for`, not just truthiness.

**Cluster 32** (lines 117–124 — `for()`): 1 mutant surviving — BlockStatement×1

Sample mutation:
```diff
- ): Promise<{ completedAt: ISODateString }> {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `learn.service.ts:117` in `for` — verify state change, mock invocation, or returned value.

**Cluster 33** (lines 131–133 — `for()`): 1 mutant surviving — BlockStatement×1

Sample mutation:
```diff
- ): Promise<{ lastWatchedSeconds: number }> {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `learn.service.ts:131` in `for` — verify state change, mock invocation, or returned value.

**Cluster 34** (lines 143 — `for()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- const row = enrolment.progress.find((p) => p.lessonId === lesson.id);
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `learn.service.ts:143` in `for` with assertions that distinguish the outcomes.

### `src/lib/video/video-storage.adapter.ts` — 6 surviving mutants

**Cluster 35** (lines 14–19): 3 mutants surviving — BlockStatement×2, StringLiteral×1

Sample mutation:
```diff
- try {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `video-storage.adapter.ts:14` — verify state change, mock invocation, or returned value.

**Cluster 36** (lines 59 — `signObjectUrl()`): 1 mutant surviving — ArrowFunction×1

Sample mutation:
```diff
- private runner: FfprobeRunner = (binary, args) => promisifiedExecFile(binary, args);
+ <replaced with: () => undefined>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing. The function is called but its effect isn't asserted.

_Recommended test._ Add an assertion on the side effect of the block/function at `video-storage.adapter.ts:59` in `signObjectUrl` — verify state change, mock invocation, or returned value.

**Cluster 37** (lines 98 — `Number()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- const size = typeof meta.size === 'string' ? Number(meta.size) : (meta.size as number);
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `video-storage.adapter.ts:98` in `Number` with assertions that distinguish the outcomes.

**Cluster 38** (lines 158 — `if()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- durationSec: Number(parsed.format?.duration ?? '0'),
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video-storage.adapter.ts:158` in `if`. If it's a log message, classify as equivalent.

### `src/lib/video/video.repository.ts` — 6 surviving mutants

**Cluster 39** (lines 37 — `lessonByIdQuery()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- return this.db.collectionGroup('lessons').where('id', '==', lid).limit(1);
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video.repository.ts:37` in `lessonByIdQuery`. If it's a log message, classify as equivalent.

**Cluster 40** (lines 52 — `getVideoByLesson()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- .where('lessonId', '==', lid)
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video.repository.ts:52` in `getVideoByLesson`. If it's a log message, classify as equivalent.

**Cluster 41** (lines 63 — `getVideoByLesson()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (unique.length === 0) return out;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `video.repository.ts:63` in `getVideoByLesson` with assertions that distinguish the outcomes.

**Cluster 42** (lines 163 — `if()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

Sample mutation:
```diff
- const targetState = args.outcome.kind === 'READY' ? 'READY' : 'FAILED';
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `video.repository.ts:163` in `if` with assertions that distinguish the outcomes.

**Cluster 43** (lines 201 — `deleteVideoAndDetach()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- const keyQ = this.db.collection('videoKeys').where('videoId', '==', vid).limit(1);
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video.repository.ts:201` in `deleteVideoAndDetach`. If it's a log message, classify as equivalent.

### `src/lib/video/transcoder/gcp-transcoder.adapter.ts` — 5 surviving mutants

**Cluster 44** (lines 48 — `submitJob()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- encryptions: cfg.encryptions?.map((e) => ({
+ <replaced with: cfg.encryptions.map>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `gcp-transcoder.adapter.ts:48` in `submitJob`.

**Cluster 45** (lines 55–65 — `submitJob()`): 3 mutants surviving — StringLiteral×1, OptionalChaining×2

Sample mutation:
```diff
- return { jobName: job.name ?? '' };
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `gcp-transcoder.adapter.ts:55` in `submitJob`.

**Cluster 46** (lines 85 — `if()`): 1 mutant surviving — MethodExpression×1

Sample mutation:
```diff
- reason: (job.error?.message ?? 'unknown').slice(0, 500),
+ <replaced with: job.error?.message ?? 'unknown'>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing. The function is called but its effect isn't asserted.

_Recommended test._ Add an assertion on the side effect of the block/function at `gcp-transcoder.adapter.ts:85` in `if` — verify state change, mock invocation, or returned value.

### `src/lib/video/webhook/fake-transcoder.controller.ts` — 5 surviving mutants

**Cluster 47** (lines 20–23 — `envelope()`): 2 mutants surviving — StringLiteral×2

Sample mutation:
```diff
- messageId: `fake-${Date.now()}`,
+ <replaced with: ``>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `fake-transcoder.controller.ts:20` in `envelope`. If it's a log message, classify as equivalent.

**Cluster 48** (lines 47 — `envelope()`): 2 mutants surviving — ObjectLiteral×1, StringLiteral×1

Sample mutation:
```diff
- output: { uri: `gs://fake-out/videos/${vid}/hls/` },
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `fake-transcoder.controller.ts:47` in `envelope`, not just truthiness.

**Cluster 49** (lines 65 — `envelope()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- labels: { videoid: vid },
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `fake-transcoder.controller.ts:65` in `envelope`, not just truthiness.

### `src/lib/cover/errors/cover.exception.ts` — 4 surviving mutants

**Cluster 50** (lines 11): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- this.name = 'CoverException';
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `cover.exception.ts:11`. If it's a log message, classify as equivalent.

**Cluster 51** (lines 28 — `constructor()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- super('COVER_DECODE_FAILED', 'Cover image could not be decoded.', 400);
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `cover.exception.ts:28` in `constructor`. If it's a log message, classify as equivalent.

**Cluster 52** (lines 34 — `constructor()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- super('COVER_TOO_LARGE', 'Cover image exceeds the 10 MB limit.', 413);
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `cover.exception.ts:34` in `constructor`. If it's a log message, classify as equivalent.

**Cluster 53** (lines 42 — `constructor()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- 'Cover image must be JPEG or PNG.',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `cover.exception.ts:42` in `constructor`. If it's a log message, classify as equivalent.

### `src/lib/learn/guards/lesson-enrollment.guard.ts` — 4 surviving mutants

**Cluster 54** (lines 28 — `canActivate()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (!course) throw new LessonNotFoundException();
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `lesson-enrollment.guard.ts:28` in `canActivate` with assertions that distinguish the outcomes.

**Cluster 55** (lines 34–36 — `if()`): 3 mutants surviving — ConditionalExpression×1, OptionalChaining×1, BlockStatement×1

Sample mutation:
```diff
- if (course.instructorId === req.user?.uid) {
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `lesson-enrollment.guard.ts:34` in `if` with assertions that distinguish the outcomes.

### `src/lib/video/transcoder/fake-transcoder.adapter.ts` — 4 surviving mutants

**Cluster 56** (lines 37 — `submitJob()`): 2 mutants surviving — BooleanLiteral×1, ObjectLiteral×1

Sample mutation:
```diff
- this.jobs.set(jobName, { input, cancelled: false });
+ <replaced with: true>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `fake-transcoder.adapter.ts:37` in `submitJob` with assertions that distinguish the outcomes.

**Cluster 57** (lines 43–48 — `parseEvent()`): 2 mutants surviving — OptionalChaining×2

Sample mutation:
```diff
- const dataB64 = envelope.message?.data;
+ <replaced with: envelope.message.data>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `fake-transcoder.adapter.ts:43` in `parseEvent`.

### `src/lib/materials/materials.service.ts` — 3 surviving mutants

**Cluster 58** (lines 43 — `toLowerCase()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

Sample mutation:
```diff
- const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `materials.service.ts:43` in `toLowerCase` with assertions that distinguish the outcomes.

**Cluster 59** (lines 179–182 — `verifyUploadedObject()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- const head = await this.storage.headObject({
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `materials.service.ts:179` in `verifyUploadedObject`, not just truthiness.

### `src/lib/video/video.config.ts` — 2 surviving mutants

**Cluster 60** (lines 1): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- export const VIDEO_CONFIG = Symbol.for('learnwren.api-video.config');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video.config.ts:1`. If it's a log message, classify as equivalent.

**Cluster 61** (lines 95 — `if()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- const implRaw = env['LEARNWREN_VIDEO_TRANSCODER'] ?? (isProduction ? 'gcp' : 'fake');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video.config.ts:95` in `if`. If it's a log message, classify as equivalent.

### `src/lib/cover/cover.controller.ts` — 2 surviving mutants

**Cluster 62** (lines 26): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- const ALLOWED_MIME = new Set(['image/jpeg', 'image/png']);
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `cover.controller.ts:26`. If it's a log message, classify as equivalent.

**Cluster 63** (lines 47 — `constructor()`): 1 mutant surviving — EqualityOperator×1

Sample mutation:
```diff
- if (file.size > MAX_BYTES) throw new CoverTooLargeException();
+ <replaced with: file.size >= MAX_BYTES>
```

_Diagnosis._ An equality / inequality operator could be flipped (`==`↔`!=`, `===`↔`!==`) and tests still pass. Test both equal and unequal inputs at the boundary.

_Recommended test._ Add a boundary test that exercises the equal / off-by-one case at `cover.controller.ts:47` in `constructor`.

### `src/lib/learn/guards/lesson-enrollment-or-owner.guard.ts` — 2 surviving mutants

**Cluster 64** (lines 23 — `canActivate()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (!course) throw new LessonNotFoundException();
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `lesson-enrollment-or-owner.guard.ts:23` in `canActivate` with assertions that distinguish the outcomes.

**Cluster 65** (lines 43 — `extractLessonScope()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- return { cid, lid };
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `lesson-enrollment-or-owner.guard.ts:43` in `extractLessonScope`, not just truthiness.

### `src/lib/materials/webhook/fake-materials.controller.ts` — 2 surviving mutants

**Cluster 66** (lines 21 — `collectStream()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- req.on('error', reject);
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `fake-materials.controller.ts:21` in `collectStream`. If it's a log message, classify as equivalent.

**Cluster 67** (lines 27 — `sanitizeFilename()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- return name.replace(/["\\\r\n]/g, '_');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `fake-materials.controller.ts:27` in `sanitizeFilename`. If it's a log message, classify as equivalent.

### `src/lib/publish/publish-eligibility.ts` — 2 surviving mutants

**Cluster 68** (lines 77–79 — `if()`): 2 mutants surviving — ConditionalExpression×1, BlockStatement×1

Sample mutation:
```diff
- if (!lesson.videoId) {
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `publish-eligibility.ts:77` in `if` with assertions that distinguish the outcomes.

### `src/lib/video/playback/enrollment-or-owner.guard.ts` — 2 surviving mutants

**Cluster 69** (lines 26 — `canActivate()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (!vid) throw new VideoNotFoundException();
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `enrollment-or-owner.guard.ts:26` in `canActivate` with assertions that distinguish the outcomes.

**Cluster 70** (lines 45 — `if()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- if (course?.status === 'PUBLISHED') {
+ <replaced with: course.status>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `enrollment-or-owner.guard.ts:45` in `if`.

### `src/lib/cover/fake-cover-storage.adapter.ts` — 1 surviving mutant

**Cluster 71** (lines 38–40 — `clear()`): 1 mutant surviving — BlockStatement×1

Sample mutation:
```diff
- clear(): void {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `fake-cover-storage.adapter.ts:38` in `clear` — verify state change, mock invocation, or returned value.

### `src/lib/catalog/parse-course-id.pipe.ts` — 1 surviving mutant

**Cluster 72** (lines 24 — `transform()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (typeof value !== 'string' || !ParseCourseIdPipe.PATTERN.test(value)) {
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `parse-course-id.pipe.ts:24` in `transform` with assertions that distinguish the outcomes.

### `src/lib/cover/cover.config.ts` — 1 surviving mutant

**Cluster 73** (lines 1): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- export const COVER_CONFIG = Symbol.for('learnwren.api-courses.cover.config');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `cover.config.ts:1`. If it's a log message, classify as equivalent.

### `src/lib/enrollment/enrollment.service.ts` — 1 surviving mutant

**Cluster 74** (lines 43 — `unenroll()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- return { enrollment, isOwner: course?.instructorId === userId };
+ <replaced with: course.instructorId>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `enrollment.service.ts:43` in `unenroll`.

### `src/lib/learn/errors/learn.exception.ts` — 1 surviving mutant

**Cluster 75** (lines 11): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- this.name = 'LearnException';
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `learn.exception.ts:11`. If it's a log message, classify as equivalent.

### `src/lib/learn/guards/find-lesson-in-course.ts` — 1 surviving mutant

**Cluster 76** (lines 17 — `for()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (lesson) return lesson;
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `find-lesson-in-course.ts:17` in `for` with assertions that distinguish the outcomes.

### `src/lib/materials/errors/material.exception.ts` — 1 surviving mutant

**Cluster 77** (lines 11): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- this.name = 'MaterialException';
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `material.exception.ts:11`. If it's a log message, classify as equivalent.

### `src/lib/materials/material-access.guard.ts` — 1 surviving mutant

**Cluster 78** (lines 42 — `if()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- if (course?.status === 'PUBLISHED') {
+ <replaced with: course.status>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `material-access.guard.ts:42` in `if`.

### `src/lib/materials/materials-storage.adapter.ts` — 1 surviving mutant

**Cluster 79** (lines 84 — `Number()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- const size = typeof meta.size === 'string' ? Number(meta.size) : (meta.size as number);
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `materials-storage.adapter.ts:84` in `Number` with assertions that distinguish the outcomes.

### `src/lib/materials/materials.config.ts` — 1 surviving mutant

**Cluster 80** (lines 1): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- export const MATERIALS_CONFIG = Symbol.for('learnwren.api-courses.materials.config');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `materials.config.ts:1`. If it's a log message, classify as equivalent.

### `src/lib/materials/materials.repository.ts` — 1 surviving mutant

**Cluster 81** (lines 22 — `listByLesson()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- .where('lessonId', '==', lessonId)
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `materials.repository.ts:22` in `listByLesson`. If it's a log message, classify as equivalent.

## Equivalent-mutant candidates (excluded from adjusted score)

15 mutants flagged as likely equivalent — these are excluded from the **adjusted** score above. Reviewer should confirm each before treating the adjusted score as authoritative:

| File:line | Mutator | Reason |
|-----------|---------|--------|
| `src/lib/learn/learn.service.ts:23` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/learn/learn.service.ts:50` | BlockStatement | Catch block contains only logging — emptying it preserves the silent-swallow behavior. |
| `src/lib/learn/learn.service.ts:52` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/video/video.service.ts:77` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/video/video.service.ts:191` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/video/video.service.ts:247` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/video/video.service.ts:310` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/cover/cover.exception-filter.ts:9` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/learn/learn.exception-filter.ts:10` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/materials/materials.exception-filter.ts:11` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/video/video.exception-filter.ts:13` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/video/webhook/transcoder-events.controller.ts:17` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/video/webhook/transcoder-events.controller.ts:30` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/video/webhook/transcoder-events.controller.ts:42` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/video/webhook/transcoder-events.controller.ts:46` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.api-courses.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.
