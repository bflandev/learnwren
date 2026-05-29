# Mutation Test Report — `libs/web-auth`

> Generated 2026-05-29T07:15:02.254Z

**Headline mutation score: 88.28%** (killed=369, survived=48, no-cov=1, ignored=0). Score on covered mutants only: 88.49%. Adjusted (equivalent candidates excluded): 88.28%.


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

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.web-auth.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.
