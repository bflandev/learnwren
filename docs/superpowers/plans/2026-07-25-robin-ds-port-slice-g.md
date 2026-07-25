# Robin DS Port — Slice G: Data-Table + Retirement Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the donor's TanStack data-table lib as `libs/web-data-table` (restyled onto `--lw-*`), tokenize the remaining raw-color stragglers, re-tighten the bundle budget, and land the closing gates of the design-system port.

**Donor (READ-ONLY):** `/Volumes/2002/slim-editorial-src/ui/libs/shared/data-table`.

## Global Constraints

- Worktree `feat/ds-port-slice-g`; symlinked node_modules; per-command cd prefix; specific-path `git add`; the two-sided pnpm dance for new deps (`@tanstack/angular-table@^8`, `@tanstack/angular-virtual@^5`).
- The lib has NO consumer yet (first use is opt-in later). It must build/test standalone, tagged like web-ui, `sideEffects: false` package.json + pnpm-workspace exclusion (web-ui precedent), exports via `@learnwren/web-data-table` tsconfig path.
- Restyle: donor class strings use the same semantic utility layer web-ui uses (theme keys exist from slice B); any donor-only key → add to `@theme` + cn registry together. hlm selectors kept; donor `robin-` selector prefixes → `lw-` (these are components learnwren consumes by tag; eslint prefix list already allows lw/hlm/brn).
- Donor specs come along verbatim (test-setup mirrors web-ui's ResizeObserver stub).
- Tokenize the `.lw-cover` gradient/label/glyph oklch literals in recipes.css into `--lw-cover-*` tokens (sources + build + generated), then remove the recipes.css exemption from `scripts/lint-tokens.sh` entirely.
- Bundle budget: after build, set `maximumWarning` to measured initial + ~10%, `maximumError` +25% (the migration-window 1.2/1.5MB values were temporary).
- Gates: `pnpm nx run-many -t lint test typecheck --projects=web-data-table,web-ui,web,web-design-system` + `lint:tokens` + `nx build web` + full `web-e2e` on shifted ports.

## Tasks

- [ ] **Task 1:** deps + lib scaffold + port (impl + specs) + restyle + any theme-key additions. Commits per tier of the lib (models/host/list or as its structure suggests).
- [ ] **Task 2:** cover-gradient tokenization + lint-tokens exemption removal; budget re-tighten. Commit.
- [ ] **Task 3 (coordinator):** gates, e2e, merge; memory + docs updates; final report.
