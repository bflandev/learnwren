# Mutation Test Report — `libs/web-catalog`

> Generated 2026-05-29T07:15:02.302Z

**Headline mutation score: 82.79%** (killed=178, survived=32, no-cov=5, ignored=0). Score on covered mutants only: 84.76%. Adjusted (equivalent candidates excluded): 82.79%.


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

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.web-catalog.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.
