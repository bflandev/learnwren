# Mutation Test Report

> Generated 2026-05-23T00:55:02.741Z

Each lib reports two scores. The **adjusted** score (bold) is what the team operates against — it excludes equivalent-mutant candidates the heuristic identifies (logger strings, Logger names, catch-only-logging blocks). The **raw** score is what Stryker emits directly, kept so regressions in real survivors stay visible.

## Headline

| Lib | Raw score | Adjusted¹ | Band | Verdict |
|-----|-----------|-----------|------|---------|
| `api-auth` | 89.25% | **96.96%** | auth / billing / auth-adjacent — 90%+ target | ✅ |
| `api-courses` | 89.94% | **90.53%** | core domain logic — 75–85% target | ✅ |
| `web-catalog` | 76.52% | **76.52%** | web glue/orchestration — 50–70% target | ✅ |
| `web-enrollment` | 81.32% | **81.32%** | web glue/orchestration — 50–70% target | ✅ |
| `web-ui` | 72.73% | **72.73%** | web glue/orchestration — 50–70% target | ✅ |

¹ *Adjusted score* excludes equivalent-mutant candidates (logger strings, Logger names, catch blocks with only logging) flagged by the report's heuristic. The raw score is preserved so regressions stay visible.

---

# `libs/api-auth`

**Raw score: 89.25%** · **Adjusted score: 96.96%** ✅ (killed=415, survived=45, no-cov=5, ignored=0, equivalents=37). Covered-only: 90.22%.

Target band: auth / billing / auth-adjacent — 90%+ target.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/firebase-session.guard.ts` | 83.3% | 15 | 3 | 0 |
| `src/lib/firebase-auth-rest-client.ts` | 83.8% | 31 | 5 | 1 |
| `src/lib/auth.service.ts` | 85.2% | 202 | 33 | 2 |
| `src/lib/auth.exception-filter.ts` | 86.7% | 13 | 2 | 0 |
| `src/lib/auth-attempts.repository.ts` | 95.3% | 81 | 2 | 2 |
| `src/lib/auth.controller.ts` | 100.0% | 19 | 0 | 0 |
| `src/lib/instructor-role.guard.ts` | 100.0% | 8 | 0 | 0 |
| `src/lib/password-policy.service.ts` | 100.0% | 41 | 0 | 0 |
| `src/lib/session-cookie.helper.ts` | 100.0% | 5 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/auth.service.ts` — 5 surviving mutants

