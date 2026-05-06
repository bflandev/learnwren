# Mutation Test Report — `libs/api-auth`

> Generated 2026-05-06T20:01:05.929Z

**Headline mutation score: 75.66%** (killed=342, survived=90, no-cov=20, ignored=0). Score on covered mutants only: 79.17%.

Auth code targets **90%+** per the mutation-testing skill. We are below target — survivors below are gaps to close.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/firebase-auth-rest-client.ts` | 67.6% | 25 | 10 | 2 |
| `src/lib/auth.controller.ts` | 68.4% | 13 | 6 | 0 |
| `src/lib/auth.service.ts` | 69.8% | 162 | 55 | 15 |
| `src/lib/firebase-session.guard.ts` | 72.2% | 13 | 4 | 1 |
| `src/lib/auth.exception-filter.ts` | 73.3% | 11 | 4 | 0 |
| `src/lib/auth-attempts.repository.ts` | 84.7% | 72 | 11 | 2 |
| `src/lib/password-policy.service.ts` | 100.0% | 41 | 0 | 0 |
| `src/lib/session-cookie.helper.ts` | 100.0% | 5 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/auth.service.ts` — 50 surviving mutants

**Cluster 1** (lines 69): 2 mutants surviving — Regex×2

Sample mutation:
```diff
- const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
+ <replaced with: /[^\s@]+@[^\s@]+\.[^\s@]+$/>
```

_Diagnosis._ A regex literal could be replaced with `/.*/` and tests pass. Assert against inputs that should and should not match.

_Recommended test._ Inspect `auth.service.ts:69` and add an assertion that distinguishes the original from the surviving mutation.

**Cluster 2** (lines 88 — `if()`): 2 mutants surviving — ConditionalExpression×1, EqualityOperator×1

Sample mutation:
```diff
- if (displayName.length === 0 || displayName.length > DISPLAY_NAME_MAX) {
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.service.ts:88` in `if` with assertions that distinguish the outcomes.

**Cluster 3** (lines 108–112 — `catch()`): 6 mutants surviving — ConditionalExpression×2, LogicalOperator×2, StringLiteral×2

Sample mutation:
```diff
- if (this.isFirebaseError(err) && err.code === 'auth/email-already-exists') {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.service.ts:108` in `catch` with assertions that distinguish the outcomes.

**Cluster 4** (lines 121–128 — `catch()`): 3 mutants surviving — StringLiteral×2, ObjectLiteral×1

