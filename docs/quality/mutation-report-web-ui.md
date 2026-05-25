# Mutation Test Report — `libs/web-ui`

> Generated 2026-05-25T17:14:52.916Z

**Headline mutation score: 88.46%** (killed=92, survived=10, no-cov=2, ignored=0). Score on covered mutants only: 90.20%.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/button/lw-button.directive.ts` | 0.0% | 0 | 1 | 0 |
| `src/lib/cover/cover-tone.ts` | 64.7% | 11 | 5 | 1 |
| `src/lib/pill/lw-pill.component.ts` | 87.5% | 14 | 2 | 0 |
| `src/lib/theme/theme.service.ts` | 93.8% | 30 | 2 | 0 |
| `src/lib/icon/lw-icon.component.ts` | 96.8% | 30 | 0 | 1 |
| `src/lib/cover/lw-cover.component.ts` | 100.0% | 3 | 0 | 0 |
| `src/lib/progress/lw-progress.component.ts` | 100.0% | 4 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/cover/cover-tone.ts` — 6 surviving mutants

**Cluster 1** (lines 3–11): 6 mutants surviving — StringLiteral×4, ArithmeticOperator×2

```diff
- const COVER_TONES: readonly LwCoverTone[] = ['moss', 'clay', 'bark', 'paper', 'ochre'];
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `cover-tone.ts:3`.

### `src/lib/pill/lw-pill.component.ts` — 2 surviving mutants

**Cluster 2** (lines 18): 1 mutant surviving — StringLiteral×1

```diff
- readonly tone = input<LwPillTone>('default');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `lw-pill.component.ts:18`.

**Cluster 3** (lines 30–31): 1 mutant surviving — ConditionalExpression×1

```diff
- default:
+ <replaced with: default:>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass.

_Recommended test._ Drive both sides of the conditional at `lw-pill.component.ts:30`.

### `src/lib/theme/theme.service.ts` — 2 surviving mutants

**Cluster 4** (lines 29 — `readInitial()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

```diff
- return stored === 'light' || stored === 'dark' ? stored : 'dark';
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `theme.service.ts:29` in `readInitial`.

### `src/lib/icon/lw-icon.component.ts` — 1 surviving mutant

**Cluster 5** (lines 76): 1 mutant surviving — StringLiteral×1

```diff
- this.sanitizer.bypassSecurityTrustHtml(ICON_PATHS[this.name()] ?? ''),
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `lw-icon.component.ts:76`.

### `src/lib/button/lw-button.directive.ts` — 1 surviving mutant

**Cluster 6** (lines 15): 1 mutant surviving — StringLiteral×1

```diff
- readonly variant = input<LwButtonVariant>('default');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `lw-button.directive.ts:15`.

## Equivalent-mutant candidates

_None proposed._
