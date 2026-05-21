# Mutation Test Report — `libs/api-auth`

> Generated 2026-05-14T02:41:52.983Z

**Headline mutation score: 89.13%** (killed=410, survived=45, no-cov=5, ignored=0). Score on covered mutants only: 90.11%.

Auth code targets **90%+** per the mutation-testing skill. We are below target — survivors below are gaps to close.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/firebase-session.guard.ts` | 83.3% | 15 | 3 | 0 |
| `src/lib/firebase-auth-rest-client.ts` | 83.8% | 31 | 5 | 1 |
| `src/lib/auth.service.ts` | 84.9% | 197 | 33 | 2 |
| `src/lib/auth.exception-filter.ts` | 86.7% | 13 | 2 | 0 |
| `src/lib/auth-attempts.repository.ts` | 95.3% | 81 | 2 | 2 |
| `src/lib/auth.controller.ts` | 100.0% | 19 | 0 | 0 |
| `src/lib/instructor-role.guard.ts` | 100.0% | 8 | 0 | 0 |
| `src/lib/password-policy.service.ts` | 100.0% | 41 | 0 | 0 |
| `src/lib/session-cookie.helper.ts` | 100.0% | 5 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/auth-attempts.repository.ts` — 4 surviving mutants

**Cluster 1** (lines 102–105 — `redeemUnlockToken()`): 4 mutants surviving — ConditionalExpression×2, ObjectLiteral×1, StringLiteral×1

Sample mutation:
```diff
- if (query.empty) return { status: 'invalid' };
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth-attempts.repository.ts:102` in `redeemUnlockToken` with assertions that distinguish the outcomes.

### `src/lib/auth.service.ts` — 4 surviving mutants

