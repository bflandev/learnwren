# Mutation Test Report — `libs/api-http-errors`

> Generated 2026-05-29T07:15:02.153Z

**Headline mutation score: 90.91%** (killed=70, survived=5, no-cov=2, ignored=0). Score on covered mutants only: 93.33%. Adjusted (equivalent candidates excluded): 90.91%.


Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/exception-response.ts` | 90.9% | 70 | 5 | 2 |

## Survivor clusters — gaps to close

### `src/lib/exception-response.ts` — 7 surviving mutants

**Cluster 1** (lines 35 — `isDomainShaped()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- typeof (exception as { status?: unknown }).status === 'number'
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `exception-response.ts:35` in `isDomainShaped` with assertions that distinguish the outcomes.

**Cluster 2** (lines 72 — `for()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (!field) continue;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `exception-response.ts:72` in `for` with assertions that distinguish the outcomes.

**Cluster 3** (lines 80–81 — `normalizeMessages()`): 3 mutants surviving — ConditionalExpression×1, ArrayDeclaration×2

Sample mutation:
```diff
- if (Array.isArray(message)) return message;
+ <replaced with: true>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `exception-response.ts:80` in `normalizeMessages`, not just truthiness.

**Cluster 4** (lines 90 — `respondValidation()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- message: 'Request body failed validation.',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `exception-response.ts:90` in `respondValidation`. If it's a log message, classify as equivalent.

**Cluster 5** (lines 112 — `handleException()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (exception.details) body.error.details = exception.details;
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `exception-response.ts:112` in `handleException` with assertions that distinguish the outcomes.

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.api-http-errors.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.
