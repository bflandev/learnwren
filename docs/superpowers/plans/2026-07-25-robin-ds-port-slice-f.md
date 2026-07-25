# Robin DS Port — Slice F: Public Surfaces Sweep + Legacy Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `libs/web-catalog` (7), `libs/web-profile` (5), `libs/web-learn` (2), `libs/web-landing` (9) onto hlm, then delete every superseded legacy primitive (`LwButtonDirective`, `LwCardComponent`, `LwPillComponent`, `LwInputDirective`, `LwAvatarComponent`) and the dead recipe classes (`.lw-btn*`, `.lw-pill*`, `.lw-meta`, `.lw-mono`).

**Architecture:** Same pattern as C–E (merges 0c63a61, 3bc3557, 46eba6b). This is the last-consumer slice: deletions land in a final cleanup commit only after all four libs migrate. KEEP: `LwWordmarkComponent`, `LwCoverComponent` + `cover-tone.ts`, `ThemeToggleComponent`, `avatar-tone.ts`/`deriveInitials` (consumed by shell), `.lw-cover*`/`.lw-progress`/`.lw-wordmark`/`.lw-screen` recipe classes (landing's decorative divs and the kept components).

## Global Constraints

- Worktree `feat/ds-port-slice-f`; symlinked node_modules; per-command cd prefix; specific-path `git add`.
- Variant mapping and idioms per C–E. Filterable selects → `hlmSelectSingle` (D's categories pattern).
- Known spec churn (budgeted): `course-card.component.spec.ts` (lw-pill/lw-avatar assertions), `catalog-filter-bar.component.spec.ts` (HTMLSelectElement → hlmSelectSingle driving), `course-detail-page.component.spec.ts:247` (lw-avatar img), `landing-testimonial.component.spec.ts` (lw-avatar). `landing-shelf`/`landing-footer` specs assert `lw-cover`/`lw-wordmark` — those components stay; specs unchanged.
- web-learn is greenfield styling: outline rows → `hlmBtn variant="ghost"` + `aria-current`, completion banner → `hlm-alert severity="success"`, processing → `hlmBadge variant="warning"`; keep `<details>` accordions and all testids.
- Avatar swaps follow the shell recipe (C): `hlm-avatar [src]` + projected initials span; import `deriveInitials`/`avatarToneFor` (they survive the LwAvatar deletion — if they live inside the avatar dir, move them to `libs/web-ui/src/lib/avatar-tone/` first and update imports).
- Deletion commit checklist (after all four libs green): delete the five primitives + their specs + barrel lines; strip `.lw-btn`, `.lw-btn-ghost`, `.lw-btn-primary`, `.lw-pill`, `.lw-pill-active`, `.lw-meta`, `.lw-mono` from `libs/web-ui/src/styles/recipes.css` (keep `.lw-screen`, `.lw-wordmark*`, `.lw-cover*`, `.lw-progress`, scrollbar rules); then gates: `grep -rn "lwButton\|lw-card\|lw-pill\|lwInput\|lw-avatar\|lw-btn\|lw-meta\|lw-mono" apps libs --include='*.html' --include='*.ts'` (excluding node_modules, kept components' own files) returns nothing.
- Remove the recipes.css exemption from `scripts/lint-tokens.sh` if the remaining recipe rules pass the raw-color check (they use var(--lw-*) plus a few oklch() literals in .lw-cover gradients — if oklch literals remain, keep the exemption and note it for slice G).
- Gates per batch: `pnpm nx run-many -t lint test typecheck --projects=web,web-catalog,web-profile,web-learn,web-landing,web-ui` + `lint:tokens`; slice end: `catalog.spec.ts enrollment.spec.ts learn.spec.ts home.spec.ts profile-picture.spec.ts email-change.spec.ts password-change.spec.ts instructor-application.spec.ts` then full suite on shifted ports.

## Tasks

- [ ] **Task 1 (F1):** web-catalog (cards, pills→badges, avatars, filter-bar selects, search input) + web-profile (forms onto hlm-form-field, avatar uploader keeps its own lw-avatar? NO — swap to hlm-avatar with initials projection; update `profile-picture.spec.ts` uploader-preview locator `img.lw-avatar-image` → hlm equivalent) + web-learn greenfield. Commits per lib.
- [ ] **Task 2 (F2):** web-landing (recipe classes → hlmBtn/hlmBadge; `.lw-meta`/`.lw-mono` → token utilities (`text-ink-3 text-xs tracking-wide` / `font-mono`); keep lw-cover/lw-wordmark components and decorative hero divs) + the mass deletion commit + recipes.css strip + lint-tokens exemption review. Commits: landing, then deletion.
- [ ] **Task 3 (coordinator):** slice gates, full e2e, browser pass (landing + catalog + learn, both themes), merge.
