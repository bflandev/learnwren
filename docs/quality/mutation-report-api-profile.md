# Mutation Test Report — `libs/api-profile`

> Generated 2026-05-29T07:15:02.204Z

**Headline mutation score: 82.66%** (killed=286, survived=58, no-cov=2, ignored=0). Score on covered mutants only: 83.14%. Adjusted (equivalent candidates excluded): 87.20%.


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

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.api-profile.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.
