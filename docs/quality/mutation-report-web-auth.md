# Mutation Test Report — `libs/web-auth`

> Generated 2026-05-25T17:17:11.069Z

**Headline mutation score: 80.31%** (killed=310, survived=74, no-cov=2, ignored=0). Score on covered mutants only: 80.73%.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/register-confirm-page/register-confirm-page.component.ts` | 44.0% | 11 | 13 | 1 |
| `src/lib/forgot-password-page/forgot-password-page.component.ts` | 57.1% | 8 | 6 | 0 |
| `src/lib/register-page/register-page.component.ts` | 69.0% | 40 | 18 | 0 |
| `src/lib/login-page/login-page.component.ts` | 71.7% | 66 | 25 | 1 |
| `src/lib/auth.service.ts` | 91.6% | 98 | 9 | 0 |
| `src/lib/password-policy.validator.ts` | 93.2% | 41 | 3 | 0 |
| `src/lib/auth.guard.ts` | 100.0% | 14 | 0 | 0 |
| `src/lib/unlock-page/unlock-page.component.ts` | 100.0% | 29 | 0 | 0 |
| `src/lib/with-credentials.interceptor.ts` | 100.0% | 3 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/login-page/login-page.component.ts` — 26 surviving mutants

**Cluster 1** (lines 34–63): 20 mutants surviving — ArrayDeclaration×4, StringLiteral×4, BooleanLiteral×2, ObjectLiteral×2, ConditionalExpression×5, OptionalChaining×1, BlockStatement×1, EqualityOperator×1

```diff
- email: ['', [Validators.required, Validators.email]],
+ <replaced with: []>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass.

_Recommended test._ Drive both sides of the conditional at `login-page.component.ts:34`.

**Cluster 2** (lines 70 — `if()`): 1 mutant surviving — OptionalChaining×1

```diff
- const redirect = this.queryParams()?.get('redirect');
+ <replaced with: this.queryParams().get>
```

_Diagnosis._ Removing `?.` didn't break tests. Add a case where the parent is null/undefined.

_Recommended test._ Add a null/undefined parent case at `login-page.component.ts:70` in `if`.

**Cluster 3** (lines 76–78 — `if()`): 2 mutants surviving — BlockStatement×1, BooleanLiteral×1

```diff
- } finally {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure.

_Recommended test._ Assert on the side effect at `login-page.component.ts:76` in `if`.

**Cluster 4** (lines 101 — `if()`): 3 mutants surviving — StringLiteral×1, LogicalOperator×1, OptionalChaining×1

```diff
- (result.details as { unlockAvailableAt?: string } | undefined)?.unlockAvailableAt ?? '',
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `login-page.component.ts:101` in `if`.

### `src/lib/register-page/register-page.component.ts` — 18 surviving mutants

**Cluster 5** (lines 20–23): 3 mutants surviving — StringLiteral×3

```diff
- UPPERCASE: 'at least one uppercase letter',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `register-page.component.ts:20`.

**Cluster 6** (lines 38–48): 9 mutants surviving — StringLiteral×3, ArrayDeclaration×4, BooleanLiteral×1, ObjectLiteral×1

```diff
- displayName: ['', [Validators.required, Validators.maxLength(80)]],
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass.

_Recommended test._ Assert on array length / object shape at `register-page.component.ts:38`.

**Cluster 7** (lines 54): 1 mutant surviving — OptionalChaining×1

```diff
- if (!policy?.unmet?.length) return [];
+ <replaced with: policy?.unmet.length>
```

_Diagnosis._ Removing `?.` didn't break tests. Add a case where the parent is null/undefined.

_Recommended test._ Add a null/undefined parent case at `register-page.component.ts:54`.

**Cluster 8** (lines 60 — `submit()`): 1 mutant surviving — BooleanLiteral×1

```diff
- this.busy.set(true);
+ <replaced with: false>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass.

_Recommended test._ Drive both sides of the conditional at `register-page.component.ts:60` in `submit`.

**Cluster 9** (lines 71–73 — `if()`): 2 mutants surviving — BlockStatement×1, BooleanLiteral×1

```diff
- } finally {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure.

_Recommended test._ Assert on the side effect at `register-page.component.ts:71` in `if`.

**Cluster 10** (lines 82–86 — `if()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

```diff
- if (result.code === 'WEAK_PASSWORD') {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `register-page.component.ts:82` in `if`.

### `src/lib/register-confirm-page/register-confirm-page.component.ts` — 14 surviving mutants

**Cluster 11** (lines 22–39): 14 mutants surviving — StringLiteral×1, OptionalChaining×1, BlockStatement×2, ConditionalExpression×4, EqualityOperator×2, ArithmeticOperator×1, LogicalOperator×1, BooleanLiteral×2

```diff
- readonly email = computed(() => this.queryParams()?.get('email') ?? '');
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass.

_Recommended test._ Drive both sides of the conditional at `register-confirm-page.component.ts:22`.

### `src/lib/auth.service.ts` — 9 surviving mutants

**Cluster 12** (lines 40 — `register()`): 2 mutants surviving — ObjectLiteral×1, BooleanLiteral×1

```diff
- return this.authenticateThen('/api/auth/register', input, { resetUserOnError: false });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass.

_Recommended test._ Assert on array length / object shape at `auth.service.ts:40` in `register`.

**Cluster 13** (lines 67 — `catch()`): 1 mutant surviving — ConditionalExpression×1

```diff
- if (opts.resetUserOnError) this.currentUserSignal.set(null);
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `auth.service.ts:67` in `catch`.

**Cluster 14** (lines 109–110 — `if()`): 2 mutants surviving — ConditionalExpression×1, OptionalChaining×1

```diff
- if (err instanceof HttpErrorResponse) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `auth.service.ts:109` in `if`.

**Cluster 15** (lines 120–122 — `if()`): 2 mutants surviving — ConditionalExpression×1, OptionalChaining×1

```diff
- if (err instanceof HttpErrorResponse) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `auth.service.ts:120` in `if`.

**Cluster 16** (lines 130 — `if()`): 2 mutants surviving — OptionalChaining×2

```diff
- return { ok: false, code, details: body?.error?.details };
+ <replaced with: body?.error.details>
```

_Diagnosis._ Removing `?.` didn't break tests. Add a case where the parent is null/undefined.

_Recommended test._ Add a null/undefined parent case at `auth.service.ts:130` in `if`.

### `src/lib/forgot-password-page/forgot-password-page.component.ts` — 6 surviving mutants

**Cluster 17** (lines 24–36): 6 mutants surviving — ArrayDeclaration×2, StringLiteral×1, BooleanLiteral×3

```diff
- email: ['', [Validators.required, Validators.email]],
+ <replaced with: []>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass.

_Recommended test._ Drive both sides of the conditional at `forgot-password-page.component.ts:24`.

### `src/lib/password-policy.validator.ts` — 3 surviving mutants

**Cluster 18** (lines 28–30 — `return()`): 3 mutants surviving — Regex×3

```diff
- if (!/[a-z]/.test(value)) unmet.add('LOWERCASE');
+ <replaced with: /[^a-z]/>
```

_Diagnosis._ A regex literal could be replaced with `/.*/`.

_Recommended test._ Inspect `password-policy.validator.ts:28` in `return`.

## Equivalent-mutant candidates

_None proposed._
