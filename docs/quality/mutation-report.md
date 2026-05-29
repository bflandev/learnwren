# Mutation Test Report

> Generated 2026-05-29T07:15:01.893Z

Each lib reports two scores. The **adjusted** score (bold) is what the team operates against — it excludes equivalent-mutant candidates the heuristic identifies (logger strings, Logger names, catch-only-logging blocks). The **raw** score is what Stryker emits directly, kept so regressions in real survivors stay visible.

## Headline

| Lib | Raw score | Adjusted¹ | Band | Verdict |
|-----|-----------|-----------|------|---------|
| `api-auth` | 90.16% | **97.35%** | auth / billing / auth-adjacent — 90%+ target | ✅ |
| `api-courses` | 92.26% | **92.89%** | core domain logic — 75–85% target | ✅ |
| `web-catalog` | 82.79% | **82.79%** | web glue/orchestration — 50–70% target | ✅ |
| `web-enrollment` | 83.33% | **83.33%** | web glue/orchestration — 50–70% target | ✅ |
| `web-ui` | 87.39% | **87.39%** | web glue/orchestration — 50–70% target | ✅ |
| `api-firebase` | 81.69% | **81.69%** | unclassified | ⚪ |
| `api-http-errors` | 90.91% | **90.91%** | unclassified | ⚪ |
| `api-profile` | 82.66% | **87.20%** | unclassified | ⚪ |
| `shared-data-models` | 100.00% | **100.00%** | unclassified | ⚪ |
| `web-auth` | 88.28% | **88.28%** | unclassified | ⚪ |
| `web-courses` | 82.42% | **82.42%** | unclassified | ⚪ |
| `web-learn` | 81.82% | **82.04%** | unclassified | ⚪ |
| `web-profile` | 89.05% | **89.05%** | unclassified | ⚪ |
| `web-video` | 89.64% | **89.64%** | unclassified | ⚪ |

¹ *Adjusted score* excludes equivalent-mutant candidates (logger strings, Logger names, catch blocks with only logging) flagged by the report's heuristic. The raw score is preserved so regressions stay visible.

---

# `libs/api-auth`

**Raw score: 90.16%** · **Adjusted score: 97.35%** ✅ (killed=440, survived=43, no-cov=5, ignored=0, equivalents=36). Covered-only: 91.10%.

Target band: auth / billing / auth-adjacent — 90%+ target.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/auth.exception-filter.ts` | 50.0% | 1 | 1 | 0 |
| `src/lib/session-cookie.service.ts` | 82.6% | 38 | 8 | 0 |
| `src/lib/firebase-session.guard.ts` | 83.3% | 15 | 3 | 0 |
| `src/lib/firebase-auth-rest-client.ts` | 83.8% | 31 | 5 | 1 |
| `src/lib/auth.service.ts` | 85.5% | 100 | 15 | 2 |
| `src/lib/account-recovery.service.ts` | 88.0% | 66 | 9 | 0 |
| `src/lib/auth-attempts.repository.ts` | 95.5% | 84 | 2 | 2 |
| `src/lib/auth.controller.ts` | 100.0% | 39 | 0 | 0 |
| `src/lib/firebase-error.util.ts` | 100.0% | 12 | 0 | 0 |
| `src/lib/instructor-role.guard.ts` | 100.0% | 8 | 0 | 0 |
| `src/lib/password-policy.service.ts` | 100.0% | 41 | 0 | 0 |
| `src/lib/session-cookie.helper.ts` | 100.0% | 5 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/auth-attempts.repository.ts` — 4 surviving mutants

**Cluster 1** (lines 103–106 — `redeemUnlockToken()`): 4 mutants surviving — ConditionalExpression×2, ObjectLiteral×1, StringLiteral×1

Sample mutation:
```diff
- if (query.empty) return { status: 'invalid' };
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth-attempts.repository.ts:103` in `redeemUnlockToken` with assertions that distinguish the outcomes.

### `src/lib/firebase-auth-rest-client.ts` — 4 surviving mutants

**Cluster 2** (lines 59 — `upstreamCode()`): 4 mutants surviving — StringLiteral×2, MethodExpression×1, OptionalChaining×1

