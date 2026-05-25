# Mutation Test Report — `libs/web-enrollment`

> Generated 2026-05-25T17:25:44.192Z

**Headline mutation score: 81.32%** (killed=74, survived=11, no-cov=6, ignored=0). Score on covered mutants only: 87.06%.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/course-enrollment-panel/course-enrollment-panel.component.ts` | 79.8% | 67 | 11 | 6 |
| `src/lib/enrollment.service.ts` | 100.0% | 7 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/course-enrollment-panel/course-enrollment-panel.component.ts` — 17 surviving mutants

**Cluster 1** (lines 34–35): 2 mutants surviving — StringLiteral×1, BooleanLiteral×1

```diff
- readonly state = signal<PanelState>('LOADING');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `course-enrollment-panel.component.ts:34`.

**Cluster 2** (lines 63 — `if()`): 1 mutant surviving — ConditionalExpression×1

```diff
- if (this.state() === 'ENROLLED') this.clearEnrollParam();
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `course-enrollment-panel.component.ts:63` in `if`.

**Cluster 3** (lines 80 — `enroll()`): 1 mutant surviving — BooleanLiteral×1

```diff
- this.busy.set(true);
+ <replaced with: false>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass.

_Recommended test._ Drive both sides of the conditional at `course-enrollment-panel.component.ts:80` in `enroll`.

**Cluster 4** (lines 94–96 — `catch()`): 2 mutants surviving — BlockStatement×1, BooleanLiteral×1

```diff
- } finally {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure.

_Recommended test._ Assert on the side effect at `course-enrollment-panel.component.ts:94` in `catch`.

**Cluster 5** (lines 104–109 — `cancelConfirm()`): 3 mutants surviving — BlockStatement×1, BooleanLiteral×2

```diff
- cancelConfirm(): void {
+ <replaced with: {}>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass.

_Recommended test._ Drive both sides of the conditional at `course-enrollment-panel.component.ts:104` in `cancelConfirm`.

**Cluster 6** (lines 115–125 — `confirmLeave()`): 6 mutants surviving — BlockStatement×3, StringLiteral×2, BooleanLiteral×1

```diff
- } catch {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure.

_Recommended test._ Assert on the side effect at `course-enrollment-panel.component.ts:115` in `confirmLeave`.

**Cluster 7** (lines 131 — `clearEnrollParam()`): 1 mutant surviving — StringLiteral×1

```diff
- queryParamsHandling: 'merge',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `course-enrollment-panel.component.ts:131` in `clearEnrollParam`.

**Cluster 8** (lines 137 — `errorCode()`): 1 mutant surviving — OptionalChaining×1

```diff
- return (err.error as { error?: { code?: string } } | null)?.error?.code;
+ <replaced with: (err.error as {
  error?: {
    code?: string;
  };
} | null).error>
```

_Diagnosis._ Removing `?.` didn't break tests. Add a case where the parent is null/undefined.

_Recommended test._ Add a null/undefined parent case at `course-enrollment-panel.component.ts:137` in `errorCode`.

## Equivalent-mutant candidates

_None proposed._
