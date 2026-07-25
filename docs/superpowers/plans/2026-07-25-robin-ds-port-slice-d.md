# Robin DS Port — Slice D: Admin Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `libs/web-admin` (5 pages, ~564 template LOC) onto hlm components — the repo's densest hand-rolled-button surface, fully `data-testid`-anchored (zero selector-coupled specs).

**Architecture:** Same sweep pattern as slice C (merge 0c63a61 shows the established idioms: `hlmBtn` variants, `hlm-form-field`, `hlm-alert`, `hlm-skeleton`). Admin adds three firsts: `hlm-pagination` (replaces the hand-rolled prev/next bar), `hlmSelectSingle` (reassign-category select), and cleanup of the repo's only raw-palette violations (`text-amber-*`/`bg-amber-*`).

## Global Constraints

- Worktree `feat/ds-port-slice-d` from local HEAD; node_modules symlink; per-command `cd <worktree> && pwd &&`; `git add` specific paths only.
- Variant mapping (from slice C): `.lw-btn` → `hlmBtn variant="outline"`, `.lw-btn-primary` → default, `.lw-btn-ghost` → `variant="ghost"`, destructive actions (delete/demote/suspend confirm) → `variant="destructive"`; `.lw-btn-secondary` is an UNDEFINED class today (renders unstyled) — replace with `variant="secondary"`.
- Keep every `data-testid` unchanged. Inline row-level confirm flows (signal-swapped markup) KEEP their inline mechanics — restyle only (an alert-dialog refactor is not worth the spec churn; note as deferred).
- Raw amber utilities → `hlm-alert severity="warning"` or `text-warn`/`bg-*` token utilities; after this slice `grep -rE '\b(amber|red|gray)-[0-9]+' libs/web-admin/src` must return nothing.
- `hlm-pagination` API: `[total]`, `[pageSize]`, `[siblingCount]`, `[(page)]` (1-based). Admin drives `page()`/`totalPages()` — bind `[total]="totalItems()"` if available, else compute `total = totalPages() * pageSize` only as a last resort (check the service for a real total count first; report which).
- Gates: `pnpm nx run-many -t lint test typecheck --projects=web,web-admin,web-ui` + `lint:tokens`; e2e `admin-users.spec.ts admin-categories.spec.ts admin-instructor-applications.spec.ts` on shifted ports; isolate-rerun any failure before treating as real.

## Tasks

- [ ] **Task 1:** admin-users-page + user-detail: buttons (50 across the pages), search input → `hlmInput` + lucideSearch overlay (slice-C search idiom), status badges → `hlmBadge`/`hlm-state-pill`, error+Retry → `hlm-alert` + `hlmBtn`, loading → `hlm-skeleton`. Commit.
- [ ] **Task 2:** admin-categories-page: inputs, buttons, reassign `<select>` → `hlmSelectSingle` + trigger/portal/items, inline rename/delete confirms restyled. Commit.
- [ ] **Task 3:** admin-health-page + instructor-applications: amber blocks → `hlm-alert severity="warning"`, buttons, badges; hand-rolled pagination → `hlm-pagination`. Commit.
- [ ] **Task 4 (coordinator):** gates, e2e, browser pass, merge `--no-ff`.
