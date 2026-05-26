# Mutation Test Report — `libs/web-auth`

> Generated 2026-05-26T03:00:01.811Z

**Headline mutation score: 80.65%** (killed=325, survived=76, no-cov=2, ignored=0). Score on covered mutants only: 81.05%. Adjusted (equivalent candidates excluded): 80.65%.


Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/register-confirm-page/register-confirm-page.component.ts` | 44.0% | 11 | 13 | 1 |
| `src/lib/forgot-password-page/forgot-password-page.component.ts` | 57.1% | 8 | 6 | 0 |
| `src/lib/register-page/register-page.component.ts` | 69.0% | 40 | 18 | 0 |
| `src/lib/login-page/login-page.component.ts` | 74.3% | 81 | 27 | 1 |
| `src/lib/auth.service.ts` | 91.6% | 98 | 9 | 0 |
| `src/lib/password-policy.validator.ts` | 93.2% | 41 | 3 | 0 |
| `src/lib/auth.guard.ts` | 100.0% | 14 | 0 | 0 |
| `src/lib/unlock-page/unlock-page.component.ts` | 100.0% | 29 | 0 | 0 |
| `src/lib/with-credentials.interceptor.ts` | 100.0% | 3 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/login-page/login-page.component.ts` — 28 surviving mutants

**Cluster 1** (lines 34 — `isSafeRedirect()`): 2 mutants surviving — ConditionalExpression×1, EqualityOperator×1

Sample mutation:
```diff
- return r.length > 0 && r.startsWith('/') && r[1] !== '/' && r[1] !== '\\';
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `login-page.component.ts:34` in `isSafeRedirect` with assertions that distinguish the outcomes.

**Cluster 2** (lines 50–79 — `isSafeRedirect()`): 20 mutants surviving — ArrayDeclaration×4, StringLiteral×4, BooleanLiteral×2, ObjectLiteral×2, ConditionalExpression×5, OptionalChaining×1, BlockStatement×1, EqualityOperator×1

Sample mutation:
```diff
- email: ['', [Validators.required, Validators.email]],
+ <replaced with: []>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `login-page.component.ts:50` in `isSafeRedirect` with assertions that distinguish the outcomes.

**Cluster 3** (lines 86 — `if()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- const redirect = this.queryParams()?.get('redirect');
+ <replaced with: this.queryParams().get>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `login-page.component.ts:86` in `if`.

**Cluster 4** (lines 92–94 — `if()`): 2 mutants surviving — BlockStatement×1, BooleanLiteral×1

Sample mutation:
```diff
- } finally {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `login-page.component.ts:92` in `if` — verify state change, mock invocation, or returned value.

**Cluster 5** (lines 117 — `if()`): 3 mutants surviving — StringLiteral×1, LogicalOperator×1, OptionalChaining×1

Sample mutation:
```diff
- (result.details as { unlockAvailableAt?: string } | undefined)?.unlockAvailableAt ?? '',
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `login-page.component.ts:117` in `if`. If it's a log message, classify as equivalent.

### `src/lib/register-page/register-page.component.ts` — 18 surviving mutants

**Cluster 6** (lines 20–23): 3 mutants surviving — StringLiteral×3

Sample mutation:
```diff
- UPPERCASE: 'at least one uppercase letter',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `register-page.component.ts:20`. If it's a log message, classify as equivalent.

**Cluster 7** (lines 38–48): 9 mutants surviving — ArrayDeclaration×4, StringLiteral×3, BooleanLiteral×1, ObjectLiteral×1

Sample mutation:
```diff
- displayName: ['', [Validators.required, Validators.maxLength(80)]],
+ <replaced with: []>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `register-page.component.ts:38`, not just truthiness.

**Cluster 8** (lines 54): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- if (!policy?.unmet?.length) return [];
+ <replaced with: policy?.unmet.length>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `register-page.component.ts:54`.

**Cluster 9** (lines 60 — `submit()`): 1 mutant surviving — BooleanLiteral×1

Sample mutation:
```diff
- this.busy.set(true);
+ <replaced with: false>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `register-page.component.ts:60` in `submit` with assertions that distinguish the outcomes.

**Cluster 10** (lines 71–73 — `if()`): 2 mutants surviving — BlockStatement×1, BooleanLiteral×1

Sample mutation:
```diff
- } finally {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `register-page.component.ts:71` in `if` — verify state change, mock invocation, or returned value.

**Cluster 11** (lines 82–86 — `if()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

Sample mutation:
```diff
- if (result.code === 'WEAK_PASSWORD') {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `register-page.component.ts:82` in `if` with assertions that distinguish the outcomes.

### `src/lib/register-confirm-page/register-confirm-page.component.ts` — 14 surviving mutants

**Cluster 12** (lines 22–39): 14 mutants surviving — StringLiteral×1, OptionalChaining×1, BlockStatement×2, ConditionalExpression×4, EqualityOperator×2, ArithmeticOperator×1, LogicalOperator×1, BooleanLiteral×2

Sample mutation:
```diff
- readonly email = computed(() => this.queryParams()?.get('email') ?? '');
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `register-confirm-page.component.ts:22` with assertions that distinguish the outcomes.

### `src/lib/auth.service.ts` — 9 surviving mutants

**Cluster 13** (lines 40 — `register()`): 2 mutants surviving — ObjectLiteral×1, BooleanLiteral×1

Sample mutation:
```diff
- return this.authenticateThen('/api/auth/register', input, { resetUserOnError: false });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `auth.service.ts:40` in `register`, not just truthiness.

**Cluster 14** (lines 67 — `catch()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (opts.resetUserOnError) this.currentUserSignal.set(null);
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.service.ts:67` in `catch` with assertions that distinguish the outcomes.

**Cluster 15** (lines 109–110 — `if()`): 2 mutants surviving — ConditionalExpression×1, OptionalChaining×1

Sample mutation:
```diff
- if (err instanceof HttpErrorResponse) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.service.ts:109` in `if` with assertions that distinguish the outcomes.

**Cluster 16** (lines 120–122 — `if()`): 2 mutants surviving — ConditionalExpression×1, OptionalChaining×1

Sample mutation:
```diff
- if (err instanceof HttpErrorResponse) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.service.ts:120` in `if` with assertions that distinguish the outcomes.

**Cluster 17** (lines 130 — `if()`): 2 mutants surviving — OptionalChaining×2

Sample mutation:
```diff
- return { ok: false, code, details: body?.error?.details };
+ <replaced with: body?.error.details>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `auth.service.ts:130` in `if`.

### `src/lib/forgot-password-page/forgot-password-page.component.ts` — 6 surviving mutants

**Cluster 18** (lines 24–36): 6 mutants surviving — ArrayDeclaration×2, StringLiteral×1, BooleanLiteral×3

Sample mutation:
```diff
- email: ['', [Validators.required, Validators.email]],
+ <replaced with: []>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `forgot-password-page.component.ts:24` with assertions that distinguish the outcomes.

### `src/lib/password-policy.validator.ts` — 3 surviving mutants

**Cluster 19** (lines 28–30 — `return()`): 3 mutants surviving — Regex×3

Sample mutation:
```diff
- if (!/[a-z]/.test(value)) unmet.add('LOWERCASE');
+ <replaced with: /[^a-z]/>
```

_Diagnosis._ A regex literal could be replaced with `/.*/` and tests pass. Assert against inputs that should and should not match.

_Recommended test._ Inspect `password-policy.validator.ts:28` in `return` and add an assertion that distinguishes the original from the surviving mutation.

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.web-auth.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.
