# Mutation Test Report — `libs/api-document-store`

> Generated 2026-10-01T11:02:43.121Z

**Headline mutation score: 100.00%** (killed=624, survived=0, no-cov=0, ignored=16). Score on covered mutants only: 100.00%. Adjusted (equivalent candidates excluded): 100.00%.


Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/document-store.port.ts` | 100.0% | 0 | 0 | 0 |
| `src/lib/in-memory-document-store.ts` | 100.0% | 172 | 0 | 0 |
| `src/lib/data-store.config.ts` | 100.0% | 24 | 0 | 0 |
| `src/lib/document-store.errors.ts` | 100.0% | 5 | 0 | 0 |
| `src/lib/document-store.module.ts` | 100.0% | 11 | 0 | 0 |
| `src/lib/firestore-document-store.ts` | 100.0% | 97 | 0 | 0 |
| `src/lib/postgres/auto-id.ts` | 100.0% | 8 | 0 | 0 |
| `src/lib/postgres/paths.ts` | 100.0% | 13 | 0 | 0 |
| `src/lib/postgres/postgres-document-store.ts` | 100.0% | 160 | 0 | 0 |
| `src/lib/postgres/sql-query.ts` | 100.0% | 78 | 0 | 0 |
| `src/lib/run-transaction-with-retry.ts` | 100.0% | 18 | 0 | 0 |
| `src/lib/strip-undefined.ts` | 100.0% | 23 | 0 | 0 |
| `src/lib/user-profile.reader.ts` | 100.0% | 14 | 0 | 0 |
| `src/lib/postgres/schema.ts` | 100.0% | 1 | 0 | 0 |

## Survivor clusters — gaps to close

_No actionable survivors after filtering equivalent candidates._

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.api-document-store.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.
