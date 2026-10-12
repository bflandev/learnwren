# Mutation Test Report — `libs/web-admin`

> Generated 2026-10-12T00:54:40.767Z

**Headline mutation score: 100.00%** (killed=515, survived=0, no-cov=0, ignored=12). Score on covered mutants only: 100.00%. Adjusted (equivalent candidates excluded): 100.00%.


Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/admin-categories-page/admin-categories-page.component.ts` | 100.0% | 96 | 0 | 0 |
| `src/lib/admin-health-page/admin-health-page.component.ts` | 100.0% | 58 | 0 | 0 |
| `src/lib/admin-instructor-applications-page/admin-instructor-applications-page.component.ts` | 100.0% | 98 | 0 | 0 |
| `src/lib/admin-user-detail-page/admin-user-detail-page.component.ts` | 100.0% | 150 | 0 | 0 |
| `src/lib/admin-users-page/admin-users-page.component.ts` | 100.0% | 50 | 0 | 0 |
| `src/lib/admin-categories.service.ts` | 100.0% | 12 | 0 | 0 |
| `src/lib/admin-health.service.ts` | 100.0% | 2 | 0 | 0 |
| `src/lib/admin-instructor-applications.service.ts` | 100.0% | 9 | 0 | 0 |
| `src/lib/admin-role.guard.ts` | 100.0% | 22 | 0 | 0 |
| `src/lib/admin-users.service.ts` | 100.0% | 18 | 0 | 0 |

## Survivor clusters — gaps to close

_No actionable survivors after filtering equivalent candidates._

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.web-admin.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.
