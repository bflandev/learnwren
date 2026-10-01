# Mutation Test Report — `libs/api-document-store`

> Generated 2026-10-01T05:41:29.819Z

**Headline mutation score: 100.00%** (killed=322, survived=0, no-cov=0, ignored=14). Score on covered mutants only: 100.00%. Adjusted (equivalent candidates excluded): 100.00%.


Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/document-store.port.ts` | 100.0% | 0 | 0 | 0 |
| `src/lib/in-memory-document-store.ts` | 100.0% | 165 | 0 | 0 |
| `src/lib/document-store.errors.ts` | 100.0% | 5 | 0 | 0 |
| `src/lib/firestore-document-store.ts` | 100.0% | 97 | 0 | 0 |
| `src/lib/run-transaction-with-retry.ts` | 100.0% | 18 | 0 | 0 |
| `src/lib/strip-undefined.ts` | 100.0% | 23 | 0 | 0 |
| `src/lib/user-profile.reader.ts` | 100.0% | 14 | 0 | 0 |

## Survivor clusters — gaps to close

_No actionable survivors after filtering equivalent candidates._

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.api-document-store.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.
