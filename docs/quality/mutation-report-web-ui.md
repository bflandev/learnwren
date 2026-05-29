# Mutation Test Report — `libs/web-ui`

> Generated 2026-05-29T07:15:02.553Z

**Headline mutation score: 87.39%** (killed=104, survived=9, no-cov=6, ignored=0). Score on covered mutants only: 92.04%. Adjusted (equivalent candidates excluded): 87.39%.


Target band: web glue/orchestration — 50–70% target.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/cover/lw-cover.component.ts` | 75.0% | 3 | 1 | 0 |
| `src/lib/avatar/lw-avatar.component.ts` | 79.3% | 23 | 2 | 4 |
| `src/lib/pill/lw-pill.component.ts` | 87.5% | 14 | 2 | 0 |
| `src/lib/avatar/avatar-tone.ts` | 88.2% | 15 | 1 | 1 |
| `src/lib/cover/cover-tone.ts` | 88.2% | 15 | 1 | 1 |
| `src/lib/theme/theme.service.ts` | 93.8% | 30 | 2 | 0 |
| `src/lib/progress/lw-progress.component.ts` | 100.0% | 4 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/avatar/lw-avatar.component.ts` — 6 surviving mutants

**Cluster 1** (lines 40–47 — `deriveInitials()`): 6 mutants surviving — ConditionalExpression×1, Regex×1, StringLiteral×4

Sample mutation:
```diff
- if (!trimmed) return '';
+ <replaced with: false>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `lw-avatar.component.ts:40` in `deriveInitials`. If it's a log message, classify as equivalent.

### `src/lib/avatar/avatar-tone.ts` — 2 surviving mutants

**Cluster 2** (lines 8–11 — `for()`): 2 mutants surviving — ArithmeticOperator×1, StringLiteral×1

Sample mutation:
```diff
- hash = (hash * 31 + id.charCodeAt(i)) | 0;
+ <replaced with: hash * 31 - id.charCodeAt(i)>
```

_Diagnosis._ An arithmetic operator could be replaced. Pin the math with a deterministic input/output pair.

_Recommended test._ Inspect `avatar-tone.ts:8` in `for` and add an assertion that distinguishes the original from the surviving mutation.

### `src/lib/cover/cover-tone.ts` — 2 surviving mutants

**Cluster 3** (lines 8–11 — `for()`): 2 mutants surviving — ArithmeticOperator×1, StringLiteral×1

Sample mutation:
```diff
- hash = (hash * 31 + id.charCodeAt(i)) | 0;
+ <replaced with: hash * 31 - id.charCodeAt(i)>
```

_Diagnosis._ An arithmetic operator could be replaced. Pin the math with a deterministic input/output pair.

_Recommended test._ Inspect `cover-tone.ts:8` in `for` and add an assertion that distinguishes the original from the surviving mutation.

### `src/lib/pill/lw-pill.component.ts` — 2 surviving mutants

**Cluster 4** (lines 18): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- readonly tone = input<LwPillTone>('default');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `lw-pill.component.ts:18`. If it's a log message, classify as equivalent.

**Cluster 5** (lines 30–31): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- default:
+ <replaced with: default:>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `lw-pill.component.ts:30` with assertions that distinguish the outcomes.

### `src/lib/theme/theme.service.ts` — 2 surviving mutants

**Cluster 6** (lines 29 — `readInitial()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

Sample mutation:
```diff
- return stored === 'light' || stored === 'dark' ? stored : 'dark';
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `theme.service.ts:29` in `readInitial` with assertions that distinguish the outcomes.

### `src/lib/cover/lw-cover.component.ts` — 1 surviving mutant

**Cluster 7** (lines 32): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- readonly alt = input('');
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `lw-cover.component.ts:32`. If it's a log message, classify as equivalent.

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.web-ui.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.
