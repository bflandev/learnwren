# Mutation Test Report — `libs/web-learn`

> Generated 2026-05-25T17:26:18.955Z

**Headline mutation score: 90.91%** (killed=30, survived=3, no-cov=0, ignored=0). Score on covered mutants only: 90.91%.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/lesson-player-page/lesson-player-page.component.ts` | 90.3% | 28 | 3 | 0 |
| `src/lib/learn.service.ts` | 100.0% | 2 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/lesson-player-page/lesson-player-page.component.ts` — 3 surviving mutants

**Cluster 1** (lines 32): 1 mutant surviving — StringLiteral×1

```diff
- readonly state = signal<PageState>('LOADING');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `lesson-player-page.component.ts:32`.

**Cluster 2** (lines 48–51 — `if()`): 2 mutants surviving — StringLiteral×1, ConditionalExpression×1

```diff
- this.state.set('PROCESSING');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `lesson-player-page.component.ts:48` in `if`.

## Equivalent-mutant candidates

_None proposed._
