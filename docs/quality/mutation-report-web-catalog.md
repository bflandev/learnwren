# Mutation Test Report — `libs/web-catalog`

> Generated 2026-05-25T17:24:48.048Z

**Headline mutation score: 79.68%** (killed=149, survived=37, no-cov=1, ignored=0). Score on covered mutants only: 80.11%.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/components/course-card/course-card.component.ts` | 0.0% | 0 | 1 | 0 |
| `src/lib/course-detail-page/course-detail-page.component.ts` | 75.6% | 59 | 18 | 1 |
| `src/lib/search-results-page/search-results-page.component.ts` | 78.6% | 22 | 6 | 0 |
| `src/lib/catalog.service.ts` | 79.2% | 19 | 5 | 0 |
| `src/lib/components/catalog-filter-bar/catalog-filter-bar.component.ts` | 85.7% | 6 | 1 | 0 |
| `src/lib/catalog-page/catalog-page.component.ts` | 86.1% | 31 | 5 | 0 |
| `src/lib/components/course-search-bar/course-search-bar.component.ts` | 92.3% | 12 | 1 | 0 |

## Survivor clusters — gaps to close

### `src/lib/course-detail-page/course-detail-page.component.ts` — 19 surviving mutants

**Cluster 1** (lines 28–40): 7 mutants surviving — BooleanLiteral×2, BlockStatement×1, StringLiteral×1, OptionalChaining×3

```diff
- readonly notFound = signal(false);
+ <replaced with: true>
```

_Diagnosis._ Removing `?.` didn't break tests. Add a case where the parent is null/undefined.

_Recommended test._ Add a null/undefined parent case at `course-detail-page.component.ts:28`.

**Cluster 2** (lines 51–53 — `coverToneForId()`): 9 mutants surviving — ConditionalExpression×3, BooleanLiteral×2, EqualityOperator×1, OptionalChaining×3

```diff
- if (this.firstLessonHref()) return false;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `course-detail-page.component.ts:51` in `coverToneForId`.

**Cluster 3** (lines 63–65 — `ngOnInit()`): 2 mutants surviving — BlockStatement×1, ConditionalExpression×1

```diff
- if (!this.auth.currentUser()) {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure.

_Recommended test._ Assert on the side effect at `course-detail-page.component.ts:63` in `ngOnInit`.

**Cluster 4** (lines 71 — `resolveEnrollmentStatus()`): 1 mutant surviving — ConditionalExpression×1

```diff
- if (!courseId) return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `course-detail-page.component.ts:71` in `resolveEnrollmentStatus`.

### `src/lib/search-results-page/search-results-page.component.ts` — 6 surviving mutants

**Cluster 5** (lines 22–24): 2 mutants surviving — StringLiteral×1, BooleanLiteral×1

```diff
- readonly query = signal('');
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `search-results-page.component.ts:22`.

**Cluster 6** (lines 38 — `if()`): 4 mutants surviving — ConditionalExpression×2, LogicalOperator×1, StringLiteral×1

```diff
- const page = Number(params.get('page')) || 1;
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `search-results-page.component.ts:38` in `if`.

### `src/lib/catalog-page/catalog-page.component.ts` — 5 surviving mutants

**Cluster 7** (lines 32–36): 3 mutants surviving — BooleanLiteral×2, StringLiteral×1

```diff
- readonly error = signal(false);
+ <replaced with: true>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass.

_Recommended test._ Drive both sides of the conditional at `catalog-page.component.ts:32`.

**Cluster 8** (lines 68 — `onFilterChange()`): 1 mutant surviving — StringLiteral×1

```diff
- queryParamsHandling: 'merge',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `catalog-page.component.ts:68` in `onFilterChange`.

**Cluster 9** (lines 76 — `goToPage()`): 1 mutant surviving — StringLiteral×1

```diff
- queryParamsHandling: 'merge',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `catalog-page.component.ts:76` in `goToPage`.

### `src/lib/catalog.service.ts` — 5 surviving mutants

**Cluster 10** (lines 26–29 — `getCatalogue()`): 4 mutants surviving — ConditionalExpression×4

```diff
- if (params.page) httpParams = httpParams.set('page', params.page);
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `catalog.service.ts:26` in `getCatalogue`.

**Cluster 11** (lines 37 — `search()`): 1 mutant surviving — ConditionalExpression×1

```diff
- if (page) httpParams = httpParams.set('page', page);
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `catalog.service.ts:37` in `search`.

### `src/lib/components/catalog-filter-bar/catalog-filter-bar.component.ts` — 1 surviving mutant

**Cluster 12** (lines 27): 1 mutant surviving — StringLiteral×1

```diff
- readonly sort = input<CatalogSort>('NEWEST');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `catalog-filter-bar.component.ts:27`.

### `src/lib/components/course-search-bar/course-search-bar.component.ts` — 1 surviving mutant

**Cluster 13** (lines 16): 1 mutant surviving — StringLiteral×1

```diff
- readonly query = signal('');
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `course-search-bar.component.ts:16`.

### `src/lib/components/course-card/course-card.component.ts` — 1 surviving mutant

**Cluster 14** (lines 16): 1 mutant surviving — ArrowFunction×1

```diff
- readonly coverTone = computed(() => coverToneForId(this.course().id));
+ <replaced with: () => undefined>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing.

_Recommended test._ Assert on the side effect at `course-card.component.ts:16`.

## Equivalent-mutant candidates

_None proposed._
