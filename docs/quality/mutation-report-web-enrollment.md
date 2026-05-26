# Mutation Test Report — `libs/web-enrollment`

> Generated 2026-05-26T03:16:41.469Z

**Headline mutation score: 83.33%** (killed=80, survived=12, no-cov=4, ignored=0). Score on covered mutants only: 86.96%. Adjusted (equivalent candidates excluded): 83.33%.


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

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.web-enrollment.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.
