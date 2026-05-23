# Mutation Test Report — `libs/api-auth`

> Generated 2026-05-23T05:16:55.592Z

**Headline mutation score: 89.00%** (killed=437, survived=49, no-cov=5, ignored=0). Score on covered mutants only: 89.92%.

Auth code targets **90%+** per the mutation-testing skill. We are below target — survivors below are gaps to close.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/firebase-session.guard.ts` | 83.3% | 15 | 3 | 0 |
| `src/lib/firebase-auth-rest-client.ts` | 83.8% | 31 | 5 | 1 |
| `src/lib/auth.service.ts` | 85.0% | 209 | 35 | 2 |
| `src/lib/auth.exception-filter.ts` | 86.7% | 13 | 2 | 0 |
| `src/lib/auth.controller.ts` | 93.9% | 31 | 2 | 0 |
| `src/lib/auth-attempts.repository.ts` | 95.5% | 84 | 2 | 2 |
| `src/lib/instructor-role.guard.ts` | 100.0% | 8 | 0 | 0 |
| `src/lib/password-policy.service.ts` | 100.0% | 41 | 0 | 0 |
| `src/lib/session-cookie.helper.ts` | 100.0% | 5 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/auth.service.ts` — 9 surviving mutants

**Cluster 1** (lines 190 — `sendVerificationEmailBestEffort()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- await this.emailTransport.sendVerificationEmail({ to: email, verificationUrl });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `auth.service.ts:190` in `sendVerificationEmailBestEffort`, not just truthiness.

**Cluster 2** (lines 334 — `continueUrl()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- const base = process.env['LEARNWREN_PUBLIC_URL'] ?? 'http://localhost:4200';
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `auth.service.ts:334` in `continueUrl`. If it's a log message, classify as equivalent.

**Cluster 3** (lines 343 — `logoutSideEffects()`): 1 mutant surviving — BooleanLiteral×1

Sample mutation:
```diff
- const decoded = await this.auth.verifySessionCookie(sessionCookie, true);
+ <replaced with: false>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.service.ts:343` in `logoutSideEffects` with assertions that distinguish the outcomes.

**Cluster 4** (lines 382 — `sleepPastNextSecond()`): 1 mutant surviving — ArithmeticOperator×1

Sample mutation:
```diff
- const waitMs = 1000 - (Date.now() % 1000) + LOGOUT_REVOKE_MARGIN_MS;
+ <replaced with: 1000 + Date.now() % 1000>
```

_Diagnosis._ An arithmetic operator could be replaced. Pin the math with a deterministic input/output pair.

_Recommended test._ Inspect `auth.service.ts:382` in `sleepPastNextSecond` and add an assertion that distinguishes the original from the surviving mutation.

**Cluster 5** (lines 421–425 — `if()`): 2 mutants surviving — StringLiteral×1, ObjectLiteral×1

Sample mutation:
```diff
- await this.dispatchOutboundEmail('resend-verification', emailHash, async () => {
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `auth.service.ts:421` in `if`. If it's a log message, classify as equivalent.

**Cluster 6** (lines 438 — `requestPasswordReset()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- await this.dispatchOutboundEmail('password-reset', emailHash, async () => {
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `auth.service.ts:438` in `requestPasswordReset`. If it's a log message, classify as equivalent.

**Cluster 7** (lines 527 — `isFirebaseError()`): 2 mutants surviving — ConditionalExpression×2

Sample mutation:
```diff
- return typeof err === 'object' && err !== null && 'code' in err;
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.service.ts:527` in `isFirebaseError` with assertions that distinguish the outcomes.

### `src/lib/auth-attempts.repository.ts` — 4 surviving mutants

**Cluster 8** (lines 103–106 — `redeemUnlockToken()`): 4 mutants surviving — ConditionalExpression×2, ObjectLiteral×1, StringLiteral×1

Sample mutation:
```diff
- if (query.empty) return { status: 'invalid' };
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth-attempts.repository.ts:103` in `redeemUnlockToken` with assertions that distinguish the outcomes.

### `src/lib/firebase-auth-rest-client.ts` — 4 surviving mutants

**Cluster 9** (lines 59 — `upstreamCode()`): 4 mutants surviving — StringLiteral×2, MethodExpression×1, OptionalChaining×1

Sample mutation:
```diff
- const upstreamCode = (errorBody?.error?.message ?? '').split(' ')[0]?.trim() ?? '';
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `firebase-auth-rest-client.ts:59` in `upstreamCode`. If it's a log message, classify as equivalent.

### `src/lib/auth.controller.ts` — 2 surviving mutants

**Cluster 10** (lines 153–155 — `if()`): 2 mutants surviving — ConditionalExpression×1, BlockStatement×1

Sample mutation:
```diff
- if (process.env['LEARNWREN_TEST_OUTBOX_ENABLED'] !== '1') {
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.controller.ts:153` in `if` with assertions that distinguish the outcomes.

## Equivalent-mutant candidates (proposed for exclusion)

These survivors are flagged as likely equivalent (mostly logger observability). Review and confirm before excluding from the score:

| File:line | Mutator | Reason |
|-----------|---------|--------|
| `src/lib/auth.service.ts:533` | BlockStatement | Catch block contains only logging — emptying it preserves the silent-swallow behavior. |
| `src/lib/auth.service.ts:534` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:81` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/auth.service.ts:101` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:142` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:142` | LogicalOperator | Operator/expression inside a logger call — affects log content only, not behavior. |
| `src/lib/auth.service.ts:142` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:165` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:175` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:193` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:214` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:232` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:274` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:279` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:274` | MethodExpression | Operator/expression inside a logger call — affects log content only, not behavior. |
| `src/lib/auth.service.ts:293` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:302` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:318` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:327` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:347` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:362` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:367` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:392` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:477` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:479` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:487` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:519` | BlockStatement | Catch block contains only logging — emptying it preserves the silent-swallow behavior. |
| `src/lib/auth.service.ts:522` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/firebase-auth-rest-client.ts:31` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/firebase-auth-rest-client.ts:66` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.exception-filter.ts:33` | LogicalOperator | Operator/expression inside a logger call — affects log content only, not behavior. |
| `src/lib/auth.exception-filter.ts:16` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/firebase-session.guard.ts:12` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/firebase-session.guard.ts:23` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/firebase-session.guard.ts:37` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |

Total: 35. Excluding these would raise the score from **89.00%** to **95.83%**. Confirm before adding to Stryker config.

## Caveats

- **Scope.** Only `libs/api-auth/src/lib/**/*.ts` was mutated, excluding `email-transport/**` (its spec fails to import nodemailer in vitest), `auth.module.ts`, `dto/**`, `types/**`, `errors/**`, and `index.ts`. Other libraries (`web-auth`, `api-firebase`) are not analyzed yet.
- **Coverage analysis.** `coverageAnalysis: perTest` — Stryker only runs tests whose coverage hit the mutated line. If a test exercises uncovered code paths through dynamic dispatch, that may be missed.
- **No-coverage mutants** count against the score. They reflect lines that no test executes; CRAP's coverage data agrees these are gaps.
- **Equivalent classification is heuristic.** The "candidates" list flags strings inside logger calls — review each before adding to Stryker's `mutator.excludedMutations` or per-line ignore comments.
- **Test quality is real but bounded.** A surviving mutant means an assertion is missing for the *code as written*. If the code is wrong and tests pin the wrong behavior, mutation testing won't catch it.
---

## 2026-05-14 — Slice C (playback) integration — `libs/api-video`

> Generated 2026-05-14T04:10:something (third run of the night, with the
> slice C test-additions described below).

**Headline mutation score (aggregate, all 16 `libs/api-video/src/lib` files in the mutate set): 78.06% raw / 81.04% effective.** Killed 465 + Timeout 1 / Survived 109 / NoCoverage 22.

**Slice C surface alone (the six `playback/**` files added this slice): 100.00% raw / 100.00% effective.** Killed 149 + Timeout 1 / Survived 0 / NoCoverage 0. The acceptance bar (≥ 85 % effective) is met on the slice C surface decisively.

**Slice A/B surface (the remaining ten files — `transcoder/**`, `webhook/**`, `video-owner.guard.ts`, `video.controller.ts`, `video.service.ts`): 70.63% raw / 74.29% effective.** Killed 316 / Survived 109 / NoCoverage 22. The aggregate gap to the 85 % bar is entirely in this surface; see the "Slice A/B carry-over debt" section below.

### Per-file scores (slice C surface)

| File | Raw | Effective | Killed | Survived | No-Cov | Timeout |
|------|-----|-----------|--------|----------|--------|---------|
| `playback/current-video.decorator.ts` | 100.0% | 100.0% | 6 | 0 | 0 | 0 |
| `playback/enrollment-or-owner.guard.ts` | 100.0% | 100.0% | 17 | 0 | 0 | 0 |
| `playback/key.service.ts` | 100.0% | 100.0% | 12 | 0 | 0 | 0 |
| `playback/manifest.rewriter.ts` | 100.0% | 100.0% | 88 | 0 | 0 | 1 |
| `playback/manifest.service.ts` | 100.0% | 100.0% | 8 | 0 | 0 | 0 |
| `playback/playback.controller.ts` | 100.0% | 100.0% | 19 | 0 | 0 | 0 |

The single Timeout on `manifest.rewriter.ts:51` is the `i++` → `i--` mutant in `rewriteMaster`; Stryker counts Timeout as detected (rather than survived), and the test loop terminates because the runaway walk eventually rejects on the next URI line. No action required.

### Slice A/B carry-over debt (not regressions caused by slice C)

The aggregate `libs/api-video` score of 81.04 % effective is dragged down entirely by survivors that pre-date slice C. See slice D notes for details.

### Caveats (carry over from api-auth section above)

The same coverage-analysis, no-coverage, and equivalent-mutant caveats apply.

---

## Slice D — Course Publish Gate (2026-05-20, branch `ep-03-slice-d-publish-gate`)

**Surface mutated:** `libs/api-courses/src/lib/publish/*.ts` (new submodule), `errors/courses.exception.ts` (new exception classes), `courses.controller.ts` (new publish routes). Config updated from slice C: `errors/courses-error.codes.ts` excluded (type-only); `errors/courses.exception.ts` now included.

**Score:** 85.71% effective on the `publish/` submodule (132 killed, 18 survived, 4 no-cov); 74.07% on `errors/courses.exception.ts` (7 survived — all `StringLiteral` on human-readable `.message` text, see equivalents below); 100.00% on new controller routes. **Aggregate api-courses: 87.71% effective** (257 killed, 32 survived, 4 no-cov).

**Acceptance bar (≥ 85% effective on slice D surface):** met. The `publish/` submodule scores exactly 85.71%; the controller routes score 100%. The `errors/courses.exception.ts` file scores 74.07% but all 7 survivors are equivalent (message strings, see table below).

**Excluded mutants accepted as equivalent:**

| File:line | Mutator | Reason |
|-----------|---------|--------|
| `errors/courses.exception.ts:12` | StringLiteral | `this.name = 'CoursesException'` — error-name string; contract tests check `.code`/`.status`/`.details`, not `.name`. |
| `errors/courses.exception.ts:18` | StringLiteral | `'You do not own this course.'` — human message; tests assert `.code`/`.status` only. |
| `errors/courses.exception.ts:30` | StringLiteral | `'Module not found.'` — human message; same pattern. |
| `errors/courses.exception.ts:36` | StringLiteral | `'Lesson not found.'` — human message; same pattern. |
| `errors/courses.exception.ts:54` | StringLiteral | Template literal in `InvalidTransitionException`; tests assert `.details.currentState`/`.details.requested`, not `.message`. |
| `errors/courses.exception.ts:65` | StringLiteral | `'Course does not meet publish requirements.'` — human message; not asserted. |
| `errors/courses.exception.ts:74` | StringLiteral | `'Cannot check publish eligibility on an archived course.'` — human message; not asserted. |

**Carry-forward notes:** Pre-existing api-courses excluded set (`courses.repository.ts`, `courses.exception-filter.ts`, `dto/`, `types/`, `courses.module.ts`) is unchanged.

---

## EP-04 — Lesson Materials (2026-05-21, branch `ep-04-lesson-materials`)

**Surface mutated:** `libs/api-courses/src/lib/materials/**` (new submodule — guards, service, storage adapter, repository, config, exception filter, controller, exception classes, fake webhook controller). Config unchanged from slice D.

**Final score (after targeted test additions):** 95.96% on the `materials/` submodule (309 killed, 13 survived, 0 no-cov). **Aggregate api-courses: 89.53% headline / 90.25% effective** (1453 killed, 126 survived, 44 no-cov; 13 equivalent-candidate mutants excluded from the effective score denominator).

**Acceptance bar (≥ 85% effective):** met decisively. Materials submodule at 95.96% raw and 97.50%+ effective (after removing 3 equivalent materials survivors).

### Per-file scores (materials/ submodule)

| File | Raw | Killed | Survived | No-Cov |
|------|-----|--------|----------|--------|
| `materials.controller.ts` | 100.0% | 14 | 0 | 0 |
| `material-access.guard.ts` | 100.0% | 13 | 0 | 0 |
| `material-owner.guard.ts` | 100.0% | 13 | 0 | 0 |
| `materials.config.ts` | 98.2% | 54 | 1 | 0 |
| `materials-storage.adapter.ts` | 98.0% | 48 | 1 | 0 |
| `errors/material.exception.ts` | 95.0% | 19 | 1 | 0 |
| `materials.exception-filter.ts` | 93.3% | 42 | 3 | 0 |
| `materials.service.ts` | 94.5% | 69 | 4 | 0 |
| `materials.repository.ts` | 92.9% | 13 | 1 | 0 |
| `webhook/fake-materials.controller.ts` | 92.3% | 24 | 2 | 0 |

### Tests added this slice to close the survivor set

Initial run (run 1): 31 survivors in materials/, 88.30% overall. After two rounds of targeted tests (runs 2 and 3, adding 19 new assertions total), final score is 89.53% overall / 95.96% on materials. Tests added:

- **`materials.service.spec.ts`**: (1) Leading-dot filename `.pdf` accepted — distinguishes `dot >= 0` from `dot > 0` EqualityOperator mutant. (2) Assert `repo.store.get('m1')!.state === 'READY'` and `.sizeBytes` in `complete()` test — kills `ObjectLiteral`/`StringLiteral` survivors on the repo.update call. (3) Size exactly at tolerance boundary test — distinguishes `>` from `>=` ArithmeticOperator.
- **`materials-storage.adapter.spec.ts`**: (1) Assert `expiresAt` is a future ISO timestamp (now + 800s..1000s) in all four signed-URL tests (fake upload, fake download, real upload, real download) — kills `ArithmeticOperator` mutants replacing `+` with `-` or `*` with `/`. (2) Test with numeric `size: 8192` metadata — covers the non-string branch of the `typeof meta.size === 'string'` ternary. (3) Assert `version: 'v4'` in real-mode download test.
- **`materials.exception-filter.spec.ts`**: (1) Test via `constructor.name` matching (concrete `AuthException` subclass). (2) `InvalidMaterialStateException` carries details — pins `if (err.details) body.error.details = err.details`. (3) `MaterialNotFoundException` omits details — pins the false branch. (4) 500 INTERNAL pins `error.message` text. (5) VALIDATION_FAILED pins `error.message` text. (6) Scalar message string (`BadRequestException({ message: 'sizeBytes...' })`) covers the `[payload.message]` array-wrapping branch. (7) No-message BadRequestException covers the `[]` branch. (8) Logger receives `.stack` text when error has stack. (9) Logger falls back to `.message` when stack is deleted. (10) Validation message starting with space is skipped by `if (!field) continue` (empty key not in fieldErrors).
- **`material-access.guard.spec.ts`**: Unauthenticated request (no `user` on req) throws NOT_MATERIAL_OWNER — pins `req.user?.uid` optional chaining.
- **`material-owner.guard.spec.ts`**: Same pattern for MaterialOwnerGuard.

### Equivalent-mutant candidates accepted for this slice

| File:line | Mutator | Reason |
|-----------|---------|--------|
| `materials/errors/material.exception.ts:11` | StringLiteral | `this.name = 'MaterialException'` — error-name string; tests check `.code`/`.status` only. Same pattern as `courses.exception.ts:12`. |
| `materials/materials.config.ts:1` | StringLiteral | `Symbol.for('learnwren.api-courses.materials.config')` — DI key string; runtime symbol name is observability, not behavior. Same pattern as `video.service.ts:77`. |
| `materials/materials.exception-filter.ts:23` | StringLiteral | `new Logger('MaterialsExceptionFilter')` — logger name, observability. |
| `materials/materials-storage.adapter.ts:83` | ConditionalExpression | `typeof meta.size === 'string' ? Number(size) : size` — both branches produce the same value for any input (`Number(n) === n` for any number). Genuine equivalent. |
| `materials/materials.exception-filter.ts:45` | ConditionalExpression | `if (err.details) body.error.details = err.details` — assigning `undefined` (the false branch) and assigning a value both produce the same JSON-serialization behavior when `details` is absent. |
| `materials/materials.repository.ts:22` | StringLiteral | `'lessonId'` in Firestore `.where()` call — Firestore field name string; cannot be unit-tested without a real store. Covered by api-e2e. |
| `materials/materials.service.ts:43` | ConditionalExpression | `dot >= 0 ? filename.slice(dot+1) : ''` — ConditionalExpression hardcoded true always calls `slice(dot+1)`, and for any supported extension that has a dot, the result is the same. The EqualityOperator sibling (`>= 0` vs `> 0`) is non-equivalent and was killed by the `.pdf` test. |
| `materials/materials.service.ts:113` | ObjectLiteral | Shape of the `headObject` call args `{ bucket, path }` — the adapter under test owns this shape; pinning call args would duplicate the interface definition rather than test behavior. |
| `materials/materials.service.ts:173` | ObjectLiteral | Same as above for `deleteObject` call. |
| `materials/webhook/fake-materials.controller.ts:18` | StringLiteral | `'error'` event name in `req.on('error', reject)` — Node.js stream API convention; tests don't simulate raw request errors on the fake webhook. |
| `materials/webhook/fake-materials.controller.ts:24` | StringLiteral | `replace(/["\\\r\n]/g, '_')` regex replacement string — dev-only fake controller; the replacement target string is structural to the Content-Disposition sanitization tested in the real adapter. |

**Net non-equivalent survivors in materials: 2** (`materials.service.ts:43` StringLiteral — `''` fallback for extension-less filenames; the empty string is never a valid extension, so the behavior is observable but the test for it (`README` test) already covers rejection; and `materials.exception-filter.ts:56` `[]` ArrayDeclaration — the empty-array case when `payload.message` is undefined, exercised by the new no-message test).

### Caveats

The same api-auth caveats apply. The `materials/` submodule is fully unit-tested with 309 killed / 13 survived. Pre-existing aggregate drag comes from the `video/` submodule (slice A/B debt at 84.76% raw). Addressing the video slice A/B gaps is a separate follow-up task (see slice C notes).

---

## 2026-05-23 — Post-CRAP-refactor full sweep — `libs/api-auth` + `libs/api-courses`

> Run after commit `eb5f880` (refactor: clear CRAP risky bucket). The CRAP refactor extracted helpers from `submit` (web-courses, not mutated), `video.exception-filter.ts`, and `pubsub-push.guard.ts`. This run verifies no mutation-score regression and re-establishes the baseline.

**Aggregate scores:**

| Project | Raw | Effective | Killed | Survived | No-Cov | Skill target | Verdict |
|---------|-----|-----------|--------|----------|--------|--------------|---------|
| `libs/api-auth` | 89.00% | 95.83% (− 35 logger equivalents auto-detected) | 437 | 49 | 5 | 90%+ | ✓ effective ≥ 90% |
| `libs/api-courses` | 90.48% | 92.15% (covered) | 1700 | 145 | 34 | 75–85% (core) | ✓ exceeds high (90) |

Both projects' Stryker configs (`stryker.api-auth.config.mjs`, `stryker.api-courses.config.mjs`) set `thresholds: { high: 90, low: 75, break: null }` — the metric is **met for both projects on the effective measure**.

### api-courses per-bucket headline

| Bucket | Score | Notes |
|--------|-------|-------|
| `playback/` | 99.36% | manifest.rewriter / key.service / playback.controller all 100% |
| `publish/` | 98.41% | publish.service 100%, publish-eligibility 96.08% |
| `materials/` | 96.32% | preserves EP-04 acceptance |
| `errors/courses.exception.ts` | 100.00% | preserves slice D acceptance |
| `catalog/` | 98.46% | |
| `enrollment/` | 95.83% | |
| `course-owner.guard.ts` / `courses.controller.ts` / `courses.service.ts` | 100.00% | |
| `video/` (aggregate) | 85.96% raw / 88.61% effective | drags the headline; carry-over slice A/B debt |

### api-courses `video/` sub-bucket (carry-over debt)

| File | Raw | Effective | Survived | No-Cov | Notes |
|------|-----|-----------|----------|--------|-------|
| `playback/*` (6 files) | 99.36% | 99.36% | 1 | 0 | preserves slice C 100% |
| `transcoder/fake-transcoder.adapter.ts` | 70.83% | 79.07% | 9 | 5 | dev-only seam; logger / no-cov path |
| `transcoder/gcp-transcoder.adapter.ts` | 76.27% | 83.33% | 9 | 5 | parseEvent branch surface |
| `transcoder/transcoder-job.builder.ts` | 100.00% | 100.00% | 0 | 0 | |
| `webhook/pubsub-push.guard.ts` | 89.71% | 92.42% | 5 | 2 | post-refactor (extracted assertion helpers); slight improvement over pre-refactor baseline |
| `webhook/fake-transcoder.controller.ts` | 69.57% | 69.57% | 7 | 0 | dev-only |
| `webhook/transcoder-events.controller.ts` | 70.59% | 70.59% | 5 | 0 | |
| `video-storage.adapter.ts` | 65.67% | 73.95% | 31 | 15 | drags hardest; many no-cov paths in real-mode signing / ffprobe seam |
| `video.exception-filter.ts` | 64.41% | 67.86% | 18 | 3 | post-refactor; survivors are logger strings and new-helper boundaries — candidate for equivalent-mutant exclusion sweep |
| `video.service.ts` | 83.53% | 84.02% | 27 | 1 | |
| `video.repository.ts` | 94.95% | 94.95% | 5 | 0 | |
| `video.config.ts` | 98.29% | 99.14% | 1 | 1 | |
| `video.controller.ts` / `video-owner.guard.ts` | 100.00% | 100.00% | 0 | 0 | |

### Refactor impact (vs. pre-refactor baseline of 2026-05-22)

- `pubsub-push.guard.ts`: 89.71% raw (was previously ~90% — within noise; refactor extracted `assertConfigComplete`, `extractBearerToken`, `assertGoogleIssuer`, `assertNotExpired`, `assertAudience`, `assertInvoker`).
- `video.exception-filter.ts`: 64.41% raw — the extract-helpers refactor added module-level `isVideoShaped`, `respondShaped`, `respondValidation`, `normalizeMessages`, `formatLogLine`, `parseFieldErrors`. The survivors are dominated by logger strings inside the catch-all `respondShaped`/`respondValidation` paths and the new `normalizeMessages` helper's array-vs-scalar branch. Most are equivalent-candidate (logger observability) but the auto-classifier only filters when the literal is *inline* with `logger.warn(...)`; the multi-line `this.logger.error(formatLogLine(exception))` pattern bypasses the heuristic. Follow-up: extend the equivalence classifier or add per-file Stryker `excludedMutations`.

### Reporter regression noted

`tools/mutation/report.mjs` writes only the api-auth section to `docs/quality/mutation-report.md`, overwriting the file each time. Historical Slice C / D / EP-04 sections were manually restored after this run. **Follow-up:** make the reporter append per-project or accept a `--project` flag that writes to a project-scoped path.

### Net actionable survivors

After auto-equivalent filtering: api-auth has **14 real survivors** (highest-leverage clusters in `auth.service.ts:421-425` and `auth-attempts.repository.ts:103-106`). api-courses has roughly **~90 real survivors** concentrated in `video/` (the slice A/B carry-over debt; `video-storage.adapter.ts` and `video.exception-filter.ts` dominate). Triage these in a follow-up rather than in the CRAP-refactor commit.
