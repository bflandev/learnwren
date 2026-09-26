# Mutation Test Report — `libs/api-object-storage`

> Generated 2026-09-26T08:47:44.968Z

**Headline mutation score: 100.00%** (killed=248, survived=0, no-cov=0, ignored=3). Score on covered mutants only: 100.00%. Adjusted (equivalent candidates excluded): 100.00%.


Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/gcs-object-storage.ts` | 100.0% | 66 | 0 | 0 |
| `src/lib/s3-object-storage.ts` | 100.0% | 125 | 0 | 0 |
| `src/lib/object-storage.config.ts` | 100.0% | 37 | 0 | 0 |
| `src/lib/public-media.controller.ts` | 100.0% | 19 | 0 | 0 |
| `src/lib/object-storage.port.ts` | 100.0% | 1 | 0 | 0 |

## Survivor clusters — gaps to close

_No actionable survivors after filtering equivalent candidates._

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.api-object-storage.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.