Sample mutation:
```diff
- const upstreamCode = (errorBody?.error?.message ?? '').split(' ')[0]?.trim() ?? '';
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `firebase-auth-rest-client.ts:59` in `upstreamCode`. If it's a log message, classify as equivalent.

### `src/lib/account-recovery.service.ts` — 2 surviving mutants

**Cluster 3** (lines 40 — `if()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- await this.dispatchOutboundEmail('resend-verification', emailHash, async () => {
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `account-recovery.service.ts:40` in `if`. If it's a log message, classify as equivalent.

**Cluster 4** (lines 57 — `requestPasswordReset()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- await this.dispatchOutboundEmail('password-reset', emailHash, async () => {
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `account-recovery.service.ts:57` in `requestPasswordReset`. If it's a log message, classify as equivalent.

### `src/lib/session-cookie.service.ts` — 2 surviving mutants

**Cluster 5** (lines 55 — `revokeFromCookie()`): 1 mutant surviving — BooleanLiteral×1

Sample mutation:
```diff
- const decoded = await this.auth.verifySessionCookie(sessionCookie, true);
+ <replaced with: false>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `session-cookie.service.ts:55` in `revokeFromCookie` with assertions that distinguish the outcomes.

**Cluster 6** (lines 91 — `sleepPastNextSecond()`): 1 mutant surviving — ArithmeticOperator×1

Sample mutation:
```diff
- const waitMs = 1000 - (Date.now() % 1000) + LOGOUT_REVOKE_MARGIN_MS;
+ <replaced with: 1000 + Date.now() % 1000>
```

_Diagnosis._ An arithmetic operator could be replaced. Pin the math with a deterministic input/output pair.

_Recommended test._ Inspect `session-cookie.service.ts:91` in `sleepPastNextSecond` and add an assertion that distinguishes the original from the surviving mutation.

## Equivalent-mutant candidates (excluded from adjusted score)

36 mutants flagged as likely equivalent — these are excluded from the **adjusted** score above. Reviewer should confirm each before treating the adjusted score as authoritative:

| File:line | Mutator | Reason |
|-----------|---------|--------|
| `src/lib/auth.service.ts:317` | BlockStatement | Catch block contains only logging — emptying it preserves the silent-swallow behavior. |
| `src/lib/auth.service.ts:318` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:74` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/auth.service.ts:98` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:139` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:139` | LogicalOperator | Operator/expression inside a logger call — affects log content only, not behavior. |
| `src/lib/auth.service.ts:139` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:163` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:173` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:192` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:210` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:252` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:252` | MethodExpression | Operator/expression inside a logger call — affects log content only, not behavior. |
| `src/lib/auth.service.ts:261` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:275` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:284` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:296` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/firebase-auth-rest-client.ts:31` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/firebase-auth-rest-client.ts:66` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/account-recovery.service.ts:19` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/account-recovery.service.ts:69` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/account-recovery.service.ts:105` | BlockStatement | Catch block contains only logging — emptying it preserves the silent-swallow behavior. |
| `src/lib/account-recovery.service.ts:106` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/account-recovery.service.ts:123` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/account-recovery.service.ts:158` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/account-recovery.service.ts:160` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.exception-filter.ts:9` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/firebase-session.guard.ts:12` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/firebase-session.guard.ts:23` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/firebase-session.guard.ts:37` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/session-cookie.service.ts:23` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/session-cookie.service.ts:35` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/session-cookie.service.ts:44` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/session-cookie.service.ts:58` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/session-cookie.service.ts:73` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/session-cookie.service.ts:78` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |

---

# `libs/api-courses`

**Raw score: 92.26%** · **Adjusted score: 92.89%** ✅ (killed=2038, survived=142, no-cov=29, ignored=0, equivalents=15). Covered-only: 93.49%.

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

---

# `libs/web-catalog`

**Raw score: 82.79%** · **Adjusted score: 82.79%** ✅ (killed=178, survived=32, no-cov=5, ignored=0, equivalents=0). Covered-only: 84.76%.

Target band: web glue/orchestration — 50–70% target.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/search-results-page/search-results-page.component.ts` | 78.6% | 22 | 6 | 0 |
| `src/lib/catalog.service.ts` | 79.2% | 19 | 5 | 0 |
| `src/lib/course-detail-page/course-detail-page.component.ts` | 82.1% | 87 | 14 | 5 |
| `src/lib/components/catalog-filter-bar/catalog-filter-bar.component.ts` | 85.7% | 6 | 1 | 0 |
| `src/lib/catalog-page/catalog-page.component.ts` | 86.1% | 31 | 5 | 0 |
| `src/lib/components/course-search-bar/course-search-bar.component.ts` | 92.3% | 12 | 1 | 0 |
| `src/lib/components/course-card/course-card.component.ts` | 100.0% | 1 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/course-detail-page/course-detail-page.component.ts` — 19 surviving mutants

**Cluster 1** (lines 42–54): 7 mutants surviving — BooleanLiteral×2, BlockStatement×1, StringLiteral×1, OptionalChaining×3

Sample mutation:
```diff
- readonly notFound = signal(false);
+ <replaced with: true>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `course-detail-page.component.ts:42`.

**Cluster 2** (lines 67–70 — `coverToneForId()`): 5 mutants surviving — OptionalChaining×3, ConditionalExpression×1, MethodExpression×1

Sample mutation:
```diff
- const e = this.enrollmentStatus()?.enrollment ?? null;
+ <replaced with: this.enrollmentStatus().enrollment>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `course-detail-page.component.ts:67` in `coverToneForId`.

**Cluster 3** (lines 83 — `coverToneForId()`): 2 mutants surviving — ConditionalExpression×1, BooleanLiteral×1

Sample mutation:
```diff
- if (this.firstLessonHref()) return false;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `course-detail-page.component.ts:83` in `coverToneForId` with assertions that distinguish the outcomes.

**Cluster 4** (lines 103–106 — `onEnrollmentStatusChanged()`): 4 mutants surviving — BlockStatement×1, OptionalChaining×1, ConditionalExpression×2

Sample mutation:
```diff
- protected async onEnrollmentStatusChanged(): Promise<void> {
+ <replaced with: {}>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `course-detail-page.component.ts:103` in `onEnrollmentStatusChanged` with assertions that distinguish the outcomes.

**Cluster 5** (lines 132 — `if()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (this.auth.currentUser()) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `course-detail-page.component.ts:132` in `if` with assertions that distinguish the outcomes.

### `src/lib/search-results-page/search-results-page.component.ts` — 6 surviving mutants

**Cluster 6** (lines 22–24): 2 mutants surviving — StringLiteral×1, BooleanLiteral×1

Sample mutation:
```diff
- readonly query = signal('');
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `search-results-page.component.ts:22`. If it's a log message, classify as equivalent.

**Cluster 7** (lines 38 — `if()`): 4 mutants surviving — ConditionalExpression×2, LogicalOperator×1, StringLiteral×1

Sample mutation:
```diff
- const page = Number(params.get('page')) || 1;
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `search-results-page.component.ts:38` in `if` with assertions that distinguish the outcomes.

### `src/lib/catalog-page/catalog-page.component.ts` — 5 surviving mutants

**Cluster 8** (lines 32–36): 3 mutants surviving — BooleanLiteral×2, StringLiteral×1

Sample mutation:
```diff
- readonly error = signal(false);
+ <replaced with: true>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `catalog-page.component.ts:32` with assertions that distinguish the outcomes.

**Cluster 9** (lines 68 — `onFilterChange()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- queryParamsHandling: 'merge',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `catalog-page.component.ts:68` in `onFilterChange`. If it's a log message, classify as equivalent.

**Cluster 10** (lines 76 — `goToPage()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- queryParamsHandling: 'merge',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `catalog-page.component.ts:76` in `goToPage`. If it's a log message, classify as equivalent.

### `src/lib/catalog.service.ts` — 5 surviving mutants

**Cluster 11** (lines 26–29 — `getCatalogue()`): 4 mutants surviving — ConditionalExpression×4

Sample mutation:
```diff
- if (params.page) httpParams = httpParams.set('page', params.page);
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `catalog.service.ts:26` in `getCatalogue` with assertions that distinguish the outcomes.

**Cluster 12** (lines 37 — `search()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (page) httpParams = httpParams.set('page', page);
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `catalog.service.ts:37` in `search` with assertions that distinguish the outcomes.

### `src/lib/components/catalog-filter-bar/catalog-filter-bar.component.ts` — 1 surviving mutant

**Cluster 13** (lines 27): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- readonly sort = input<CatalogSort>('NEWEST');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `catalog-filter-bar.component.ts:27`. If it's a log message, classify as equivalent.

### `src/lib/components/course-search-bar/course-search-bar.component.ts` — 1 surviving mutant

**Cluster 14** (lines 16): 1 mutant surviving — StringLiteral×1

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

**Raw score: 83.33%** · **Adjusted score: 83.33%** ✅ (killed=80, survived=12, no-cov=4, ignored=0, equivalents=0). Covered-only: 86.96%.

Target band: web glue/orchestration — 50–70% target.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/course-enrollment-panel/course-enrollment-panel.component.ts` | 82.0% | 73 | 12 | 4 |
| `src/lib/enrollment.service.ts` | 100.0% | 7 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/course-enrollment-panel/course-enrollment-panel.component.ts` — 16 surviving mutants

**Cluster 1** (lines 42–43): 2 mutants surviving — StringLiteral×1, BooleanLiteral×1

Sample mutation:
```diff
- readonly state = signal<PanelState>('LOADING');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `course-enrollment-panel.component.ts:42`. If it's a log message, classify as equivalent.

**Cluster 2** (lines 84 — `if()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (this.state() === 'ENROLLED') this.clearEnrollParam();
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `course-enrollment-panel.component.ts:84` in `if` with assertions that distinguish the outcomes.

**Cluster 3** (lines 101 — `enroll()`): 1 mutant surviving — BooleanLiteral×1

Sample mutation:
```diff
- this.busy.set(true);
+ <replaced with: false>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `course-enrollment-panel.component.ts:101` in `enroll` with assertions that distinguish the outcomes.

**Cluster 4** (lines 116–118 — `catch()`): 2 mutants surviving — BlockStatement×1, BooleanLiteral×1

Sample mutation:
```diff
- } finally {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `course-enrollment-panel.component.ts:116` in `catch` — verify state change, mock invocation, or returned value.

**Cluster 5** (lines 126–131 — `cancelConfirm()`): 3 mutants surviving — BlockStatement×1, BooleanLiteral×2

Sample mutation:
```diff
- cancelConfirm(): void {
+ <replaced with: {}>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `course-enrollment-panel.component.ts:126` in `cancelConfirm` with assertions that distinguish the outcomes.

**Cluster 6** (lines 138–146 — `confirmLeave()`): 5 mutants surviving — BlockStatement×2, StringLiteral×2, BooleanLiteral×1

Sample mutation:
```diff
- } catch {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `course-enrollment-panel.component.ts:138` in `confirmLeave` — verify state change, mock invocation, or returned value.

**Cluster 7** (lines 154 — `clearEnrollParam()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- queryParamsHandling: 'merge',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `course-enrollment-panel.component.ts:154` in `clearEnrollParam`. If it's a log message, classify as equivalent.

**Cluster 8** (lines 160 — `errorCode()`): 1 mutant surviving — OptionalChaining×1

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

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `course-enrollment-panel.component.ts:160` in `errorCode`.

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

---

# `libs/web-ui`

**Raw score: 87.39%** · **Adjusted score: 87.39%** ✅ (killed=104, survived=9, no-cov=6, ignored=0, equivalents=0). Covered-only: 92.04%.

Target band: web glue/orchestration — 50–70% target.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/cover/lw-cover.component.ts` | 75.0% | 3 | 1 | 0 |
| `src/lib/avatar/lw-avatar.component.ts` | 79.3% | 23 | 2 | 4 |
| `src/lib/pill/lw-pill.component.ts` | 87.5% | 14 | 2 | 0 |
| `src/lib/avatar/avatar-tone.ts` | 88.2% | 15 | 1 | 1 |
| `src/lib/cover/cover-tone.ts` | 88.2% | 15 | 1 | 1 |
| `src/lib/theme/theme.service.ts` | 93.8% | 30 | 2 | 0 |
| `src/lib/progress/lw-progress.component.ts` | 100.0% | 4 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/avatar/lw-avatar.component.ts` — 6 surviving mutants

**Cluster 1** (lines 40–47 — `deriveInitials()`): 6 mutants surviving — ConditionalExpression×1, Regex×1, StringLiteral×4

Sample mutation:
```diff
- if (!trimmed) return '';
+ <replaced with: false>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `lw-avatar.component.ts:40` in `deriveInitials`. If it's a log message, classify as equivalent.

### `src/lib/avatar/avatar-tone.ts` — 2 surviving mutants

**Cluster 2** (lines 8–11 — `for()`): 2 mutants surviving — ArithmeticOperator×1, StringLiteral×1

Sample mutation:
```diff
- hash = (hash * 31 + id.charCodeAt(i)) | 0;
+ <replaced with: hash * 31 - id.charCodeAt(i)>
```

_Diagnosis._ An arithmetic operator could be replaced. Pin the math with a deterministic input/output pair.

_Recommended test._ Inspect `avatar-tone.ts:8` in `for` and add an assertion that distinguishes the original from the surviving mutation.

### `src/lib/cover/cover-tone.ts` — 2 surviving mutants

**Cluster 3** (lines 8–11 — `for()`): 2 mutants surviving — ArithmeticOperator×1, StringLiteral×1

Sample mutation:
```diff
- hash = (hash * 31 + id.charCodeAt(i)) | 0;
+ <replaced with: hash * 31 - id.charCodeAt(i)>
```

_Diagnosis._ An arithmetic operator could be replaced. Pin the math with a deterministic input/output pair.

_Recommended test._ Inspect `cover-tone.ts:8` in `for` and add an assertion that distinguishes the original from the surviving mutation.

### `src/lib/pill/lw-pill.component.ts` — 2 surviving mutants

**Cluster 4** (lines 18): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- readonly tone = input<LwPillTone>('default');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `lw-pill.component.ts:18`. If it's a log message, classify as equivalent.

**Cluster 5** (lines 30–31): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- default:
+ <replaced with: default:>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `lw-pill.component.ts:30` with assertions that distinguish the outcomes.

### `src/lib/theme/theme.service.ts` — 2 surviving mutants

**Cluster 6** (lines 29 — `readInitial()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

Sample mutation:
```diff
- return stored === 'light' || stored === 'dark' ? stored : 'dark';
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `theme.service.ts:29` in `readInitial` with assertions that distinguish the outcomes.

### `src/lib/cover/lw-cover.component.ts` — 1 surviving mutant

**Cluster 7** (lines 32): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- readonly alt = input('');
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `lw-cover.component.ts:32`. If it's a log message, classify as equivalent.

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

---

# `libs/api-firebase`

**Raw score: 81.69%** · **Adjusted score: 81.69%** ⚪ (killed=58, survived=13, no-cov=0, ignored=0, equivalents=0). Covered-only: 81.69%.

Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/firebase-admin.module.ts` | 81.7% | 58 | 13 | 0 |

## Survivor clusters — gaps to close

### `src/lib/firebase-admin.module.ts` — 13 surviving mutants

**Cluster 1** (lines 24 — `resolveMode()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- : 'emulator';
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `firebase-admin.module.ts:24` in `resolveMode`. If it's a log message, classify as equivalent.

**Cluster 2** (lines 54–57 — `configureFirestoreOnce()`): 5 mutants surviving — BooleanLiteral×2, ConditionalExpression×1, BlockStatement×1, ObjectLiteral×1

Sample mutation:
```diff
- if (!configuredFirestores.has(firestore)) {
+ <replaced with: configuredFirestores.has(firestore)>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `firebase-admin.module.ts:54` in `configureFirestoreOnce` with assertions that distinguish the outcomes.

**Cluster 3** (lines 64 — `ensureEmulatorAppInitialized()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (existing) return existing;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `firebase-admin.module.ts:64` in `ensureEmulatorAppInitialized` with assertions that distinguish the outcomes.

**Cluster 4** (lines 70–80 — `ensureProductionAppInitialized()`): 4 mutants surviving — StringLiteral×1, ConditionalExpression×2, BlockStatement×1

Sample mutation:
```diff
- const credentialPath = process.env['FIREBASE_SERVICE_ACCOUNT_JSON_PATH'];
+ <replaced with: "">
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `firebase-admin.module.ts:70` in `ensureProductionAppInitialized` with assertions that distinguish the outcomes.

**Cluster 5** (lines 96 — `forRoot()`): 1 mutant surviving — BooleanLiteral×1

Sample mutation:
```diff
- global: true,
+ <replaced with: false>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `firebase-admin.module.ts:96` in `forRoot` with assertions that distinguish the outcomes.

**Cluster 6** (lines 118 — `if()`): 1 mutant surviving — ArrayDeclaration×1

Sample mutation:
```diff
- exports: [FIRESTORE, FIREBASE_AUTH, FIREBASE_STORAGE, FIREBASE_WEB_API_KEY],
+ <replaced with: []>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `firebase-admin.module.ts:118` in `if`, not just truthiness.

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

---

# `libs/api-http-errors`

**Raw score: 90.91%** · **Adjusted score: 90.91%** ⚪ (killed=70, survived=5, no-cov=2, ignored=0, equivalents=0). Covered-only: 93.33%.

Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/exception-response.ts` | 90.9% | 70 | 5 | 2 |

## Survivor clusters — gaps to close

### `src/lib/exception-response.ts` — 7 surviving mutants

**Cluster 1** (lines 35 — `isDomainShaped()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- typeof (exception as { status?: unknown }).status === 'number'
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `exception-response.ts:35` in `isDomainShaped` with assertions that distinguish the outcomes.

**Cluster 2** (lines 72 — `for()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (!field) continue;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `exception-response.ts:72` in `for` with assertions that distinguish the outcomes.

**Cluster 3** (lines 80–81 — `normalizeMessages()`): 3 mutants surviving — ConditionalExpression×1, ArrayDeclaration×2

Sample mutation:
```diff
- if (Array.isArray(message)) return message;
+ <replaced with: true>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `exception-response.ts:80` in `normalizeMessages`, not just truthiness.

**Cluster 4** (lines 90 — `respondValidation()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- message: 'Request body failed validation.',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `exception-response.ts:90` in `respondValidation`. If it's a log message, classify as equivalent.

**Cluster 5** (lines 112 — `handleException()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (exception.details) body.error.details = exception.details;
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `exception-response.ts:112` in `handleException` with assertions that distinguish the outcomes.

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

---

# `libs/api-profile`

**Raw score: 82.66%** · **Adjusted score: 87.20%** ⚪ (killed=286, survived=58, no-cov=2, ignored=0, equivalents=18). Covered-only: 83.14%.

Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/email/email.exception-filter.ts` | 50.0% | 1 | 1 | 0 |
| `src/lib/picture/picture.exception-filter.ts` | 50.0% | 1 | 1 | 0 |
| `src/lib/profile.exception-filter.ts` | 50.0% | 1 | 1 | 0 |
| `src/lib/password/password-change.service.ts` | 66.7% | 22 | 11 | 0 |
| `src/lib/email/email-change.service.ts` | 79.0% | 83 | 22 | 0 |
| `src/lib/picture/profile-picture.service.ts` | 79.2% | 42 | 10 | 1 |
| `src/lib/picture/fake-picture-storage.adapter.ts` | 83.3% | 5 | 0 | 1 |
| `src/lib/picture/picture.config.ts` | 86.4% | 19 | 3 | 0 |
| `src/lib/profile.service.ts` | 87.5% | 35 | 5 | 0 |
| `src/lib/picture/profile-picture.controller.ts` | 88.2% | 15 | 2 | 0 |
| `src/lib/picture/picture-storage.adapter.ts` | 92.3% | 12 | 1 | 0 |
| `src/lib/password/password.exception-filter.ts` | 97.2% | 35 | 1 | 0 |
| `src/lib/email/email-change.controller.ts` | 100.0% | 7 | 0 | 0 |
| `src/lib/password/password-change.controller.ts` | 100.0% | 3 | 0 | 0 |
| `src/lib/profile.controller.ts` | 100.0% | 5 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/email/email-change.service.ts` — 16 surviving mutants

**Cluster 1** (lines 25): 1 mutant surviving — Regex×1

Sample mutation:
```diff
- const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
+ <replaced with: /^[^\s@]+@[^\s@]+\.[^\s@]+/>
```

_Diagnosis._ A regex literal could be replaced with `/.*/` and tests pass. Assert against inputs that should and should not match.

_Recommended test._ Inspect `email-change.service.ts:25` and add an assertion that distinguishes the original from the surviving mutation.

**Cluster 2** (lines 44): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (newEmail.length === 0 || !EMAIL_REGEX.test(newEmail)) {
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `email-change.service.ts:44` with assertions that distinguish the outcomes.

**Cluster 3** (lines 62 — `catch()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- throw new EmailChangeFailedException(err instanceof Error ? { cause: err } : undefined);
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `email-change.service.ts:62` in `catch`, not just truthiness.

**Cluster 4** (lines 78 — `if()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- await this.firestore.collection('users').doc(uid).update({
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `email-change.service.ts:78` in `if`. If it's a log message, classify as equivalent.

**Cluster 5** (lines 90 — `verifyCurrentPassword()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- await this.restClient.signInWithPassword({ email, password });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `email-change.service.ts:90` in `verifyCurrentPassword`, not just truthiness.

**Cluster 6** (lines 96 — `if()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- throw new EmailChangeFailedException(err instanceof Error ? { cause: err } : undefined);
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `email-change.service.ts:96` in `if`, not just truthiness.

**Cluster 7** (lines 110–120 — `catch()`): 10 mutants surviving — ObjectLiteral×1, LogicalOperator×3, StringLiteral×2, ConditionalExpression×4

Sample mutation:
```diff
- throw new EmailChangeFailedException(err instanceof Error ? { cause: err } : undefined);
+ <replaced with: {}>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `email-change.service.ts:110` in `catch` with assertions that distinguish the outcomes.

### `src/lib/picture/profile-picture.service.ts` — 11 surviving mutants

**Cluster 8** (lines 46–52 — `pathFor()`): 4 mutants surviving — ObjectLiteral×2, LogicalOperator×1, ConditionalExpression×1

Sample mutation:
```diff
- meta = await sharp(body, { failOn: 'truncated' }).metadata();
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `profile-picture.service.ts:46` in `pathFor`, not just truthiness.

**Cluster 9** (lines 61–67 — `if()`): 5 mutants surviving — ObjectLiteral×4, BooleanLiteral×1

Sample mutation:
```diff
- const square = await sharp(body, { failOn: 'truncated' })
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `profile-picture.service.ts:61` in `if`, not just truthiness.

**Cluster 10** (lines 107 — `if()`): 2 mutants surviving — StringLiteral×1, ConditionalExpression×1

Sample mutation:
```diff
- if (!snap.exists) throw new NotFoundException('User profile not found.');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `profile-picture.service.ts:107` in `if`. If it's a log message, classify as equivalent.

### `src/lib/password/password-change.service.ts` — 5 surviving mutants

**Cluster 11** (lines 50 — `catch()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- throw new PasswordChangeFailedException(err instanceof Error ? { cause: err } : undefined);
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `password-change.service.ts:50` in `catch`, not just truthiness.

**Cluster 12** (lines 67–73 — `verifyCurrentPassword()`): 4 mutants surviving — ObjectLiteral×2, LogicalOperator×1, ConditionalExpression×1

Sample mutation:
```diff
- await this.restClient.signInWithPassword({ email, password });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `password-change.service.ts:67` in `verifyCurrentPassword`, not just truthiness.

### `src/lib/picture/picture.config.ts` — 3 surviving mutants

**Cluster 13** (lines 1): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- export const PICTURE_CONFIG = Symbol.for('learnwren.api-profile.picture.config');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `picture.config.ts:1`. If it's a log message, classify as equivalent.

**Cluster 14** (lines 16–20 — `if()`): 2 mutants surviving — StringLiteral×2

Sample mutation:
```diff
- throw new Error('LEARNWREN_PICTURE_BUCKET is required.');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `picture.config.ts:16` in `if`. If it's a log message, classify as equivalent.

### `src/lib/profile.service.ts` — 3 surviving mutants

**Cluster 15** (lines 58 — `if()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- await this.firestore.collection('users').doc(uid).update({
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `profile.service.ts:58` in `if`. If it's a log message, classify as equivalent.

**Cluster 16** (lines 76–79 — `readUser()`): 2 mutants surviving — StringLiteral×2

Sample mutation:
```diff
- const snap = await this.firestore.collection('users').doc(uid).get();
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `profile.service.ts:76` in `readUser`. If it's a log message, classify as equivalent.

### `src/lib/picture/profile-picture.controller.ts` — 2 surviving mutants

**Cluster 17** (lines 24): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- const ALLOWED_MIME = new Set(['image/jpeg', 'image/png']);
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `profile-picture.controller.ts:24`. If it's a log message, classify as equivalent.

**Cluster 18** (lines 44 — `constructor()`): 1 mutant surviving — EqualityOperator×1

Sample mutation:
```diff
- if (file.size > MAX_BYTES) throw new PictureTooLargeException();
+ <replaced with: file.size >= MAX_BYTES>
```

_Diagnosis._ An equality / inequality operator could be flipped (`==`↔`!=`, `===`↔`!==`) and tests still pass. Test both equal and unequal inputs at the boundary.

_Recommended test._ Add a boundary test that exercises the equal / off-by-one case at `profile-picture.controller.ts:44` in `constructor`.

### `src/lib/picture/fake-picture-storage.adapter.ts` — 1 surviving mutant

**Cluster 19** (lines 36–38 — `clear()`): 1 mutant surviving — BlockStatement×1

Sample mutation:
```diff
- clear(): void {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `fake-picture-storage.adapter.ts:36` in `clear` — verify state change, mock invocation, or returned value.

### `src/lib/picture/picture-storage.adapter.ts` — 1 surviving mutant

**Cluster 20** (lines 50 — `catch()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- export const PICTURE_STORAGE = Symbol.for('learnwren.api-profile.picture.storage');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `picture-storage.adapter.ts:50` in `catch`. If it's a log message, classify as equivalent.

## Equivalent-mutant candidates (excluded from adjusted score)

18 mutants flagged as likely equivalent — these are excluded from the **adjusted** score above. Reviewer should confirm each before treating the adjusted score as authoritative:

| File:line | Mutator | Reason |
|-----------|---------|--------|
| `src/lib/email/email-change.service.ts:29` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/email/email-change.service.ts:61` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/email/email-change.service.ts:64` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/email/email-change.service.ts:84` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/email/email-change.service.ts:95` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/email/email-change.service.ts:109` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/email/email.exception-filter.ts:10` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/password/password-change.service.ts:22` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/password/password-change.service.ts:49` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/password/password-change.service.ts:57` | BlockStatement | Catch block contains only logging — emptying it preserves the silent-swallow behavior. |
| `src/lib/password/password-change.service.ts:58` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/password/password-change.service.ts:62` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/password/password-change.service.ts:72` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/password/password.exception-filter.ts:23` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/picture/picture.exception-filter.ts:9` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/profile.exception-filter.ts:9` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/profile.service.ts:23` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/profile.service.ts:78` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |

---

# `libs/shared-data-models`

**Raw score: 100.00%** · **Adjusted score: 100.00%** ⚪ (killed=22, survived=0, no-cov=0, ignored=0, equivalents=0). Covered-only: 100.00%.

Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/material.ts` | 100.0% | 9 | 0 | 0 |
| `src/lib/profile.ts` | 100.0% | 13 | 0 | 0 |

## Survivor clusters — gaps to close

_No actionable survivors after filtering equivalent candidates._

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

---

# `libs/web-auth`

**Raw score: 88.28%** · **Adjusted score: 88.28%** ⚪ (killed=369, survived=48, no-cov=1, ignored=0, equivalents=0). Covered-only: 88.49%.

Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/login-page/login-page.component.ts` | 81.3% | 100 | 22 | 1 |
| `src/lib/register-page/register-page.component.ts` | 86.5% | 45 | 7 | 0 |
| `src/lib/password-policy.validator.ts` | 88.0% | 44 | 6 | 0 |
| `src/lib/register-confirm-page/register-confirm-page.component.ts` | 88.0% | 22 | 3 | 0 |
| `src/lib/auth.service.ts` | 91.7% | 99 | 9 | 0 |
| `src/lib/forgot-password-page/forgot-password-page.component.ts` | 92.9% | 13 | 1 | 0 |
| `src/lib/auth.guard.ts` | 100.0% | 14 | 0 | 0 |
| `src/lib/unlock-page/unlock-page.component.ts` | 100.0% | 29 | 0 | 0 |
| `src/lib/with-credentials.interceptor.ts` | 100.0% | 3 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/login-page/login-page.component.ts` — 23 surviving mutants

**Cluster 1** (lines 34 — `isSafeRedirect()`): 2 mutants surviving — EqualityOperator×1, ConditionalExpression×1

Sample mutation:
```diff
- return r.length > 0 && r.startsWith('/') && r[1] !== '/' && r[1] !== '\\';
+ <replaced with: r.length >= 0>
```

_Diagnosis._ An equality / inequality operator could be flipped (`==`↔`!=`, `===`↔`!==`) and tests still pass. Test both equal and unequal inputs at the boundary.

_Recommended test._ Add a boundary test that exercises the equal / off-by-one case at `login-page.component.ts:34` in `isSafeRedirect`.

**Cluster 2** (lines 51–75 — `isSafeRedirect()`): 15 mutants surviving — ArrayDeclaration×2, StringLiteral×3, ObjectLiteral×1, OptionalChaining×3, ConditionalExpression×4, BlockStatement×1, EqualityOperator×1

Sample mutation:
```diff
- password: ['', [Validators.required]],
+ <replaced with: []>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `login-page.component.ts:51` in `isSafeRedirect` with assertions that distinguish the outcomes.

**Cluster 3** (lines 81 — `submit()`): 2 mutants surviving — ObjectLiteral×1, StringLiteral×1

Sample mutation:
```diff
- this.errorState.set({ kind: 'none' });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `login-page.component.ts:81` in `submit`, not just truthiness.

**Cluster 4** (lines 88 — `if()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- const redirect = this.queryParams()?.get('redirect');
+ <replaced with: this.queryParams().get>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `login-page.component.ts:88` in `if`.

**Cluster 5** (lines 119 — `if()`): 3 mutants surviving — StringLiteral×1, LogicalOperator×1, OptionalChaining×1

Sample mutation:
```diff
- (result.details as { unlockAvailableAt?: string } | undefined)?.unlockAvailableAt ?? '',
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `login-page.component.ts:119` in `if`. If it's a log message, classify as equivalent.

### `src/lib/auth.service.ts` — 9 surviving mutants

**Cluster 6** (lines 48 — `register()`): 2 mutants surviving — ObjectLiteral×1, BooleanLiteral×1

Sample mutation:
```diff
- return this.authenticateThen('/api/auth/register', input, { resetUserOnError: false });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `auth.service.ts:48` in `register`, not just truthiness.

**Cluster 7** (lines 75 — `catch()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (opts.resetUserOnError) this.currentUserSignal.set(null);
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.service.ts:75` in `catch` with assertions that distinguish the outcomes.

**Cluster 8** (lines 117–118 — `if()`): 2 mutants surviving — ConditionalExpression×1, OptionalChaining×1

Sample mutation:
```diff
- if (err instanceof HttpErrorResponse) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.service.ts:117` in `if` with assertions that distinguish the outcomes.

**Cluster 9** (lines 128–130 — `if()`): 2 mutants surviving — ConditionalExpression×1, OptionalChaining×1

Sample mutation:
```diff
- if (err instanceof HttpErrorResponse) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.service.ts:128` in `if` with assertions that distinguish the outcomes.

**Cluster 10** (lines 138 — `if()`): 2 mutants surviving — OptionalChaining×2

Sample mutation:
```diff
- return { ok: false, code, details: body?.error?.details };
+ <replaced with: body?.error.details>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `auth.service.ts:138` in `if`.

### `src/lib/register-page/register-page.component.ts` — 7 surviving mutants

**Cluster 11** (lines 31–33): 3 mutants surviving — StringLiteral×3

Sample mutation:
```diff
- displayName: ['', [Validators.required, Validators.maxLength(80)]],
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `register-page.component.ts:31`. If it's a log message, classify as equivalent.

**Cluster 12** (lines 39–41): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- private readonly passwordStatus = toSignal(this.form.controls.password.valueChanges, {
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `register-page.component.ts:39`, not just truthiness.

**Cluster 13** (lines 47): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- if (!policy?.unmet?.length) return [];
+ <replaced with: policy?.unmet.length>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `register-page.component.ts:47`.

**Cluster 14** (lines 75–79 — `if()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

Sample mutation:
```diff
- if (result.code === 'WEAK_PASSWORD') {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `register-page.component.ts:75` in `if` with assertions that distinguish the outcomes.

### `src/lib/password-policy.validator.ts` — 6 surviving mutants

**Cluster 15** (lines 14–17): 3 mutants surviving — StringLiteral×3

Sample mutation:
```diff
- UPPERCASE: 'at least one uppercase letter',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `password-policy.validator.ts:14`. If it's a log message, classify as equivalent.

**Cluster 16** (lines 36–38 — `return()`): 3 mutants surviving — Regex×3

Sample mutation:
```diff
- if (!/[a-z]/.test(value)) unmet.add('LOWERCASE');
+ <replaced with: /[^a-z]/>
```

_Diagnosis._ A regex literal could be replaced with `/.*/` and tests pass. Assert against inputs that should and should not match.

_Recommended test._ Inspect `password-policy.validator.ts:36` in `return` and add an assertion that distinguishes the original from the surviving mutation.

### `src/lib/register-confirm-page/register-confirm-page.component.ts` — 3 surviving mutants

**Cluster 17** (lines 22–27): 2 mutants surviving — OptionalChaining×1, EqualityOperator×1

Sample mutation:
```diff
- readonly email = computed(() => this.queryParams()?.get('email') ?? '');
+ <replaced with: this.queryParams().get>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `register-confirm-page.component.ts:22`.

**Cluster 18** (lines 33 — `resend()`): 1 mutant surviving — BooleanLiteral×1

Sample mutation:
```diff
- this.busy.set(true);
+ <replaced with: false>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `register-confirm-page.component.ts:33` in `resend` with assertions that distinguish the outcomes.

### `src/lib/forgot-password-page/forgot-password-page.component.ts` — 1 surviving mutant

**Cluster 19** (lines 24): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- email: ['', [Validators.required, Validators.email]],
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `forgot-password-page.component.ts:24`. If it's a log message, classify as equivalent.

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

---

# `libs/web-courses`

**Raw score: 82.42%** · **Adjusted score: 82.42%** ⚪ (killed=694, survived=107, no-cov=41, ignored=0, equivalents=0). Covered-only: 86.64%.

Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/components/confirm-dialog/confirm-dialog.component.ts` | 0.0% | 0 | 2 | 0 |
| `src/lib/cover/course-cover-uploader.component.ts` | 38.3% | 18 | 12 | 17 |
| `src/lib/publish/publish-eligibility-panel.component.ts` | 72.7% | 56 | 13 | 8 |
| `src/lib/materials/materials-list.component.ts` | 80.0% | 56 | 10 | 4 |
| `src/lib/cover/course-cover.service.ts` | 80.0% | 24 | 6 | 0 |
| `src/lib/course-create-page/course-create-page.component.ts` | 82.0% | 41 | 9 | 0 |
| `src/lib/components/module-tree/module-tree.component.ts` | 83.3% | 5 | 1 | 0 |
| `src/lib/publish/course-publish-bar.component.ts` | 83.5% | 91 | 13 | 5 |
| `src/lib/course-editor-page/course-editor-page.component.ts` | 85.1% | 143 | 18 | 7 |
| `src/lib/materials/material-upload.service.ts` | 85.4% | 82 | 14 | 0 |
| `src/lib/components/course-meta-panel/course-meta-panel.component.ts` | 87.0% | 20 | 3 | 0 |
| `src/lib/publish/publish-eligibility.service.ts` | 87.5% | 14 | 2 | 0 |
| `src/lib/components/lesson-item/lesson-item.component.ts` | 91.4% | 32 | 3 | 0 |
| `src/lib/instructor-role.guard.ts` | 95.2% | 20 | 1 | 0 |
| `src/lib/components/lesson-list/lesson-list.component.ts` | 100.0% | 6 | 0 | 0 |
| `src/lib/components/module-item/module-item.component.ts` | 100.0% | 34 | 0 | 0 |
| `src/lib/courses-list-page/courses-list-page.component.ts` | 100.0% | 2 | 0 | 0 |
| `src/lib/courses.service.ts` | 100.0% | 37 | 0 | 0 |
| `src/lib/materials/materials.service.ts` | 100.0% | 13 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/cover/course-cover-uploader.component.ts` — 29 surviving mutants

**Cluster 1** (lines 45–50): 7 mutants surviving — ObjectLiteral×1, StringLiteral×2, BlockStatement×1, ConditionalExpression×2, EqualityOperator×1

Sample mutation:
```diff
- readonly state = signal<UploaderState>({ kind: 'idle' });
+ <replaced with: {}>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `course-cover-uploader.component.ts:45`. If it's a log message, classify as equivalent.

**Cluster 2** (lines 58 — `if()`): 2 mutants surviving — ObjectLiteral×1, StringLiteral×1

Sample mutation:
```diff
- this.state.set({ kind: 'uploading' });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `course-cover-uploader.component.ts:58` in `if`, not just truthiness.

**Cluster 3** (lines 68–95 — `onFileInput()`): 20 mutants surviving — BlockStatement×3, OptionalChaining×4, ConditionalExpression×2, StringLiteral×6, ObjectLiteral×5

Sample mutation:
```diff
- onFileInput(event: Event): void {
+ <replaced with: {}>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `course-cover-uploader.component.ts:68` in `onFileInput`. If it's a log message, classify as equivalent.

### `src/lib/course-editor-page/course-editor-page.component.ts` — 25 surviving mutants

**Cluster 4** (lines 46): 2 mutants surviving — ArrayDeclaration×1, OptionalChaining×1

Sample mutation:
```diff
- (this.tree()?.modules ?? []).map((m) => ({ module: m.module, lessons: m.lessons })),
+ <replaced with: ["Stryker was here"]>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `course-editor-page.component.ts:46`, not just truthiness.

**Cluster 5** (lines 55 — `refresh()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (!cid) return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `course-editor-page.component.ts:55` in `refresh` with assertions that distinguish the outcomes.

**Cluster 6** (lines 82–98 — `requestDeleteLesson()`): 8 mutants surviving — StringLiteral×1, ConditionalExpression×3, BlockStatement×1, BooleanLiteral×1, ObjectLiteral×2

Sample mutation:
```diff
- this.pendingConfirm.set({ kind: 'deleteLesson', ...args });
+ <replaced with: "">
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `course-editor-page.component.ts:82` in `requestDeleteLesson` with assertions that distinguish the outcomes.

**Cluster 7** (lines 126 — `if()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- this.publishBar?.runConfirmedTransition(pending.kind);
+ <replaced with: this.publishBar.runConfirmedTransition>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `course-editor-page.component.ts:126` in `if`.

**Cluster 8** (lines 147 — `addModule()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- const title = window.prompt('Module title');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `course-editor-page.component.ts:147` in `addModule`. If it's a log message, classify as equivalent.

**Cluster 9** (lines 178–183 — `onReorderModules()`): 9 mutants surviving — ArrowFunction×4, ObjectLiteral×1, MethodExpression×1, ConditionalExpression×2, EqualityOperator×1

Sample mutation:
```diff
- (snapshot) => ({
+ <replaced with: () => undefined>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing. The function is called but its effect isn't asserted.

_Recommended test._ Add an assertion on the side effect of the block/function at `course-editor-page.component.ts:178` in `onReorderModules` — verify state change, mock invocation, or returned value.

**Cluster 10** (lines 193–196 — `onReorderLessons()`): 2 mutants surviving — ConditionalExpression×1, MethodExpression×1

Sample mutation:
```diff
- if (n.module.id !== args.moduleId) return n;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `course-editor-page.component.ts:193` in `onReorderLessons` with assertions that distinguish the outcomes.

**Cluster 11** (lines 214 — `filter()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (!snapshot) return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `course-editor-page.component.ts:214` in `filter` with assertions that distinguish the outcomes.

### `src/lib/publish/publish-eligibility-panel.component.ts` — 21 surviving mutants

**Cluster 12** (lines 43–53): 9 mutants surviving — ConditionalExpression×4, LogicalOperator×1, BlockStatement×1, EqualityOperator×1, OptionalChaining×1, BooleanLiteral×1

Sample mutation:
```diff
- return e && !e.eligible ? e.reasons.length : 0;
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `publish-eligibility-panel.component.ts:43` with assertions that distinguish the outcomes.

**Cluster 13** (lines 61–68 — `switch()`): 4 mutants surviving — ConditionalExpression×3, StringLiteral×1

Sample mutation:
```diff
- case 'MODULE_HAS_NO_LESSONS':
+ <replaced with: case 'MODULE_HAS_NO_LESSONS':>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `publish-eligibility-panel.component.ts:61` in `switch` with assertions that distinguish the outcomes.

**Cluster 14** (lines 74–75 — `onJump()`): 8 mutants surviving — ConditionalExpression×6, LogicalOperator×2

Sample mutation:
```diff
- if (link === 'module' && r.kind === 'MODULE_HAS_NO_LESSONS') this.jumpToModule.emit(r.moduleId);
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `publish-eligibility-panel.component.ts:74` in `onJump` with assertions that distinguish the outcomes.

### `src/lib/publish/course-publish-bar.component.ts` — 18 surviving mutants

**Cluster 15** (lines 45): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- default: return null;
+ <replaced with: default:>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `course-publish-bar.component.ts:45` with assertions that distinguish the outcomes.

**Cluster 16** (lines 53–57): 4 mutants surviving — ConditionalExpression×2, StringLiteral×1, BooleanLiteral×1

Sample mutation:
```diff
- default: return '';
+ <replaced with: default:>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `course-publish-bar.component.ts:53` with assertions that distinguish the outcomes.

**Cluster 17** (lines 65–75): 6 mutants surviving — ConditionalExpression×4, EqualityOperator×1, StringLiteral×1

Sample mutation:
```diff
- return s === 'DRAFT' || s === 'PUBLISHED';
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `course-publish-bar.component.ts:65` with assertions that distinguish the outcomes.

**Cluster 18** (lines 85–90 — `runConfirmedTransition()`): 2 mutants surviving — ConditionalExpression×1, BooleanLiteral×1

Sample mutation:
```diff
- if (kind === 'unpublish') this.doTransition(() => this.courses.unpublishCourse(this.course().id));
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `course-publish-bar.component.ts:85` in `runConfirmedTransition` with assertions that distinguish the outcomes.

**Cluster 19** (lines 99 — `if()`): 3 mutants surviving — ArrayDeclaration×1, OptionalChaining×2

Sample mutation:
```diff
- const reasons = err.error?.details?.reasons ?? [];
+ <replaced with: ["Stryker was here"]>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `course-publish-bar.component.ts:99` in `if`.

**Cluster 20** (lines 106–108 — `if()`): 2 mutants surviving — BlockStatement×1, BooleanLiteral×1

Sample mutation:
```diff
- } finally {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `course-publish-bar.component.ts:106` in `if` — verify state change, mock invocation, or returned value.

### `src/lib/materials/materials-list.component.ts` — 14 surviving mutants

**Cluster 21** (lines 37–40): 3 mutants surviving — ArrayDeclaration×1, BooleanLiteral×1, StringLiteral×1

Sample mutation:
```diff
- readonly materials = signal<Material[]>([]);
+ <replaced with: ["Stryker was here"]>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `materials-list.component.ts:37`, not just truthiness.

**Cluster 22** (lines 77 — `from()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- el.value = '';
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `materials-list.component.ts:77` in `from`. If it's a log message, classify as equivalent.

**Cluster 23** (lines 100 — `commitRename()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- this.materials.update((list) => list.map((x) => (x.id === m.id ? updated : x)));
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `materials-list.component.ts:100` in `commitRename` with assertions that distinguish the outcomes.

**Cluster 24** (lines 112 — `confirmRemoval()`): 2 mutants surviving — ArrowFunction×1, ConditionalExpression×1

Sample mutation:
```diff
- this.materials.update((list) => list.filter((x) => x.id !== m.id));
+ <replaced with: () => undefined>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing. The function is called but its effect isn't asserted.

_Recommended test._ Add an assertion on the side effect of the block/function at `materials-list.component.ts:112` in `confirmRemoval` — verify state change, mock invocation, or returned value.

**Cluster 25** (lines 120–123 — `status()`): 3 mutants surviving — OptionalChaining×1, ArrowFunction×1, ConditionalExpression×1

Sample mutation:
```diff
- const status = (err as { status?: number })?.status;
+ <replaced with: (err as {
  status?: number;
}).status>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `materials-list.component.ts:120` in `status`.

**Cluster 26** (lines 131–139 — `openDownload()`): 4 mutants surviving — BlockStatement×1, StringLiteral×3

Sample mutation:
```diff
- protected openDownload(url: string): void {
+ <replaced with: {}>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `materials-list.component.ts:131` in `openDownload`. If it's a log message, classify as equivalent.

### `src/lib/materials/material-upload.service.ts` — 14 surviving mutants

**Cluster 27** (lines 15–16): 4 mutants surviving — StringLiteral×2, ArrowFunction×2

Sample mutation:
```diff
- 'MATERIAL_XHR_FACTORY',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `material-upload.service.ts:15`. If it's a log message, classify as equivalent.

**Cluster 28** (lines 43 — `toLowerCase()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

Sample mutation:
```diff
- const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : '';
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `material-upload.service.ts:43` in `toLowerCase` with assertions that distinguish the outcomes.

**Cluster 29** (lines 66 — `errorMessage()`): 1 mutant surviving — ArrayDeclaration×1

Sample mutation:
```diff
- private readonly _failures = signal<MaterialUploadFailure[]>([]);
+ <replaced with: ["Stryker was here"]>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `material-upload.service.ts:66` in `errorMessage`, not just truthiness.

**Cluster 30** (lines 99–102 — `catch()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- this.api.createUploadUrl(ctx.courseId, ctx.moduleId, ctx.lessonId, {
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `material-upload.service.ts:99` in `catch`, not just truthiness.

**Cluster 31** (lines 109 — `if()`): 1 mutant surviving — EqualityOperator×1

Sample mutation:
```diff
- if (status < 200 || status >= 300) {
+ <replaced with: status > 300>
```

_Diagnosis._ An equality / inequality operator could be flipped (`==`↔`!=`, `===`↔`!==`) and tests still pass. Test both equal and unequal inputs at the boundary.

_Recommended test._ Add a boundary test that exercises the equal / off-by-one case at `material-upload.service.ts:109` in `if`.

**Cluster 32** (lines 134 — `catch()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `material-upload.service.ts:134` in `catch` with assertions that distinguish the outcomes.

**Cluster 33** (lines 144 — `setProgress()`): 2 mutants surviving — ArrowFunction×1, ConditionalExpression×1

Sample mutation:
```diff
- ...list.filter((p) => p.filename !== filename),
+ <replaced with: () => undefined>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing. The function is called but its effect isn't asserted.

_Recommended test._ Add an assertion on the side effect of the block/function at `material-upload.service.ts:144` in `setProgress` — verify state change, mock invocation, or returned value.

**Cluster 34** (lines 150 — `clearProgress()`): 2 mutants surviving — ArrowFunction×1, ConditionalExpression×1

Sample mutation:
```diff
- this._inFlight.update((list) => list.filter((p) => p.filename !== filename));
+ <replaced with: () => undefined>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing. The function is called but its effect isn't asserted.

_Recommended test._ Add an assertion on the side effect of the block/function at `material-upload.service.ts:150` in `clearProgress` — verify state change, mock invocation, or returned value.

### `src/lib/course-create-page/course-create-page.component.ts` — 9 surviving mutants

**Cluster 35** (lines 34–38): 5 mutants surviving — StringLiteral×2, ArrayDeclaration×3

Sample mutation:
```diff
- title: ['', [Validators.required, Validators.maxLength(100)]],
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `course-create-page.component.ts:34`, not just truthiness.

**Cluster 36** (lines 72–82 — `handleSubmitError()`): 4 mutants surviving — ConditionalExpression×1, BlockStatement×1, OptionalChaining×2

Sample mutation:
```diff
- if (!(err instanceof HttpErrorResponse)) {
+ <replaced with: false>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `course-create-page.component.ts:72` in `handleSubmitError`.

### `src/lib/cover/course-cover.service.ts` — 6 surviving mutants

**Cluster 37** (lines 8): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- const ALLOWED_MIME = new Set(['image/jpeg', 'image/png']);
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `course-cover.service.ts:8`. If it's a log message, classify as equivalent.

**Cluster 38** (lines 25 — `if()`): 1 mutant surviving — EqualityOperator×1

Sample mutation:
```diff
- if (file.size > MAX_BYTES) {
+ <replaced with: file.size >= MAX_BYTES>
```

_Diagnosis._ An equality / inequality operator could be flipped (`==`↔`!=`, `===`↔`!==`) and tests still pass. Test both equal and unequal inputs at the boundary.

_Recommended test._ Add a boundary test that exercises the equal / off-by-one case at `course-cover.service.ts:25` in `if`.

**Cluster 39** (lines 35–37 — `upload()`): 2 mutants surviving — ObjectLiteral×1, BooleanLiteral×1

Sample mutation:
```diff
- this.http.put<UploadCoverResult>(`/api/courses/${courseId}/cover`, form, {
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `course-cover.service.ts:35` in `upload`, not just truthiness.

**Cluster 40** (lines 43 — `remove()`): 2 mutants surviving — ObjectLiteral×1, BooleanLiteral×1

Sample mutation:
```diff
- this.http.delete<void>(`/api/courses/${courseId}/cover`, { withCredentials: true }),
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `course-cover.service.ts:43` in `remove`, not just truthiness.

### `src/lib/components/course-meta-panel/course-meta-panel.component.ts` — 3 surviving mutants

**Cluster 41** (lines 21–22): 2 mutants surviving — StringLiteral×2

Sample mutation:
```diff
- readonly draftTitle = signal('');
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `course-meta-panel.component.ts:21`. If it's a log message, classify as equivalent.

**Cluster 42** (lines 36–39 — `syncDrafts()`): 1 mutant surviving — BlockStatement×1

Sample mutation:
```diff
- syncDrafts(): void {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `course-meta-panel.component.ts:36` in `syncDrafts` — verify state change, mock invocation, or returned value.

### `src/lib/components/lesson-item/lesson-item.component.ts` — 3 surviving mutants

**Cluster 43** (lines 47): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- readonly draftTitle = signal('');
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `lesson-item.component.ts:47`. If it's a log message, classify as equivalent.

**Cluster 44** (lines 54 — `if()`): 1 mutant surviving — ArrowFunction×1

Sample mutation:
```diff
- untracked(() => this.video.set(undefined));
+ <replaced with: () => undefined>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing. The function is called but its effect isn't asserted.

_Recommended test._ Add an assertion on the side effect of the block/function at `lesson-item.component.ts:54` in `if` — verify state change, mock invocation, or returned value.

**Cluster 45** (lines 61 — `if()`): 1 mutant surviving — ArrowFunction×1

Sample mutation:
```diff
- error: () => this.video.set(undefined),
+ <replaced with: () => undefined>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing. The function is called but its effect isn't asserted.

_Recommended test._ Add an assertion on the side effect of the block/function at `lesson-item.component.ts:61` in `if` — verify state change, mock invocation, or returned value.

### `src/lib/components/confirm-dialog/confirm-dialog.component.ts` — 2 surviving mutants

**Cluster 46** (lines 13–14): 2 mutants surviving — StringLiteral×2

Sample mutation:
```diff
- readonly confirmLabel = input<string>('Delete');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `confirm-dialog.component.ts:13`. If it's a log message, classify as equivalent.

### `src/lib/publish/publish-eligibility.service.ts` — 2 surviving mutants

**Cluster 47** (lines 44–45 — `fetch()`): 2 mutants surviving — ConditionalExpression×1, BooleanLiteral×1

Sample mutation:
```diff
- if (!this.cid) return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `publish-eligibility.service.ts:44` in `fetch` with assertions that distinguish the outcomes.

### `src/lib/components/module-tree/module-tree.component.ts` — 1 surviving mutant

**Cluster 48** (lines 44 — `onDrop()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (event.previousIndex === event.currentIndex) return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `module-tree.component.ts:44` in `onDrop` with assertions that distinguish the outcomes.

### `src/lib/instructor-role.guard.ts` — 1 surviving mutant

**Cluster 49** (lines 10): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (auth.currentUser() === undefined) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `instructor-role.guard.ts:10` with assertions that distinguish the outcomes.

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

---

# `libs/web-learn`

**Raw score: 81.82%** · **Adjusted score: 82.04%** ⚪ (killed=297, survived=55, no-cov=11, ignored=0, equivalents=1). Covered-only: 84.38%.

Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/lesson-player-page/lesson-player-page.component.ts` | 76.8% | 199 | 49 | 11 |
| `src/lib/position-saver.ts` | 89.3% | 50 | 6 | 0 |
| `src/lib/course-outline-panel/course-outline-panel.component.ts` | 100.0% | 31 | 0 | 0 |
| `src/lib/learn.service.ts` | 100.0% | 17 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/lesson-player-page/lesson-player-page.component.ts` — 59 surviving mutants

**Cluster 1** (lines 63–73 — `formatBytes()`): 4 mutants surviving — StringLiteral×1, OptionalChaining×2, BooleanLiteral×1

Sample mutation:
```diff
- readonly state = signal<PageState>('LOADING');
+ <replaced with: "">
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `lesson-player-page.component.ts:63` in `formatBytes`.

**Cluster 2** (lines 79 — `rowState()`): 2 mutants surviving — ObjectLiteral×1, StringLiteral×1

Sample mutation:
```diff
- return this.materialRowState().get(id) ?? { status: 'idle' };
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `lesson-player-page.component.ts:79` in `rowState`, not just truthiness.

**Cluster 3** (lines 86–109 — `rowState()`): 18 mutants surviving — ConditionalExpression×6, StringLiteral×8, BooleanLiteral×2, EqualityOperator×1, OptionalChaining×1

Sample mutation:
```diff
- typeof window !== 'undefined'
+ <replaced with: true>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `lesson-player-page.component.ts:86` in `rowState`. If it's a log message, classify as equivalent.

**Cluster 4** (lines 130–132 — `if()`): 6 mutants surviving — ConditionalExpression×3, EqualityOperator×2, BlockStatement×1

Sample mutation:
```diff
- if (courseId === this.courseId && lessonId === this.lessonId && this.view() !== null) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `lesson-player-page.component.ts:130` in `if` with assertions that distinguish the outcomes.

**Cluster 5** (lines 145–148 — `if()`): 4 mutants surviving — ConditionalExpression×2, StringLiteral×2

Sample mutation:
```diff
- if (typeof window !== 'undefined') {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `lesson-player-page.component.ts:145` in `if` with assertions that distinguish the outcomes.

**Cluster 6** (lines 165–168 — `if()`): 2 mutants surviving — StringLiteral×1, ConditionalExpression×1

Sample mutation:
```diff
- this.state.set('PROCESSING');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `lesson-player-page.component.ts:165` in `if`. If it's a log message, classify as equivalent.

**Cluster 7** (lines 192 — `onLessonSelected()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- await this.saver?.flush();
+ <replaced with: this.saver.flush>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `lesson-player-page.component.ts:192` in `onLessonSelected`.

**Cluster 8** (lines 207–210 — `onMetadata()`): 3 mutants surviving — OptionalChaining×2, EqualityOperator×1

Sample mutation:
```diff
- const d = duration ?? this.playerRef?.playerEl?.nativeElement.duration ?? 0;
+ <replaced with: this.playerRef?.playerEl.nativeElement>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `lesson-player-page.component.ts:207` in `onMetadata`.

**Cluster 9** (lines 218–220 — `onPlayed()`): 5 mutants surviving — ConditionalExpression×1, LogicalOperator×1, OptionalChaining×2, ArrowFunction×1

Sample mutation:
```diff
- if (this.isOwnerPreview()) return;
+ <replaced with: false>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `lesson-player-page.component.ts:218` in `onPlayed`.

**Cluster 10** (lines 228 — `onEnded()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- void this.saver?.flush();
+ <replaced with: this.saver.flush>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `lesson-player-page.component.ts:228` in `onEnded`.

**Cluster 11** (lines 234–241 — `onSaverRevoked()`): 3 mutants surviving — OptionalChaining×2, BlockStatement×1

Sample mutation:
```diff
- this.saver?.stop();
+ <replaced with: this.saver.stop>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `lesson-player-page.component.ts:234` in `onSaverRevoked`.

**Cluster 12** (lines 254 — `onMarkComplete()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- lastWatchedSeconds: v.progress?.lastWatchedSeconds ?? 0,
+ <replaced with: v.progress.lastWatchedSeconds>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `lesson-player-page.component.ts:254` in `onMarkComplete`.

**Cluster 13** (lines 268–276 — `onDownloadMaterial()`): 5 mutants surviving — ObjectLiteral×2, StringLiteral×3

Sample mutation:
```diff
- this.setRow(matId, { status: 'preparing' });
+ <replaced with: {}>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `lesson-player-page.component.ts:268` in `onDownloadMaterial`. If it's a log message, classify as equivalent.

**Cluster 14** (lines 290–296 — `ensureSaver()`): 4 mutants surviving — ConditionalExpression×1, LogicalOperator×1, ObjectLiteral×1, ArrowFunction×1

Sample mutation:
```diff
- if (this.saver || this.isOwnerPreview()) return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `lesson-player-page.component.ts:290` in `ensureSaver` with assertions that distinguish the outcomes.

### `src/lib/position-saver.ts` — 6 surviving mutants

**Cluster 15** (lines 34–39 — `constructor()`): 2 mutants surviving — ConditionalExpression×2

Sample mutation:
```diff
- if (this.timer) return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `position-saver.ts:34` in `constructor` with assertions that distinguish the outcomes.

**Cluster 16** (lines 55 — `if()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

Sample mutation:
```diff
- if (!this.getTime || typeof navigator === 'undefined') return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `position-saver.ts:55` in `if` with assertions that distinguish the outcomes.

**Cluster 17** (lines 76 — `stop()`): 2 mutants surviving — ConditionalExpression×2

Sample mutation:
```diff
- if (this.timer) clearInterval(this.timer);
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `position-saver.ts:76` in `stop` with assertions that distinguish the outcomes.

## Equivalent-mutant candidates (excluded from adjusted score)

1 mutants flagged as likely equivalent — these are excluded from the **adjusted** score above. Reviewer should confirm each before treating the adjusted score as authoritative:

| File:line | Mutator | Reason |
|-----------|---------|--------|
| `src/lib/lesson-player-page/lesson-player-page.component.ts:194` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |

---

# `libs/web-profile`

**Raw score: 89.05%** · **Adjusted score: 89.05%** ⚪ (killed=252, survived=31, no-cov=0, ignored=0, equivalents=0). Covered-only: 89.05%.

Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/profile-page/profile-page.component.ts` | 84.1% | 143 | 27 | 0 |
| `src/lib/picture/profile-picture-uploader.component.ts` | 94.3% | 33 | 2 | 0 |
| `src/lib/picture/profile-picture.service.ts` | 95.7% | 44 | 2 | 0 |
| `src/lib/email/email-change.service.ts` | 100.0% | 4 | 0 | 0 |
| `src/lib/email/email-changed/email-changed.component.ts` | 100.0% | 22 | 0 | 0 |
| `src/lib/password/password-change.service.ts` | 100.0% | 2 | 0 | 0 |
| `src/lib/profile.service.ts` | 100.0% | 4 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/profile-page/profile-page.component.ts` — 27 surviving mutants

**Cluster 1** (lines 22–23 — `confirmMatchesValidator()`): 2 mutants surviving — OptionalChaining×2

Sample mutation:
```diff
- const np = control.get('newPassword')?.value;
+ <replaced with: control.get('newPassword').value>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `profile-page.component.ts:22` in `confirmMatchesValidator`.

**Cluster 2** (lines 44–57 — `confirmMatchesValidator()`): 10 mutants surviving — ArrayDeclaration×4, StringLiteral×6

Sample mutation:
```diff
- displayName: ['', [Validators.maxLength(80)]],
+ <replaced with: []>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `profile-page.component.ts:44` in `confirmMatchesValidator`. If it's a log message, classify as equivalent.

**Cluster 3** (lines 63–70 — `confirmMatchesValidator()`): 4 mutants surviving — StringLiteral×4

Sample mutation:
```diff
- currentPassword: ['', [Validators.required]],
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `profile-page.component.ts:63` in `confirmMatchesValidator`. If it's a log message, classify as equivalent.

**Cluster 4** (lines 76 — `confirmMatchesValidator()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- { initialValue: this.passwordForm.controls.newPassword.value },
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `profile-page.component.ts:76` in `confirmMatchesValidator`, not just truthiness.

**Cluster 5** (lines 84 — `confirmMatchesValidator()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- return policy?.unmet?.map((r) => PASSWORD_REQUIREMENT_PROSE[r]) ?? [];
+ <replaced with: policy?.unmet.map>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `profile-page.component.ts:84` in `confirmMatchesValidator`.

**Cluster 6** (lines 111–114 — `applyEmailServerError()`): 3 mutants surviving — ConditionalExpression×1, OptionalChaining×2

Sample mutation:
```diff
- if (!(err instanceof HttpErrorResponse)) return;
+ <replaced with: false>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `profile-page.component.ts:111` in `applyEmailServerError`.

**Cluster 7** (lines 147–148 — `applyPasswordServerError()`): 4 mutants surviving — OptionalChaining×4

Sample mutation:
```diff
- const code = body?.error?.code;
+ <replaced with: body?.error.code>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `profile-page.component.ts:147` in `applyPasswordServerError`.

**Cluster 8** (lines 183 — `applyServerError()`): 2 mutants surviving — OptionalChaining×2

Sample mutation:
```diff
- if (body?.error?.code !== 'PROFILE_INVALID' || !body.error.details) return;
+ <replaced with: body?.error.code>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `profile-page.component.ts:183` in `applyServerError`.

### `src/lib/picture/profile-picture-uploader.component.ts` — 2 surviving mutants

**Cluster 9** (lines 22): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- readonly state = signal<UploaderState>('idle');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `profile-picture-uploader.component.ts:22`. If it's a log message, classify as equivalent.

**Cluster 10** (lines 46 — `onRemove()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- this.state.set('uploading');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `profile-picture-uploader.component.ts:46` in `onRemove`. If it's a log message, classify as equivalent.

### `src/lib/picture/profile-picture.service.ts` — 2 surviving mutants

**Cluster 11** (lines 20): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- this.name = 'ProfilePictureError';
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `profile-picture.service.ts:20`. If it's a log message, classify as equivalent.

**Cluster 12** (lines 65 — `if()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- if (err instanceof HttpErrorResponse && err.error?.error?.code) {
+ <replaced with: err.error.error>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `profile-picture.service.ts:65` in `if`.

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

---

# `libs/web-video`

**Raw score: 89.64%** · **Adjusted score: 89.64%** ⚪ (killed=346, survived=34, no-cov=6, ignored=0, equivalents=0). Covered-only: 91.05%.

Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/polling/video-state-polling.service.ts` | 76.0% | 19 | 6 | 0 |
| `src/lib/player/video-player.service.ts` | 83.0% | 39 | 8 | 0 |
| `src/lib/upload/video-upload.service.ts` | 89.8% | 159 | 16 | 2 |
| `src/lib/upload/video-upload.component.ts` | 90.9% | 10 | 1 | 0 |
| `src/lib/video-state-badge.component.ts` | 92.6% | 75 | 2 | 4 |
| `src/lib/player/video-player.component.ts` | 97.0% | 32 | 1 | 0 |
| `src/lib/video.service.ts` | 100.0% | 12 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/upload/video-upload.service.ts` — 18 surviving mutants

**Cluster 1** (lines 15–18): 5 mutants surviving — StringLiteral×2, ObjectLiteral×1, ArrowFunction×2

Sample mutation:
```diff
- export const XHR_FACTORY = new InjectionToken<() => XMLHttpRequest>('XHR_FACTORY', {
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video-upload.service.ts:15`. If it's a log message, classify as equivalent.

**Cluster 2** (lines 24): 1 mutant surviving — ArrayDeclaration×1

Sample mutation:
```diff
- const BACKOFF_MS = [1000, 2000, 4000];
+ <replaced with: []>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `video-upload.service.ts:24`, not just truthiness.

**Cluster 3** (lines 47): 1 mutant surviving — BooleanLiteral×1

Sample mutation:
```diff
- private aborted = false;
+ <replaced with: true>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `video-upload.service.ts:47` with assertions that distinguish the outcomes.

**Cluster 4** (lines 99 — `if()`): 2 mutants surviving — ObjectLiteral×1, StringLiteral×1

Sample mutation:
```diff
- this._state.set({ kind: 'finalizing', videoId });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `video-upload.service.ts:99` in `if`, not just truthiness.

**Cluster 5** (lines 116–118 — `if()`): 4 mutants surviving — ConditionalExpression×1, StringLiteral×2, ObjectLiteral×1

Sample mutation:
```diff
- if (s.kind === 'uploading' || s.kind === 'finalizing' || s.kind === 'failed') {
+ <replaced with: false>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video-upload.service.ts:116` in `if`. If it's a log message, classify as equivalent.

**Cluster 6** (lines 128 — `retry()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (s.kind !== 'failed' || !s.videoId) return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `video-upload.service.ts:128` in `retry` with assertions that distinguish the outcomes.

**Cluster 7** (lines 165–168 — `for()`): 2 mutants surviving — BooleanLiteral×1, LogicalOperator×1

Sample mutation:
```diff
- if (this.aborted) return false;
+ <replaced with: true>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `video-upload.service.ts:165` in `for` with assertions that distinguish the outcomes.

**Cluster 8** (lines 182 — `if()`): 1 mutant surviving — BooleanLiteral×1

Sample mutation:
```diff
- return false;
+ <replaced with: true>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `video-upload.service.ts:182` in `if` with assertions that distinguish the outcomes.

**Cluster 9** (lines 209 — `errorMessage()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- typeof err === 'object' && err !== null && 'message' in err
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `video-upload.service.ts:209` in `errorMessage` with assertions that distinguish the outcomes.

### `src/lib/player/video-player.service.ts` — 8 surviving mutants

**Cluster 10** (lines 12–15 — `dispose()`): 4 mutants surviving — StringLiteral×2, ObjectLiteral×1, ArrowFunction×1

Sample mutation:
```diff
- export const HLS_CONSTRUCTOR = new InjectionToken<typeof HlsImport>('HLS_CONSTRUCTOR', {
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video-player.service.ts:12` in `dispose`. If it's a log message, classify as equivalent.

**Cluster 11** (lines 59 — `switch()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- el.removeAttribute('src');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video-player.service.ts:59` in `switch`. If it's a log message, classify as equivalent.

**Cluster 12** (lines 65 — `switch()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- if (el.canPlayType('application/vnd.apple.mpegurl')) {
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video-player.service.ts:65` in `switch`. If it's a log message, classify as equivalent.

**Cluster 13** (lines 71 — `handler()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- el.removeEventListener('error', handler);
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video-player.service.ts:71` in `handler`. If it's a log message, classify as equivalent.

**Cluster 14** (lines 79 — `handler()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- return { dispose: () => undefined };
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `video-player.service.ts:79` in `handler`, not just truthiness.

### `src/lib/video-state-badge.component.ts` — 6 surviving mutants

**Cluster 15** (lines 42–43 — `switch()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

Sample mutation:
```diff
- default:
+ <replaced with: default:>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `video-state-badge.component.ts:42` in `switch` with assertions that distinguish the outcomes.

**Cluster 16** (lines 60–61 — `switch()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

Sample mutation:
```diff
- default:
+ <replaced with: default:>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `video-state-badge.component.ts:60` in `switch` with assertions that distinguish the outcomes.

**Cluster 17** (lines 72 — `ngOnInit()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (NON_TERMINAL.includes(v.state)) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `video-state-badge.component.ts:72` in `ngOnInit` with assertions that distinguish the outcomes.

**Cluster 18** (lines 89 — `isStuck()`): 1 mutant surviving — EqualityOperator×1

Sample mutation:
```diff
- return ageMs > STUCK_THRESHOLD_MIN * 60 * 1000;
+ <replaced with: ageMs >= STUCK_THRESHOLD_MIN * 60 * 1000>
```

_Diagnosis._ An equality / inequality operator could be flipped (`==`↔`!=`, `===`↔`!==`) and tests still pass. Test both equal and unequal inputs at the boundary.

_Recommended test._ Add a boundary test that exercises the equal / off-by-one case at `video-state-badge.component.ts:89` in `isStuck`.

### `src/lib/polling/video-state-polling.service.ts` — 6 surviving mutants

**Cluster 19** (lines 10): 2 mutants surviving — ArithmeticOperator×2

Sample mutation:
```diff
- const DEFAULT_CAP_MS = 30 * 60 * 1_000;
+ <replaced with: 30 * 60 / 1_000>
```

_Diagnosis._ An arithmetic operator could be replaced. Pin the math with a deterministic input/output pair.

_Recommended test._ Inspect `video-state-polling.service.ts:10` and add an assertion that distinguishes the original from the surviving mutation.

**Cluster 20** (lines 26–33 — `fetch()`): 4 mutants surviving — ObjectLiteral×1, BooleanLiteral×1, ConditionalExpression×1, EqualityOperator×1

Sample mutation:
```diff
- this.http.get<Video>(`/api/videos/${vid}`, { withCredentials: true });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `video-state-polling.service.ts:26` in `fetch`, not just truthiness.

### `src/lib/player/video-player.component.ts` — 1 surviving mutant

**Cluster 21** (lines 58 — `retry()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- this.handle?.dispose();
+ <replaced with: this.handle.dispose>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `video-player.component.ts:58` in `retry`.

### `src/lib/upload/video-upload.component.ts` — 1 surviving mutant

**Cluster 22** (lines 31 — `onFile()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- { courseId: this.courseId(), moduleId: this.moduleId(), lessonId: this.lessonId() },
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `video-upload.component.ts:31` in `onFile`, not just truthiness.

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

---

## Caveats

- **Scope is per-lib Stryker config.** Each `stryker.<lib>.config.mjs` controls what gets mutated. Excluded paths (DTOs, modules, barrel exports, type-only files) are listed there.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line. Tests that exercise the line via dynamic dispatch may be missed.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes — CRAP's coverage data should agree these are gaps.
- **Equivalent classification is heuristic.** The "candidates" lists per lib flag strings inside logger calls, Logger names, and catch-only-logging blocks. Review each before treating the adjusted score as authoritative. To make a candidate permanent, either add a `// Stryker disable next-line all` comment above the line in source, or accept the heuristic and move on.
- **Test quality is real but bounded.** A surviving mutant means an assertion is missing for the *code as written*. If the code is wrong and tests pin the wrong behavior, mutation testing won't catch it.