Sample mutation:
```diff
- await this.firestore.collection('users').doc(uid).set({
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `auth.service.ts:121` in `catch`. If it's a log message, classify as equivalent.

**Cluster 5** (lines 145–150 — `catch()`): 3 mutants surviving — ObjectLiteral×1, StringLiteral×2

Sample mutation:
```diff
- await this.auth.generateEmailVerificationLink(input.email, {
+ <replaced with: {}>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `auth.service.ts:145` in `catch`. If it's a log message, classify as equivalent.

**Cluster 6** (lines 198–202 — `if()`): 3 mutants surviving — ConditionalExpression×1, StringLiteral×1, MethodExpression×1

Sample mutation:
```diff
- if (err instanceof InvalidCredentialsException) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.service.ts:198` in `if` with assertions that distinguish the outcomes.

**Cluster 7** (lines 215 — `if()`): 1 mutant surviving — BooleanLiteral×1

Sample mutation:
```diff
- const decoded = await this.auth.verifyIdToken(idToken, true);
+ <replaced with: false>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.service.ts:215` in `if` with assertions that distinguish the outcomes.

**Cluster 8** (lines 226–230 — `if()`): 3 mutants surviving — StringLiteral×1, BlockStatement×1, ConditionalExpression×1

Sample mutation:
```diff
- const userDoc = await this.firestore.collection('users').doc(userRecord.uid).get();
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `auth.service.ts:226` in `if`. If it's a log message, classify as equivalent.

**Cluster 9** (lines 254–257 — `catch()`): 1 mutant surviving — BlockStatement×1

Sample mutation:
```diff
- } catch (err) {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `auth.service.ts:254` in `catch` — verify state change, mock invocation, or returned value.

**Cluster 10** (lines 263–271 — `catch()`): 4 mutants surviving — BlockStatement×1, LogicalOperator×1, StringLiteral×2

Sample mutation:
```diff
- } catch (err) {
+ <replaced with: {}>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `auth.service.ts:263` in `catch`. If it's a log message, classify as equivalent.

**Cluster 11** (lines 285–287 — `if()`): 2 mutants surviving — ConditionalExpression×2

Sample mutation:
```diff
- if (typeof cookieIatSec === 'number') {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.service.ts:285` in `if` with assertions that distinguish the outcomes.

**Cluster 12** (lines 295–297 — `catch()`): 1 mutant surviving — BlockStatement×1

Sample mutation:
```diff
- } catch (err) {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `auth.service.ts:295` in `catch` — verify state change, mock invocation, or returned value.

**Cluster 13** (lines 334 — `catch()`): 3 mutants surviving — ConditionalExpression×2, LogicalOperator×1

Sample mutation:
```diff
- if (this.isFirebaseError(err) && err.code === 'auth/user-not-found') {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.service.ts:334` in `catch` with assertions that distinguish the outcomes.

**Cluster 14** (lines 351–356 — `catch()`): 2 mutants surviving — BlockStatement×1, StringLiteral×1

Sample mutation:
```diff
- } catch (err) {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `auth.service.ts:351` in `catch` — verify state change, mock invocation, or returned value.

**Cluster 15** (lines 370 — `catch()`): 3 mutants surviving — ConditionalExpression×2, LogicalOperator×1

Sample mutation:
```diff
- if (this.isFirebaseError(err) && err.code === 'auth/user-not-found') {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.service.ts:370` in `catch` with assertions that distinguish the outcomes.

**Cluster 16** (lines 381–386 — `catch()`): 2 mutants surviving — BlockStatement×1, StringLiteral×1

Sample mutation:
```diff
- } catch (err) {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `auth.service.ts:381` in `catch` — verify state change, mock invocation, or returned value.

**Cluster 17** (lines 413–417 — `if()`): 1 mutant surviving — BlockStatement×1

Sample mutation:
```diff
- } catch {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `auth.service.ts:413` in `if` — verify state change, mock invocation, or returned value.

**Cluster 18** (lines 425–433 — `catch()`): 7 mutants surviving — BlockStatement×1, ConditionalExpression×4, LogicalOperator×2

Sample mutation:
```diff
- } catch (err) {
+ <replaced with: {}>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.service.ts:425` in `catch` with assertions that distinguish the outcomes.

**Cluster 19** (lines 439–441 — `catch()`): 1 mutant surviving — BlockStatement×1

Sample mutation:
```diff
- } catch (err) {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `auth.service.ts:439` in `catch` — verify state change, mock invocation, or returned value.

### `src/lib/auth-attempts.repository.ts` — 13 surviving mutants

**Cluster 20** (lines 8–10): 3 mutants surviving — StringLiteral×1, ArithmeticOperator×2

Sample mutation:
```diff
- const COLLECTION = 'auth_attempts';
+ <replaced with: "">
```

_Diagnosis._ An arithmetic operator could be replaced. Pin the math with a deterministic input/output pair.

_Recommended test._ Inspect `auth-attempts.repository.ts:8` and add an assertion that distinguishes the original from the surviving mutation.

**Cluster 21** (lines 74–78 — `recordFailure()`): 2 mutants surviving — LogicalOperator×1, ArithmeticOperator×1

Sample mutation:
```diff
- data.firstFailureAt = data.firstFailureAt ?? nowIso;
+ <replaced with: data.firstFailureAt && nowIso>
```

_Diagnosis._ `&&` / `||` swap survived: short-circuit semantics aren't exercised. Add a test for the partial case where one operand is true and the other false.

_Recommended test._ Add a test where one operand of the logical expression at `auth-attempts.repository.ts:74` in `recordFailure` is true and the other is false.

**Cluster 22** (lines 98–105 — `redeemUnlockToken()`): 5 mutants surviving — StringLiteral×2, ConditionalExpression×2, ObjectLiteral×1

Sample mutation:
```diff
- .where('unlockToken', '==', token)
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `auth-attempts.repository.ts:98` in `redeemUnlockToken`. If it's a log message, classify as equivalent.

**Cluster 23** (lines 139 — `recordPasswordResetRequest()`): 1 mutant surviving — EqualityOperator×1

Sample mutation:
```diff
- if (last && now.getTime() - new Date(last).getTime() < THROTTLE_MS) {
+ <replaced with: now.getTime() - new Date(last).getTime() <= THROTTLE_MS>
```

_Diagnosis._ An equality / inequality operator could be flipped (`==`↔`!=`, `===`↔`!==`) and tests still pass. Test both equal and unequal inputs at the boundary.

_Recommended test._ Add a boundary test that exercises the equal / off-by-one case at `auth-attempts.repository.ts:139` in `recordPasswordResetRequest`.

**Cluster 24** (lines 169–170 — `isExpiredLock()`): 2 mutants surviving — ConditionalExpression×1, EqualityOperator×1

Sample mutation:
```diff
- if (!lockedUntil) return false;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth-attempts.repository.ts:169` in `isExpiredLock` with assertions that distinguish the outcomes.

### `src/lib/firebase-auth-rest-client.ts` — 11 surviving mutants

**Cluster 25** (lines 43–48): 4 mutants surviving — ObjectLiteral×2, StringLiteral×1, BooleanLiteral×1

Sample mutation:
```diff
- headers: { 'content-type': 'application/json' },
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `firebase-auth-rest-client.ts:43`, not just truthiness.

**Cluster 26** (lines 59 — `upstreamCode()`): 6 mutants surviving — StringLiteral×2, MethodExpression×1, OptionalChaining×3

Sample mutation:
```diff
- const upstreamCode = (errorBody?.error?.message ?? '').split(' ')[0]?.trim() ?? '';
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `firebase-auth-rest-client.ts:59` in `upstreamCode`.

**Cluster 27** (lines 66 — `upstreamCode()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- `[auth] signInWithPassword unexpected status=${res.status} code=${upstreamCode}`,
+ <replaced with: ``>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `firebase-auth-rest-client.ts:66` in `upstreamCode`. If it's a log message, classify as equivalent.

### `src/lib/auth.controller.ts` — 6 surviving mutants

**Cluster 28** (lines 52–61): 2 mutants surviving — ObjectLiteral×2

Sample mutation:
```diff
- const result = await this.authService.register({
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `auth.controller.ts:52`, not just truthiness.

**Cluster 29** (lines 77–82): 2 mutants surviving — ObjectLiteral×2

Sample mutation:
```diff
- const result = await this.authService.login({ email: dto.email, password: dto.password });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `auth.controller.ts:77`, not just truthiness.

**Cluster 30** (lines 100–102): 1 mutant surviving — BlockStatement×1

Sample mutation:
```diff
- async requestPasswordReset(@Body() dto: RequestPasswordResetDto): Promise<void> {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `auth.controller.ts:100` — verify state change, mock invocation, or returned value.

**Cluster 31** (lines 116): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- const cookie = req.cookies?.[SessionCookieHelper.COOKIE_NAME];
+ <replaced with: req.cookies[SessionCookieHelper.COOKIE_NAME]>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `auth.controller.ts:116`.

### `src/lib/auth.exception-filter.ts` — 3 surviving mutants

**Cluster 32** (lines 25 — `if()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (exception.details) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.exception-filter.ts:25` in `if` with assertions that distinguish the outcomes.

**Cluster 33** (lines 33–36 — `if()`): 2 mutants surviving — LogicalOperator×1, StringLiteral×1

Sample mutation:
```diff
- exception instanceof Error ? exception.stack ?? exception.message : String(exception),
+ <replaced with: exception.stack && exception.message>
```

_Diagnosis._ `&&` / `||` swap survived: short-circuit semantics aren't exercised. Add a test for the partial case where one operand is true and the other false.

_Recommended test._ Add a test where one operand of the logical expression at `auth.exception-filter.ts:33` in `if` is true and the other is false.

### `src/lib/firebase-session.guard.ts` — 2 surviving mutants

**Cluster 34** (lines 20 — `canActivate()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- const cookie = req.cookies?.[SessionCookieHelper.COOKIE_NAME];
+ <replaced with: req.cookies[SessionCookieHelper.COOKIE_NAME]>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `firebase-session.guard.ts:20` in `canActivate`.

**Cluster 35** (lines 31 — `if()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- email: decoded['email'] ?? '',
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `firebase-session.guard.ts:31` in `if`. If it's a log message, classify as equivalent.

## Equivalent-mutant candidates (proposed for exclusion)

These survivors are flagged as likely equivalent (mostly logger string content). Review and confirm before excluding from the score:

| File:line | Mutator | Reason |
|-----------|---------|--------|
| `src/lib/auth.service.ts:228` | StringLiteral | String literal passed to a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:255` | StringLiteral | String literal passed to a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:264` | StringLiteral | String literal passed to a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:440` | StringLiteral | String literal passed to a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:75` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/auth.service.ts:130` | StringLiteral | String literal passed to a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:138` | StringLiteral | String literal passed to a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:164` | StringLiteral | String literal passed to a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:169` | StringLiteral | String literal passed to a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:207` | StringLiteral | String literal passed to a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:218` | StringLiteral | String literal passed to a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:233` | StringLiteral | String literal passed to a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:294` | StringLiteral | String literal passed to a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:294` | StringLiteral | String literal passed to a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:296` | StringLiteral | String literal passed to a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:306` | StringLiteral | String literal passed to a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:350` | StringLiteral | String literal passed to a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:380` | StringLiteral | String literal passed to a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:393` | StringLiteral | String literal passed to a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:428` | StringLiteral | String literal passed to a logger call — log content is observability, not behavior. |
| `src/lib/firebase-auth-rest-client.ts:31` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/firebase-session.guard.ts:12` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/firebase-session.guard.ts:23` | StringLiteral | String literal passed to a logger call — log content is observability, not behavior. |
| `src/lib/firebase-session.guard.ts:37` | StringLiteral | String literal passed to a logger call — log content is observability, not behavior. |
| `src/lib/auth.exception-filter.ts:16` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |

Total: 25. Excluding these would raise the score from **75.66%** to **80.09%**. Confirm before adding to Stryker config.

## Caveats

- **Scope.** Only `libs/api-auth/src/lib/**/*.ts` was mutated, excluding `email-transport/**` (its spec fails to import nodemailer in vitest), `auth.module.ts`, `dto/**`, `types/**`, `errors/**`, and `index.ts`. Other libraries (`web-auth`, `api-firebase`) are not analyzed yet.
- **Coverage analysis.** `coverageAnalysis: perTest` — Stryker only runs tests whose coverage hit the mutated line. If a test exercises uncovered code paths through dynamic dispatch, that may be missed.
- **No-coverage mutants** count against the score. They reflect lines that no test executes; CRAP's coverage data agrees these are gaps.
- **Equivalent classification is heuristic.** The "candidates" list flags strings inside logger calls — review each before adding to Stryker's `mutator.excludedMutations` or per-line ignore comments.
- **Test quality is real but bounded.** A surviving mutant means an assertion is missing for the *code as written*. If the code is wrong and tests pin the wrong behavior, mutation testing won't catch it.