**Cluster 1** (lines 277 — `continueUrl()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- const base = process.env['LEARNWREN_PUBLIC_URL'] ?? 'http://localhost:4200';
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `auth.service.ts:277` in `continueUrl`. If it's a log message, classify as equivalent.

**Cluster 2** (lines 286 — `logoutSideEffects()`): 1 mutant surviving — BooleanLiteral×1

Sample mutation:
```diff
- const decoded = await this.auth.verifySessionCookie(sessionCookie, true);
+ <replaced with: false>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.service.ts:286` in `logoutSideEffects` with assertions that distinguish the outcomes.

**Cluster 3** (lines 325 — `sleepPastNextSecond()`): 1 mutant surviving — ArithmeticOperator×1

Sample mutation:
```diff
- const waitMs = 1000 - (Date.now() % 1000) + LOGOUT_REVOKE_MARGIN_MS;
+ <replaced with: 1000 + Date.now() % 1000>
```

_Diagnosis._ An arithmetic operator could be replaced. Pin the math with a deterministic input/output pair.

_Recommended test._ Inspect `auth.service.ts:325` in `sleepPastNextSecond` and add an assertion that distinguishes the original from the surviving mutation.

**Cluster 4** (lines 462 — `isFirebaseError()`): 2 mutants surviving — ConditionalExpression×2

Sample mutation:
```diff
- return typeof err === 'object' && err !== null && 'code' in err;
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.service.ts:462` in `isFirebaseError` with assertions that distinguish the outcomes.

### `src/lib/auth-attempts.repository.ts` — 4 surviving mutants

**Cluster 5** (lines 102–105 — `redeemUnlockToken()`): 4 mutants surviving — ConditionalExpression×2, ObjectLiteral×1, StringLiteral×1

Sample mutation:
```diff
- if (query.empty) return { status: 'invalid' };
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth-attempts.repository.ts:102` in `redeemUnlockToken` with assertions that distinguish the outcomes.

### `src/lib/firebase-auth-rest-client.ts` — 4 surviving mutants

**Cluster 6** (lines 59 — `upstreamCode()`): 4 mutants surviving — StringLiteral×2, MethodExpression×1, OptionalChaining×1

Sample mutation:
```diff
- const upstreamCode = (errorBody?.error?.message ?? '').split(' ')[0]?.trim() ?? '';
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `firebase-auth-rest-client.ts:59` in `upstreamCode`. If it's a log message, classify as equivalent.

## Equivalent-mutant candidates (excluded from adjusted score)

37 mutants flagged as likely equivalent — these are excluded from the **adjusted** score above. Reviewer should confirm each before treating the adjusted score as authoritative:

| File:line | Mutator | Reason |
|-----------|---------|--------|
| `src/lib/auth.service.ts:468` | BlockStatement | Catch block contains only logging — emptying it preserves the silent-swallow behavior. |
| `src/lib/auth.service.ts:469` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:81` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/auth.service.ts:118` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:118` | LogicalOperator | Operator/expression inside a logger call — affects log content only, not behavior. |
| `src/lib/auth.service.ts:118` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:136` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:144` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:156` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:170` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:175` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:208` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:213` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:208` | MethodExpression | Operator/expression inside a logger call — affects log content only, not behavior. |
| `src/lib/auth.service.ts:224` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:234` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:239` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:261` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:270` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:290` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:305` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:310` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:335` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:379` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:382` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:409` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:412` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:422` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:457` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:454` | BlockStatement | Catch block contains only logging — emptying it preserves the silent-swallow behavior. |
| `src/lib/firebase-auth-rest-client.ts:31` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/firebase-auth-rest-client.ts:66` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.exception-filter.ts:33` | LogicalOperator | Operator/expression inside a logger call — affects log content only, not behavior. |
| `src/lib/auth.exception-filter.ts:16` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/firebase-session.guard.ts:12` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/firebase-session.guard.ts:23` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/firebase-session.guard.ts:37` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |

---

# `libs/api-courses`

**Raw score: 89.94%** · **Adjusted score: 90.53%** ✅ (killed=1654, survived=139, no-cov=46, ignored=0, equivalents=12). Covered-only: 92.25%.

Target band: core domain logic — 75–85% target.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/video/video-storage.adapter.ts` | 50.8% | 62 | 30 | 30 |
| `src/lib/video/video.exception-filter.ts` | 66.7% | 34 | 15 | 2 |
| `src/lib/video/webhook/fake-transcoder.controller.ts` | 69.6% | 16 | 7 | 0 |
| `src/lib/video/webhook/transcoder-events.controller.ts` | 70.6% | 12 | 5 | 0 |
| `src/lib/video/transcoder/fake-transcoder.adapter.ts` | 70.8% | 34 | 9 | 5 |
| `src/lib/video/transcoder/gcp-transcoder.adapter.ts` | 76.3% | 45 | 9 | 5 |
| `src/lib/video/video.service.ts` | 83.3% | 140 | 27 | 1 |
| `src/lib/catalog/catalog.service.ts` | 91.6% | 98 | 7 | 2 |
| `src/lib/materials/webhook/fake-materials.controller.ts` | 92.3% | 24 | 2 | 0 |
| `src/lib/materials/materials.repository.ts` | 92.9% | 13 | 1 | 0 |
| `src/lib/enrollment/enrollment.repository.ts` | 93.3% | 56 | 4 | 0 |
| `src/lib/enrollment/enrollment.service.ts` | 93.3% | 14 | 1 | 0 |
| `src/lib/materials/materials.exception-filter.ts` | 93.3% | 42 | 3 | 0 |
| `src/lib/video/video.repository.ts` | 94.5% | 103 | 6 | 0 |
| `src/lib/materials/materials.service.ts` | 94.5% | 69 | 4 | 0 |
| `src/lib/materials/errors/material.exception.ts` | 95.0% | 19 | 1 | 0 |
| `src/lib/video/playback/enrollment-or-owner.guard.ts` | 95.5% | 21 | 1 | 0 |
| `src/lib/publish/publish-eligibility.ts` | 96.1% | 49 | 2 | 0 |
| `src/lib/video/webhook/pubsub-push.guard.ts` | 96.5% | 55 | 2 | 0 |
| `src/lib/video/video.config.ts` | 97.9% | 92 | 1 | 1 |
| `src/lib/materials/materials-storage.adapter.ts` | 98.0% | 48 | 1 | 0 |
| `src/lib/materials/materials.config.ts` | 98.2% | 54 | 1 | 0 |
| `src/lib/catalog/catalog.controller.ts` | 100.0% | 3 | 0 | 0 |
| `src/lib/catalog/instructor-directory.ts` | 100.0% | 8 | 0 | 0 |
| `src/lib/course-owner.guard.ts` | 100.0% | 13 | 0 | 0 |
| `src/lib/courses.controller.ts` | 100.0% | 24 | 0 | 0 |
| `src/lib/courses.service.ts` | 100.0% | 71 | 0 | 0 |
| `src/lib/enrollment/enrollment.controller.ts` | 100.0% | 3 | 0 | 0 |
| `src/lib/errors/courses.exception.ts` | 100.0% | 36 | 0 | 0 |
| `src/lib/materials/material-access.guard.ts` | 100.0% | 18 | 0 | 0 |
| `src/lib/materials/material-owner.guard.ts` | 100.0% | 13 | 0 | 0 |
| `src/lib/materials/materials.controller.ts` | 100.0% | 14 | 0 | 0 |
| `src/lib/publish/publish.service.ts` | 100.0% | 99 | 0 | 0 |
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

### `src/lib/video/video-storage.adapter.ts` — 60 surviving mutants

**Cluster 1** (lines 13–18): 3 mutants surviving — BlockStatement×2, StringLiteral×1

Sample mutation:
```diff
- try {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `video-storage.adapter.ts:13` — verify state change, mock invocation, or returned value.

**Cluster 2** (lines 53 — `signObjectUrl()`): 1 mutant surviving — ArrowFunction×1

Sample mutation:
```diff
- private runner: FfprobeRunner = (binary, args) => promisifiedExecFile(binary, args);
+ <replaced with: () => undefined>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing. The function is called but its effect isn't asserted.

_Recommended test._ Add an assertion on the side effect of the block/function at `video-storage.adapter.ts:53` in `signObjectUrl` — verify state change, mock invocation, or returned value.

**Cluster 3** (lines 70–107 — `__setRunner()`): 27 mutants surviving — BlockStatement×7, ObjectLiteral×5, StringLiteral×2, ArithmeticOperator×4, ConditionalExpression×6, EqualityOperator×3

Sample mutation:
```diff
- }): Promise<ResumableSession> {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `video-storage.adapter.ts:70` in `__setRunner` — verify state change, mock invocation, or returned value.

**Cluster 4** (lines 121–141 — `probeSource()`): 14 mutants surviving — ArithmeticOperator×1, StringLiteral×8, ArrayDeclaration×1, OptionalChaining×2, ConditionalExpression×2

Sample mutation:
```diff
- expires: Date.now() + 60_000,
+ <replaced with: Date.now() - 60_000>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video-storage.adapter.ts:121` in `probeSource`. If it's a log message, classify as equivalent.

**Cluster 5** (lines 171–195 — `fakeReadManifest()`): 15 mutants surviving — StringLiteral×15

Sample mutation:
```diff
- '#EXT-X-VERSION:6',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video-storage.adapter.ts:171` in `fakeReadManifest`. If it's a log message, classify as equivalent.

### `src/lib/video/video.service.ts` — 23 surviving mutants

**Cluster 6** (lines 47–48): 2 mutants surviving — StringLiteral×2

Sample mutation:
```diff
- 'UPLOADED',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video.service.ts:47`. If it's a log message, classify as equivalent.

**Cluster 7** (lines 87 — `nowIso()`): 2 mutants surviving — ArrowFunction×2

Sample mutation:
```diff
- this.sleep = deps?.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
+ <replaced with: () => undefined>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing. The function is called but its effect isn't asserted.

_Recommended test._ Add an assertion on the side effect of the block/function at `video.service.ts:87` in `nowIso` — verify state change, mock invocation, or returned value.

**Cluster 8** (lines 136 — `completeUpload()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- const head = await this.storage.headObject({ bucket: v.source.bucket, path: v.source.path });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `video.service.ts:136` in `completeUpload`, not just truthiness.

**Cluster 9** (lines 148 — `if()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- probe = await this.storage.probeSource({ bucket: v.source.bucket, path: v.source.path });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `video.service.ts:148` in `if`, not just truthiness.

**Cluster 10** (lines 169–174 — `catch()`): 3 mutants surviving — LogicalOperator×1, StringLiteral×1, MethodExpression×1

Sample mutation:
```diff
- topic: this.cfg.transcoderTopic ?? '',
+ <replaced with: this.cfg.transcoderTopic && ''>
```

_Diagnosis._ `&&` / `||` swap survived: short-circuit semantics aren't exercised. Add a test for the partial case where one operand is true and the other false.

_Recommended test._ Add a test where one operand of the logical expression at `video.service.ts:169` in `catch` is true and the other is false.

**Cluster 11** (lines 193 — `if()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- let lastError = 'unknown';
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video.service.ts:193` in `if`. If it's a log message, classify as equivalent.

**Cluster 12** (lines 200 — `catch()`): 1 mutant surviving — ArithmeticOperator×1

Sample mutation:
```diff
- this.logger.warn(`submitJob attempt ${attempt + 1} failed: ${lastError}`);
+ <replaced with: attempt - 1>
```

_Diagnosis._ An arithmetic operator could be replaced. Pin the math with a deterministic input/output pair.

_Recommended test._ Inspect `video.service.ts:200` in `catch` and add an assertion that distinguishes the original from the surviving mutation.

**Cluster 13** (lines 235–240 — `if()`): 5 mutants surviving — ConditionalExpression×2, ArrowFunction×1, LogicalOperator×1, OptionalChaining×1

Sample mutation:
```diff
- if (v.state === 'TRANSCODING' && v.transcoderJobName) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `video.service.ts:235` in `if` with assertions that distinguish the outcomes.

**Cluster 14** (lines 255–258 — `if()`): 6 mutants surviving — ConditionalExpression×3, LogicalOperator×2, OptionalChaining×1

Sample mutation:
```diff
- if (v.state === 'TRANSCODING' && v.transcoderJobName) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `video.service.ts:255` in `if` with assertions that distinguish the outcomes.

**Cluster 15** (lines 265 — `if()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- .deleteObject({ bucket: v.source.bucket, path: v.source.path })
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `video.service.ts:265` in `if`, not just truthiness.

### `src/lib/video/video.exception-filter.ts` — 15 surviving mutants

**Cluster 16** (lines 31 — `if()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (exception.details) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `video.exception-filter.ts:31` in `if` with assertions that distinguish the outcomes.

**Cluster 17** (lines 41 — `if()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

Sample mutation:
```diff
- (exception.name === 'AuthException' || exception.constructor.name === 'AuthException')
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `video.exception-filter.ts:41` in `if` with assertions that distinguish the outcomes.

**Cluster 18** (lines 51 — `if()`): 2 mutants surviving — ConditionalExpression×2

Sample mutation:
```diff
- if (err.details) body.error.details = err.details;
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `video.exception-filter.ts:51` in `if` with assertions that distinguish the outcomes.

**Cluster 19** (lines 61–67 — `if()`): 3 mutants surviving — ArrayDeclaration×2, StringLiteral×1

Sample mutation:
```diff
- ? [payload.message]
+ <replaced with: []>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `video.exception-filter.ts:61` in `if`, not just truthiness.

**Cluster 20** (lines 89–95 — `for()`): 7 mutants surviving — BlockStatement×1, StringLiteral×1, BooleanLiteral×1, ConditionalExpression×3, ArrayDeclaration×1

Sample mutation:
```diff
- for (const msg of messages) {
+ <replaced with: {}>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `video.exception-filter.ts:89` in `for` with assertions that distinguish the outcomes.

### `src/lib/video/transcoder/fake-transcoder.adapter.ts` — 14 surviving mutants

**Cluster 21** (lines 37 — `submitJob()`): 2 mutants surviving — ObjectLiteral×1, BooleanLiteral×1

Sample mutation:
```diff
- this.jobs.set(jobName, { input, cancelled: false });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `fake-transcoder.adapter.ts:37` in `submitJob`, not just truthiness.

**Cluster 22** (lines 43–50 — `parseEvent()`): 8 mutants surviving — OptionalChaining×2, StringLiteral×3, ConditionalExpression×2, LogicalOperator×1

Sample mutation:
```diff
- const dataB64 = envelope.message?.data;
+ <replaced with: envelope.message.data>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `fake-transcoder.adapter.ts:43` in `parseEvent`. If it's a log message, classify as equivalent.

**Cluster 23** (lines 61–62 — `if()`): 3 mutants surviving — ConditionalExpression×1, StringLiteral×1, OptionalChaining×1

Sample mutation:
```diff
- if (job.state === 'FAILED') {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `fake-transcoder.adapter.ts:61` in `if` with assertions that distinguish the outcomes.

**Cluster 24** (lines 70 — `if()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- throw new Error(`Unexpected job.state: ${String(job.state)}`);
+ <replaced with: ``>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `fake-transcoder.adapter.ts:70` in `if`. If it's a log message, classify as equivalent.

### `src/lib/video/transcoder/gcp-transcoder.adapter.ts` — 14 surviving mutants

**Cluster 25** (lines 48 — `submitJob()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- encryptions: cfg.encryptions?.map((e) => ({
+ <replaced with: cfg.encryptions.map>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `gcp-transcoder.adapter.ts:48` in `submitJob`.

**Cluster 26** (lines 55–70 — `submitJob()`): 8 mutants surviving — StringLiteral×3, OptionalChaining×2, ConditionalExpression×1, LogicalOperator×1, ObjectLiteral×1

Sample mutation:
```diff
- return { jobName: job.name ?? '' };
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `gcp-transcoder.adapter.ts:55` in `submitJob`. If it's a log message, classify as equivalent.

**Cluster 27** (lines 80–88 — `if()`): 5 mutants surviving — ConditionalExpression×1, StringLiteral×2, MethodExpression×1, OptionalChaining×1

Sample mutation:
```diff
- if (job.state === 'FAILED') {
+ <replaced with: true>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `gcp-transcoder.adapter.ts:80` in `if`. If it's a log message, classify as equivalent.

### `src/lib/catalog/catalog.service.ts` — 9 surviving mutants

**Cluster 28** (lines 42 — `if()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (query.category) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `catalog.service.ts:42` in `if` with assertions that distinguish the outcomes.

**Cluster 29** (lines 48–53 — `if()`): 2 mutants surviving — StringLiteral×1, MethodExpression×1

Sample mutation:
```diff
- courses = sortCourses(courses, query.sort ?? 'NEWEST');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `catalog.service.ts:48` in `if`. If it's a log message, classify as equivalent.

**Cluster 30** (lines 86 — `if()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- instructorDisplayName: names.get(course.instructorId) ?? 'Instructor',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `catalog.service.ts:86` in `if`. If it's a log message, classify as equivalent.

**Cluster 31** (lines 120–124 — `if()`): 4 mutants surviving — ConditionalExpression×2, ObjectLiteral×1, LogicalOperator×1

Sample mutation:
```diff
- if (sort === 'ALPHABETICAL') {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `catalog.service.ts:120` in `if` with assertions that distinguish the outcomes.

**Cluster 32** (lines 146 — `toSummary()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- instructorDisplayName: names.get(course.instructorId) ?? 'Instructor',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `catalog.service.ts:146` in `toSummary`. If it's a log message, classify as equivalent.

### `src/lib/video/webhook/fake-transcoder.controller.ts` — 7 surviving mutants

**Cluster 33** (lines 19–22 — `envelope()`): 2 mutants surviving — StringLiteral×2

Sample mutation:
```diff
- messageId: `fake-${Date.now()}`,
+ <replaced with: ``>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `fake-transcoder.controller.ts:19` in `envelope`. If it's a log message, classify as equivalent.

**Cluster 34** (lines 34–37 — `constructor()`): 3 mutants surviving — StringLiteral×2, ObjectLiteral×1

Sample mutation:
```diff
- name: `projects/fake/locations/fake/jobs/${vid}`,
+ <replaced with: ``>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `fake-transcoder.controller.ts:34` in `constructor`. If it's a log message, classify as equivalent.

**Cluster 35** (lines 52–54 — `constructor()`): 2 mutants surviving — StringLiteral×1, ObjectLiteral×1

Sample mutation:
```diff
- name: `projects/fake/locations/fake/jobs/${vid}`,
+ <replaced with: ``>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `fake-transcoder.controller.ts:52` in `constructor`. If it's a log message, classify as equivalent.

### `src/lib/video/video.repository.ts` — 6 surviving mutants

**Cluster 36** (lines 30 — `getVideoByLesson()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- .where('lessonId', '==', lid)
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video.repository.ts:30` in `getVideoByLesson`. If it's a log message, classify as equivalent.

**Cluster 37** (lines 59 — `updateVideo()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- const lessonQ = this.db.collectionGroup('lessons').where('id', '==', args.lid).limit(1);
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video.repository.ts:59` in `updateVideo`. If it's a log message, classify as equivalent.

**Cluster 38** (lines 130 — `if()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

Sample mutation:
```diff
- const targetState = args.outcome.kind === 'READY' ? 'READY' : 'FAILED';
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `video.repository.ts:130` in `if` with assertions that distinguish the outcomes.

**Cluster 39** (lines 168–172 — `deleteVideoAndDetach()`): 2 mutants surviving — StringLiteral×2

Sample mutation:
```diff
- const keyQ = this.db.collection('videoKeys').where('videoId', '==', vid).limit(1);
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video.repository.ts:168` in `deleteVideoAndDetach`. If it's a log message, classify as equivalent.

### `src/lib/enrollment/enrollment.repository.ts` — 4 surviving mutants

**Cluster 40** (lines 77 — `if()`): 2 mutants surviving — ObjectLiteral×1, StringLiteral×1

Sample mutation:
```diff
- t.update(enrollmentRef, { status: 'ACTIVE', withdrawnAt: null, updatedAt: now });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `enrollment.repository.ts:77` in `if`, not just truthiness.

**Cluster 41** (lines 119 — `if()`): 2 mutants surviving — MethodExpression×1, LogicalOperator×1

Sample mutation:
```diff
- const nextCount = Math.max(0, (course.enrollmentCount ?? 0) - 1);
+ <replaced with: Math.min(0, (course.enrollmentCount ?? 0) - 1)>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing. The function is called but its effect isn't asserted.

_Recommended test._ Add an assertion on the side effect of the block/function at `enrollment.repository.ts:119` in `if` — verify state change, mock invocation, or returned value.

### `src/lib/materials/materials.service.ts` — 4 surviving mutants

**Cluster 42** (lines 43 — `toLowerCase()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

Sample mutation:
```diff
- const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `materials.service.ts:43` in `toLowerCase` with assertions that distinguish the outcomes.

**Cluster 43** (lines 113–116 — `complete()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- const head = await this.storage.headObject({
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `materials.service.ts:113` in `complete`, not just truthiness.

**Cluster 44** (lines 173 — `for()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- .deleteObject({ bucket: m.storage.bucket, path: m.storage.path })
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `materials.service.ts:173` in `for`, not just truthiness.

### `src/lib/video/video.config.ts` — 2 surviving mutants

**Cluster 45** (lines 1): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- export const VIDEO_CONFIG = Symbol.for('learnwren.api-video.config');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video.config.ts:1`. If it's a log message, classify as equivalent.

**Cluster 46** (lines 79 — `if()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- const implRaw = env['LEARNWREN_VIDEO_TRANSCODER'] ?? (isProduction ? 'gcp' : 'fake');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video.config.ts:79` in `if`. If it's a log message, classify as equivalent.

### `src/lib/materials/materials.exception-filter.ts` — 2 surviving mutants

**Cluster 47** (lines 45 — `catch()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (err.details) body.error.details = err.details;
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `materials.exception-filter.ts:45` in `catch` with assertions that distinguish the outcomes.

**Cluster 48** (lines 56 — `if()`): 1 mutant surviving — ArrayDeclaration×1

Sample mutation:
```diff
- : [];
+ <replaced with: ["Stryker was here"]>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `materials.exception-filter.ts:56` in `if`, not just truthiness.

### `src/lib/materials/webhook/fake-materials.controller.ts` — 2 surviving mutants

**Cluster 49** (lines 18 — `collectStream()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- req.on('error', reject);
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `fake-materials.controller.ts:18` in `collectStream`. If it's a log message, classify as equivalent.

**Cluster 50** (lines 24 — `sanitizeFilename()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- return name.replace(/["\\\r\n]/g, '_');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `fake-materials.controller.ts:24` in `sanitizeFilename`. If it's a log message, classify as equivalent.

### `src/lib/publish/publish-eligibility.ts` — 2 surviving mutants

**Cluster 51** (lines 40–43 — `if()`): 2 mutants surviving — ConditionalExpression×1, BlockStatement×1

Sample mutation:
```diff
- if (!l.videoId) {
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `publish-eligibility.ts:40` in `if` with assertions that distinguish the outcomes.

### `src/lib/video/webhook/pubsub-push.guard.ts` — 2 surviving mutants

**Cluster 52** (lines 19 — `getPayload()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- export const ID_TOKEN_VERIFIER = Symbol.for('learnwren.api-video.idTokenVerifier');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `pubsub-push.guard.ts:19` in `getPayload`. If it's a log message, classify as equivalent.

**Cluster 53** (lines 53 — `if()`): 1 mutant surviving — EqualityOperator×1

Sample mutation:
```diff
- if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) {
+ <replaced with: payload.exp * 1000 <= Date.now()>
```

_Diagnosis._ An equality / inequality operator could be flipped (`==`↔`!=`, `===`↔`!==`) and tests still pass. Test both equal and unequal inputs at the boundary.

_Recommended test._ Add a boundary test that exercises the equal / off-by-one case at `pubsub-push.guard.ts:53` in `if`.

### `src/lib/enrollment/enrollment.service.ts` — 1 surviving mutant

**Cluster 54** (lines 43 — `unenroll()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- return { enrollment, isOwner: course?.instructorId === userId };
+ <replaced with: course.instructorId>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `enrollment.service.ts:43` in `unenroll`.

### `src/lib/materials/errors/material.exception.ts` — 1 surviving mutant

**Cluster 55** (lines 11): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- this.name = 'MaterialException';
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `material.exception.ts:11`. If it's a log message, classify as equivalent.

### `src/lib/materials/materials-storage.adapter.ts` — 1 surviving mutant

**Cluster 56** (lines 83 — `Number()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- const size = typeof meta.size === 'string' ? Number(meta.size) : (meta.size as number);
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `materials-storage.adapter.ts:83` in `Number` with assertions that distinguish the outcomes.

### `src/lib/materials/materials.config.ts` — 1 surviving mutant

**Cluster 57** (lines 1): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- export const MATERIALS_CONFIG = Symbol.for('learnwren.api-courses.materials.config');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `materials.config.ts:1`. If it's a log message, classify as equivalent.

### `src/lib/materials/materials.repository.ts` — 1 surviving mutant

**Cluster 58** (lines 22 — `listByLesson()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- .where('lessonId', '==', lessonId)
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `materials.repository.ts:22` in `listByLesson`. If it's a log message, classify as equivalent.

### `src/lib/video/playback/enrollment-or-owner.guard.ts` — 1 surviving mutant

**Cluster 59** (lines 24 — `canActivate()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (!vid) throw new VideoNotFoundException();
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `enrollment-or-owner.guard.ts:24` in `canActivate` with assertions that distinguish the outcomes.

### `src/lib/video/webhook/transcoder-events.controller.ts` — 1 surviving mutant

**Cluster 60** (lines 25 — `catch()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- res.status(200).json({ acked: true, reason: 'MALFORMED' });
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `transcoder-events.controller.ts:25` in `catch`. If it's a log message, classify as equivalent.

## Equivalent-mutant candidates (excluded from adjusted score)

12 mutants flagged as likely equivalent — these are excluded from the **adjusted** score above. Reviewer should confirm each before treating the adjusted score as authoritative:

| File:line | Mutator | Reason |
|-----------|---------|--------|
| `src/lib/video/video.exception-filter.ts:22` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/video/video.exception-filter.ts:75` | LogicalOperator | Operator/expression inside a logger call — affects log content only, not behavior. |
| `src/lib/video/video.service.ts:77` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/video/video.service.ts:150` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/video/video.service.ts:153` | MethodExpression | Operator/expression inside a logger call — affects log content only, not behavior. |
| `src/lib/video/video.service.ts:200` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/video/video.service.ts:237` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/materials/materials.exception-filter.ts:23` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/video/webhook/transcoder-events.controller.ts:11` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/video/webhook/transcoder-events.controller.ts:24` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/video/webhook/transcoder-events.controller.ts:36` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/video/webhook/transcoder-events.controller.ts:40` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |

---

# `libs/web-catalog`

**Raw score: 76.52%** · **Adjusted score: 76.52%** ✅ (killed=101, survived=31, no-cov=0, ignored=0, equivalents=0). Covered-only: 76.52%.

Target band: web glue/orchestration — 50–70% target.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/catalog-page/catalog-page.component.ts` | 55.6% | 20 | 16 | 0 |
| `src/lib/search-results-page/search-results-page.component.ts` | 78.6% | 22 | 6 | 0 |
| `src/lib/catalog.service.ts` | 79.2% | 19 | 5 | 0 |
| `src/lib/components/catalog-filter-bar/catalog-filter-bar.component.ts` | 85.7% | 6 | 1 | 0 |
| `src/lib/course-detail-page/course-detail-page.component.ts` | 91.7% | 22 | 2 | 0 |
| `src/lib/components/course-search-bar/course-search-bar.component.ts` | 92.3% | 12 | 1 | 0 |

## Survivor clusters — gaps to close

### `src/lib/catalog-page/catalog-page.component.ts` — 16 surviving mutants

**Cluster 1** (lines 32–36): 3 mutants surviving — BooleanLiteral×2, StringLiteral×1

Sample mutation:
```diff
- readonly error = signal(false);
+ <replaced with: true>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `catalog-page.component.ts:32` with assertions that distinguish the outcomes.

**Cluster 2** (lines 46–58 — `difficulty()`): 11 mutants surviving — LogicalOperator×3, StringLiteral×2, ConditionalExpression×4, EqualityOperator×1, ObjectLiteral×1

Sample mutation:
```diff
- const difficulty = (params.get('difficulty') as CourseDifficulty | null) ?? undefined;
+ <replaced with: params.get('difficulty') as CourseDifficulty | null && undefined>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `catalog-page.component.ts:46` in `difficulty` with assertions that distinguish the outcomes.

**Cluster 3** (lines 68 — `onFilterChange()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- queryParamsHandling: 'merge',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `catalog-page.component.ts:68` in `onFilterChange`. If it's a log message, classify as equivalent.

**Cluster 4** (lines 76 — `goToPage()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- queryParamsHandling: 'merge',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `catalog-page.component.ts:76` in `goToPage`. If it's a log message, classify as equivalent.

### `src/lib/search-results-page/search-results-page.component.ts` — 6 surviving mutants

**Cluster 5** (lines 22–24): 2 mutants surviving — StringLiteral×1, BooleanLiteral×1

Sample mutation:
```diff
- readonly query = signal('');
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `search-results-page.component.ts:22`. If it's a log message, classify as equivalent.

**Cluster 6** (lines 38 — `if()`): 4 mutants surviving — ConditionalExpression×2, LogicalOperator×1, StringLiteral×1

Sample mutation:
```diff
- const page = Number(params.get('page')) || 1;
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `search-results-page.component.ts:38` in `if` with assertions that distinguish the outcomes.

### `src/lib/catalog.service.ts` — 5 surviving mutants

**Cluster 7** (lines 26–29 — `getCatalogue()`): 4 mutants surviving — ConditionalExpression×4

Sample mutation:
```diff
- if (params.page) httpParams = httpParams.set('page', params.page);
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `catalog.service.ts:26` in `getCatalogue` with assertions that distinguish the outcomes.

**Cluster 8** (lines 37 — `search()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (page) httpParams = httpParams.set('page', page);
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `catalog.service.ts:37` in `search` with assertions that distinguish the outcomes.

### `src/lib/course-detail-page/course-detail-page.component.ts` — 2 surviving mutants

**Cluster 9** (lines 25–26): 2 mutants surviving — BooleanLiteral×2

Sample mutation:
```diff
- readonly notFound = signal(false);
+ <replaced with: true>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `course-detail-page.component.ts:25` with assertions that distinguish the outcomes.

### `src/lib/components/catalog-filter-bar/catalog-filter-bar.component.ts` — 1 surviving mutant

**Cluster 10** (lines 27): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- readonly sort = input<CatalogSort>('NEWEST');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `catalog-filter-bar.component.ts:27`. If it's a log message, classify as equivalent.

### `src/lib/components/course-search-bar/course-search-bar.component.ts` — 1 surviving mutant

**Cluster 11** (lines 16): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- readonly query = signal('');
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `course-search-bar.component.ts:16`. If it's a log message, classify as equivalent.

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

---

# `libs/web-enrollment`

**Raw score: 81.32%** · **Adjusted score: 81.32%** ✅ (killed=74, survived=11, no-cov=6, ignored=0, equivalents=0). Covered-only: 87.06%.

Target band: web glue/orchestration — 50–70% target.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/course-enrollment-panel/course-enrollment-panel.component.ts` | 79.8% | 67 | 11 | 6 |
| `src/lib/enrollment.service.ts` | 100.0% | 7 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/course-enrollment-panel/course-enrollment-panel.component.ts` — 17 surviving mutants

**Cluster 1** (lines 34–35): 2 mutants surviving — StringLiteral×1, BooleanLiteral×1

Sample mutation:
```diff
- readonly state = signal<PanelState>('LOADING');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `course-enrollment-panel.component.ts:34`. If it's a log message, classify as equivalent.

**Cluster 2** (lines 63 — `if()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (this.state() === 'ENROLLED') this.clearEnrollParam();
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `course-enrollment-panel.component.ts:63` in `if` with assertions that distinguish the outcomes.

**Cluster 3** (lines 80 — `enroll()`): 1 mutant surviving — BooleanLiteral×1

Sample mutation:
```diff
- this.busy.set(true);
+ <replaced with: false>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `course-enrollment-panel.component.ts:80` in `enroll` with assertions that distinguish the outcomes.

**Cluster 4** (lines 94–96 — `catch()`): 2 mutants surviving — BlockStatement×1, BooleanLiteral×1

Sample mutation:
```diff
- } finally {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `course-enrollment-panel.component.ts:94` in `catch` — verify state change, mock invocation, or returned value.

**Cluster 5** (lines 104–109 — `cancelConfirm()`): 3 mutants surviving — BlockStatement×1, BooleanLiteral×2

Sample mutation:
```diff
- cancelConfirm(): void {
+ <replaced with: {}>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `course-enrollment-panel.component.ts:104` in `cancelConfirm` with assertions that distinguish the outcomes.

**Cluster 6** (lines 115–125 — `confirmLeave()`): 6 mutants surviving — BlockStatement×3, StringLiteral×2, BooleanLiteral×1

Sample mutation:
```diff
- } catch {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `course-enrollment-panel.component.ts:115` in `confirmLeave` — verify state change, mock invocation, or returned value.

**Cluster 7** (lines 131 — `clearEnrollParam()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- queryParamsHandling: 'merge',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `course-enrollment-panel.component.ts:131` in `clearEnrollParam`. If it's a log message, classify as equivalent.

**Cluster 8** (lines 137 — `errorCode()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- return (err.error as { error?: { code?: string } } | null)?.error?.code;
+ <replaced with: (err.error as {
  error?: {
    code?: string;
  };
} | null).error>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `course-enrollment-panel.component.ts:137` in `errorCode`.

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

---

# `libs/web-ui`

**Raw score: 72.73%** · **Adjusted score: 72.73%** ✅ (killed=40, survived=10, no-cov=5, ignored=0, equivalents=0). Covered-only: 80.00%.

Target band: web glue/orchestration — 50–70% target.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/cover/lw-cover.component.ts` | 33.3% | 1 | 2 | 0 |
| `src/lib/pill/lw-pill.component.ts` | 50.0% | 8 | 4 | 4 |
| `src/lib/theme/theme.service.ts` | 84.4% | 27 | 4 | 1 |
| `src/lib/progress/lw-progress.component.ts` | 100.0% | 4 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/pill/lw-pill.component.ts` — 8 surviving mutants

**Cluster 1** (lines 18): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- readonly tone = input<LwPillTone>('default');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `lw-pill.component.ts:18`. If it's a log message, classify as equivalent.

**Cluster 2** (lines 24–31): 7 mutants surviving — ConditionalExpression×3, StringLiteral×4

Sample mutation:
```diff
- case 'good':
+ <replaced with: case 'good':>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `lw-pill.component.ts:24`. If it's a log message, classify as equivalent.

### `src/lib/theme/theme.service.ts` — 5 surviving mutants

**Cluster 3** (lines 18 — `toggle()`): 2 mutants surviving — StringLiteral×1, ConditionalExpression×1

Sample mutation:
```diff
- this.set(this.themeSignal() === 'dark' ? 'light' : 'dark');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `theme.service.ts:18` in `toggle`. If it's a log message, classify as equivalent.

**Cluster 4** (lines 29 — `readInitial()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

Sample mutation:
```diff
- return stored === 'light' || stored === 'dark' ? stored : 'dark';
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `theme.service.ts:29` in `readInitial` with assertions that distinguish the outcomes.

**Cluster 5** (lines 35 — `apply()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- el.classList.toggle('lw-theme-light', theme === 'light');
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `theme.service.ts:35` in `apply` with assertions that distinguish the outcomes.

### `src/lib/cover/lw-cover.component.ts` — 2 surviving mutants

**Cluster 6** (lines 23–24): 2 mutants surviving — StringLiteral×2

Sample mutation:
```diff
- readonly tone = input<LwCoverTone>('ink');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `lw-cover.component.ts:23`. If it's a log message, classify as equivalent.

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

---

## Caveats

- **Scope is per-lib Stryker config.** Each `stryker.<lib>.config.mjs` controls what gets mutated. Excluded paths (DTOs, modules, barrel exports, type-only files) are listed there.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line. Tests that exercise the line via dynamic dispatch may be missed.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes — CRAP's coverage data should agree these are gaps.
- **Equivalent classification is heuristic.** The "candidates" lists per lib flag strings inside logger calls, Logger names, and catch-only-logging blocks. Review each before treating the adjusted score as authoritative. To make a candidate permanent, either add a `// Stryker disable next-line all` comment above the line in source, or accept the heuristic and move on.
- **Test quality is real but bounded.** A surviving mutant means an assertion is missing for the *code as written*. If the code is wrong and tests pin the wrong behavior, mutation testing won't catch it.
