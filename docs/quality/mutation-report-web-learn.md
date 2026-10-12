# Mutation Test Report — `libs/web-learn`

> Generated 2026-10-12T00:59:25.651Z

**Headline mutation score: 100.00%** (killed=373, survived=0, no-cov=0, ignored=4). Score on covered mutants only: 100.00%. Adjusted (equivalent candidates excluded): 100.00%.


Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/lesson-player-page/lesson-player-page.component.ts` | 100.0% | 244 | 0 | 0 |
| `src/lib/course-outline-panel/course-outline-panel.component.ts` | 100.0% | 50 | 0 | 0 |
| `src/lib/learn.service.ts` | 100.0% | 17 | 0 | 0 |
| `src/lib/position-saver.ts` | 100.0% | 62 | 0 | 0 |

## Survivor clusters — gaps to close

_No actionable survivors after filtering equivalent candidates._

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.web-learn.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.