**Cluster 2** (lines 271 — `continueUrl()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- const base = process.env['LEARNWREN_PUBLIC_URL'] ?? 'http://localhost:4200';
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `auth.service.ts:271` in `continueUrl`. If it's a log message, classify as equivalent.

**Cluster 3** (lines 285 — `if()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (typeof cookieIatSec === 'number') {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.service.ts:285` in `if` with assertions that distinguish the outcomes.

**Cluster 4** (lines 433 — `isFirebaseError()`): 2 mutants surviving — ConditionalExpression×2

Sample mutation:
```diff
- return typeof err === 'object' && err !== null && 'code' in err;
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.service.ts:433` in `isFirebaseError` with assertions that distinguish the outcomes.

### `src/lib/firebase-auth-rest-client.ts` — 4 surviving mutants

**Cluster 5** (lines 59 — `upstreamCode()`): 4 mutants surviving — StringLiteral×2, MethodExpression×1, OptionalChaining×1

Sample mutation:
```diff
- const upstreamCode = (errorBody?.error?.message ?? '').split(' ')[0]?.trim() ?? '';
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `firebase-auth-rest-client.ts:59` in `upstreamCode`. If it's a log message, classify as equivalent.

## Equivalent-mutant candidates (proposed for exclusion)

These survivors are flagged as likely equivalent (mostly logger observability). Review and confirm before excluding from the score:

| File:line | Mutator | Reason |
|-----------|---------|--------|
| `src/lib/auth.service.ts:439` | BlockStatement | Catch block contains only logging — emptying it preserves the silent-swallow behavior. |
| `src/lib/auth.service.ts:440` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:75` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/auth.service.ts:112` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:112` | LogicalOperator | Operator/expression inside a logger call — affects log content only, not behavior. |
| `src/lib/auth.service.ts:112` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:130` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:138` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:150` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:164` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:169` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:202` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:202` | MethodExpression | Operator/expression inside a logger call — affects log content only, not behavior. |
| `src/lib/auth.service.ts:207` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:218` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:228` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:233` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:255` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:264` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:294` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:294` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:295` | BlockStatement | Catch block contains only logging — emptying it preserves the silent-swallow behavior. |
| `src/lib/auth.service.ts:296` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:306` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:350` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:353` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:380` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:383` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:393` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:425` | BlockStatement | Catch block contains only logging — emptying it preserves the silent-swallow behavior. |
| `src/lib/auth.service.ts:428` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/firebase-auth-rest-client.ts:31` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/firebase-auth-rest-client.ts:66` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.exception-filter.ts:33` | LogicalOperator | Operator/expression inside a logger call — affects log content only, not behavior. |
| `src/lib/auth.exception-filter.ts:16` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/firebase-session.guard.ts:12` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/firebase-session.guard.ts:23` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/firebase-session.guard.ts:37` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |

Total: 38. Excluding these would raise the score from **89.13%** to **97.16%**. Confirm before adding to Stryker config.

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

### Tests added this slice to close the survivor set

The initial slice C run reported `playback/**` at 88.74 % raw / 92.41 % effective with 12 survivors + 6 NoCoverage on `current-video.decorator.ts`. The following targeted tests were added in this commit to take the slice C surface to 100 % effective:

- **`playback/current-video.decorator.ts` (new file: `current-video.decorator.spec.ts`).** Refactored the inner `(_data, ctx) => Video` factory out of `createParamDecorator(...)` as a named export `currentVideoFactory`, then added four direct unit tests against the factory: happy path (`req.video` attached), missing-guard error path (throws), exact diagnostic message verbatim (pins the StringLiteral), and ignored-`data`-argument variant. Killed all 6 NoCoverage mutants on this file.
- **`playback/enrollment-or-owner.guard.spec.ts`.** Added two tests: one asserts `repo.getVideo` is NOT called when `:vid` is missing (pins the `if (!vid)` early-throw against the `false`-replacement ConditionalExpression mutant); the other passes a request with no `user` field at all and asserts `NotVideoOwnerException` (not a `TypeError`), pinning the `req.user?.uid` optional-chaining mutant.
- **`playback/key.service.spec.ts`.** Added two tests pinning the exact `KEY_LOOKUP_FAILED` messages (`/video has no keyId/` and `videoKeys/${id} missing`) against the string-literal/template-literal mutants.
- **`playback/manifest.rewriter.spec.ts`.** Added five tests:
  - Trims segment URIs before signing (defends `signSegment(line.trim())` against the `.trim()`-drop mutant).
  - Whitespace-only line is non-segment (defends `line.trim()` inside `isSegmentUri`).
  - Output joined by newlines (defends `out.join('\n')` against `''`).
  - Initial accumulator is empty (defends `out: string[] = []` against `["Stryker was here"]`).
  - Lookahead-URI trim against `lines[nextIdx]?.trim()` — asserts that `\t#EXT-X-ENDLIST` lookahead is rejected with the "expected URI line" message (vs the "cannot extract rendition name" message we'd get if `.trim()` were dropped).
  - Pin the exact "expected URI line after #EXT-X-STREAM-INF" diagnostic.
  - Distinguish `startsWith('#')` from `endsWith('#')` with a `bad#` URI.

Total new tests this slice: 15. All 203 `api-video` unit tests pass.

### Equivalent mutants (slice C)

None on the slice C surface. Every survivor on `playback/**` was killable with a behavioural test.

### Slice A/B carry-over debt (not regressions caused by slice C)

The aggregate `libs/api-video` score of 81.04 % effective is dragged down entirely by survivors that pre-date slice C:

| File | Raw | Effective | Survived | No-Cov |
|------|-----|-----------|----------|--------|
| `video.service.ts` | 64.9% | 69.0% | 49 | 10 |
| `webhook/pubsub-push.guard.ts` | 70.2% | 72.7% | 15 | 2 |
| `webhook/fake-transcoder.controller.ts` | 69.6% | 69.6% | 7 | 0 |
| `webhook/transcoder-events.controller.ts` | 70.6% | 70.6% | 5 | 0 |
| `transcoder/transcoder-job.builder.ts` | 75.0% | 75.0% | 12 | 0 |
| `transcoder/fake-transcoder.adapter.ts` | 70.8% | 79.1% | 9 | 5 |
| `transcoder/gcp-transcoder.adapter.ts` | 76.3% | 83.3% | 9 | 5 |
| `transcoder/transcoder.port.ts` | 0.0% | 0.0% | 1 | 0 |
| `video-owner.guard.ts` | 84.6% | 84.6% | 2 | 0 |
| `video.controller.ts` | 100.0% | 100.0% | 0 | 0 |

**About `video.service.ts`:** the per-file score moved from 83.1 % raw (prior run on May 14 00:26, with 71 mutants) to 64.9 % raw (this run, with 168 mutants). That is *not* a regression in the existing tests — slice B's commit `37664ff` ("completeUpload chains probe + key gen + transcoder submit with retry") added the probe pipeline, the retry loop, the new failure-reason templates, and the `state === 'READY'` delete branch. Each new branch added mutants, and the slice B test suite did not include the boundary tests (e.g., `attempt < MAX_SUBMIT_ATTEMPTS - 1`) or the message-pinning that would kill them. Slice B's plan did **not** include a mutation refresh task, so this is the first run that sees the full slice B surface.

**About `webhook/**`:** these three files were added in slice B (commits `fbf4451`, `c1e6b71`, `ba6caa4`) and likewise never saw a mutation refresh; their slice B tests cover happy paths and one or two negative paths but do not pin the `Bearer ` parsing edges, the `payload.exp * 1000 < Date.now()` boundary, or the various log/response strings.

### Equivalent-mutant candidates on the slice A/B surface (for future triage, not applied)

These survivors fit the same "logger observability" pattern documented for `libs/api-auth` above. They are *candidates* for `// Stryker disable next-line` annotations or `mutator.excludedMutations` config but were **not** annotated this slice — slice A/B remediation is out of scope for the slice C task.

| File:line | Mutator | Reason |
|-----------|---------|--------|
| `video.service.ts:77` | StringLiteral | `new Logger('VideoService')` — logger name, observability not behavior. |
| `video.service.ts:150` | StringLiteral | `this.logger.warn(...)` template — log content. |
| `video.service.ts:200` | StringLiteral | `this.logger.warn(\`submitJob attempt …\`)` — log content. |
| `video.service.ts:237` | StringLiteral | `this.logger.warn(\`cancelJob failed …\`)` — log content. |
| `webhook/pubsub-push.guard.ts:19` | StringLiteral | `Symbol.for('learnwren.api-video.idTokenVerifier')` — DI key string. |
| `webhook/transcoder-events.controller.ts:11` | StringLiteral | `new Logger('TranscoderEventsController')` — logger name. |
| `webhook/transcoder-events.controller.ts:24` | StringLiteral | `logger.error('Discarding malformed event: …')` — log content. |
| `webhook/transcoder-events.controller.ts:40` | StringLiteral | `logger.error('Transient failure: …')` — log content. |
| `transcoder/transcoder.port.ts:3` | StringLiteral | `Symbol.for('learnwren.api-video.transcoder')` — DI key string. |

Excluding these nine equivalents would lift the aggregate from 81.04 % → ~82.6 % effective; even with them excluded, the aggregate remains below the 85 % bar because the *real* slice A/B test-coverage gaps are larger than the logger noise.

### Recommendation for follow-up

The slice C acceptance bar (≥ 85 % effective on the slice C surface) is met (100.00 %). To bring the **aggregate** above 85 % effective, schedule a separate "api-video slice A/B mutation hardening" pass with these targets, listed by impact:

1. `video.service.ts:201` — pin the retry boundary `attempt < MAX_SUBMIT_ATTEMPTS - 1` (5 mutants on one line; need a sleep-spy assertion on call count + argument). Largest single cluster.
2. `video.service.ts:255`, `:258` — pin the `state === 'TRANSCODING' && transcoderJobName` and `state === 'READY' && output?.bucket` branches in `delete()` / `deleteForLesson()` (10 mutants total).
3. `webhook/pubsub-push.guard.ts:35`, `:53` — pin the `Bearer ` parsing predicate and the `payload.exp * 1000 < Date.now()` boundary (real auth-correctness mutants, not log noise).
4. `webhook/fake-transcoder.controller.ts` — dev-only synthetic-event controller; consider excluding from the mutate set rather than adding tests (file: 7 survivors, all StringLiteral on fabricated identifiers like `'fake-subscription'`).
5. The nine equivalent-mutant candidates above — annotate inline once the real gaps are closed.

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

**Carry-forward notes:** Pre-existing api-courses excluded set (`courses.repository.ts`, `courses.exception-filter.ts`, `dto/`, `types/`, `courses.module.ts`) is unchanged. `publish.service.ts` has 16 survivors — notable clusters: `isVideoNotFound` predicate parts (6 survivors; the single test uses `e.name === 'VideoNotFoundException'` which survives several logical/equality mutations because any mutation that still matches the mock's name passes); `computeEligibilityInTxn` video-filter methods (3 no-cov, 3 survived — the private transactional path for `null`-video filtering is not exercised by unit tests; covered by api-e2e). The `API_VIDEO_PKG` array mutations (4 survived) are equivalent — the runtime `require()` seam cannot be unit-tested without an actual module resolution environment.
