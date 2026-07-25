# Mutation Test Report — `libs/web-data-table`

> Generated 2026-07-25T10:26:40.851Z

**Headline mutation score: 100.00%** (killed=1634, survived=0, no-cov=0, ignored=111). Score on covered mutants only: 100.00%. Adjusted (equivalent candidates excluded): 100.00%.


Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/column-menu/column-menu.component.ts` | 100.0% | 26 | 0 | 0 |
| `src/lib/data-table-list/data-table-list.component.ts` | 100.0% | 477 | 0 | 0 |
| `src/lib/filter-editor/data-table-filter-editor.component.ts` | 100.0% | 73 | 0 | 0 |
| `src/lib/filter-editor/filter-field.util.ts` | 100.0% | 93 | 0 | 0 |
| `src/lib/inline-editor/data-table-inline-editor.component.ts` | 100.0% | 107 | 0 | 0 |
| `src/lib/sidebar/data-table-sidebar.component.ts` | 100.0% | 54 | 0 | 0 |
| `src/lib/state/data-table-state.service.ts` | 100.0% | 259 | 0 | 0 |
| `src/lib/state/view-favorites.service.ts` | 100.0% | 55 | 0 | 0 |
| `src/lib/title-bar/data-table-title-bar.component.ts` | 100.0% | 77 | 0 | 0 |
| `src/lib/util/cell-control.util.ts` | 100.0% | 19 | 0 | 0 |
| `src/lib/util/column-order.util.ts` | 100.0% | 22 | 0 | 0 |
| `src/lib/util/group-columns.ts` | 100.0% | 54 | 0 | 0 |
| `src/lib/view-picker/view-picker.component.ts` | 100.0% | 32 | 0 | 0 |
| `src/lib/domain/data-table-filter.model.ts` | 100.0% | 46 | 0 | 0 |
| `src/lib/filter-menu/data-table-filter-menu.component.ts` | 100.0% | 16 | 0 | 0 |
| `src/lib/row-menu/data-table-row-menu.component.ts` | 100.0% | 2 | 0 | 0 |
| `src/lib/state/data-table-filter-store.ts` | 100.0% | 32 | 0 | 0 |
| `src/lib/title-box/title-box.component.ts` | 100.0% | 18 | 0 | 0 |
| `src/lib/util/bulk-edit-value.util.ts` | 100.0% | 66 | 0 | 0 |
| `src/lib/util/field-summary.util.ts` | 100.0% | 104 | 0 | 0 |
| `src/lib/view-menu/view-menu.component.ts` | 100.0% | 2 | 0 | 0 |

## Survivor clusters — gaps to close

_No actionable survivors after filtering equivalent candidates._

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.web-data-table.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.
