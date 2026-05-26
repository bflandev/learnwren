# Mutation Test Report — `libs/web-ui`

> Generated 2026-05-26T03:17:36.430Z

**Headline mutation score: 86.11%** (killed=62, survived=9, no-cov=1, ignored=0). Score on covered mutants only: 87.32%. Adjusted (equivalent candidates excluded): 86.11%.


Target band: web glue/orchestration — 50–70% target.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/cover/cover-tone.ts` | 64.7% | 11 | 5 | 1 |
| `src/lib/pill/lw-pill.component.ts` | 87.5% | 14 | 2 | 0 |
| `src/lib/theme/theme.service.ts` | 93.8% | 30 | 2 | 0 |
| `src/lib/cover/lw-cover.component.ts` | 100.0% | 3 | 0 | 0 |
| `src/lib/progress/lw-progress.component.ts` | 100.0% | 4 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/cover/cover-tone.ts` — 6 surviving mutants

**Cluster 1** (lines 3–11): 6 mutants surviving — StringLiteral×4, ArithmeticOperator×2

Sample mutation:
```diff
- const COVER_TONES: readonly LwCoverTone[] = ['moss', 'clay', 'bark', 'paper', 'ochre'];
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `cover-tone.ts:3`. If it's a log message, classify as equivalent.

### `src/lib/pill/lw-pill.component.ts` — 2 surviving mutants

**Cluster 2** (lines 18): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- readonly tone = input<LwPillTone>('default');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `lw-pill.component.ts:18`. If it's a log message, classify as equivalent.

**Cluster 3** (lines 30–31): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- default:
+ <replaced with: default:>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `lw-pill.component.ts:30` with assertions that distinguish the outcomes.

### `src/lib/theme/theme.service.ts` — 2 surviving mutants

**Cluster 4** (lines 29 — `readInitial()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

Sample mutation:
```diff
- return stored === 'light' || stored === 'dark' ? stored : 'dark';
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `theme.service.ts:29` in `readInitial` with assertions that distinguish the outcomes.

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.web-ui.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.
