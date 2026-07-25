# Robin DS Port — Slice B: Component Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the donor's ~55-component spartan-ng/hlm library into `libs/web-ui`, styled by Learn Wren's `--lw-*` tokens, with the donor's specs and token-discipline guard alongside.

**Architecture:** The donor lib is class-strings-only (zero SCSS): components reference a semantic Tailwind utility layer (`bg-button-primary-bg`, `rounded-control`, `z-dialog`) defined in the donor app's 857-line `tailwind.css`. The port is therefore three artifacts: (1) the component TS + specs, (2) an expanded `@theme inline` block in `apps/web/src/tailwind.css` mapping ~110 new color roles + text/radius/shadow/spacing/z/motion keys onto `--lw-*` values emitted by `libs/web-design-system`, (3) ~340 lines of `ds-*` keyframes/global classes into `libs/web-ui/src/styles/hlm-globals.css`. Port proceeds by dependency tiers, each tier landing green.

**Tech Stack:** `@spartan-ng/brain@0.0.1-alpha.699` (peers all satisfied by Angular ~21.2 / CDK 21.2.10 / Tailwind 4), `@ng-icons/core`+`lucide@^33`, `class-variance-authority`, `clsx`, `tailwind-merge`, `luxon`.

**Donor (READ-ONLY):** `/Volumes/2002/slim-editorial-src/ui/libs/shared/ui` (components), `/Volumes/2002/slim-editorial-src/ui/apps/robin-client/src/tailwind.css` (theme layer, L30–520 `@theme`, L520–857 `ds-*` layer).

## Global Constraints

- Donor repo is read-only. Never write/commit/push under `/Volumes/2002`.
- Worktree branch `feat/ds-port-slice-b` from local HEAD; node_modules symlinked; deps: `pnpm add -Dw --lockfile-only` in worktree + `CI=true pnpm add -Dw` in main checkout, main manifest stays dirty until merge (see memory `robin-ds-port`).
- **Decisions locked here:**
  - **Do NOT port the 62.5% (10px rem) base or the ×1.6 Tailwind rescale.** Learn Wren keeps its 16px-rem scale; the new text roles (`text-body`, `text-page-title`, …) are defined in Learn Wren's own px values (body 14px etc., matching today's `.lw-screen`). Every donor class string then renders at Learn Wren proportions by construction.
  - **Keep `hlm` selectors/directive names** (vendor-style lib; keeps future donor diffs cheap). Scoped eslint override for the directive/component prefix rule in `libs/web-ui`.
  - **Skip:** `dynamic-field` (schema-driven form renderer, no consumer — port later if ever needed), donor `theme/` component (Learn Wren keeps its own `theme.service.ts` + toggle), vestigial stylelint target, `_ds-lw-aliases.css`.
  - New token values: component-scoped roles point at existing lw core wherever the donor's ds→lw mapping table says so (`docs/design-system/2026-07-24-lw-design-system-adoption-design.md` in the donor repo); genuinely new tiers (selection, overlay, nav-item, list-row, badge ramps) get values derived from the lw palette (bg-2/bg-3/ochre/moss mixes), each clearing the contrast gate.
  - Fix on port: the one `bg-gray-50` ramp leak; light-theme `--lw-ochre-ink`/`--lw-ochre` raised to ≥4.5:1 by darkening light-theme `--lw-ochre` (then delete the 3.2 carve-out in contrast.spec.ts).
- Gates per tier: `pnpm nx run-many -t lint test typecheck --projects=web-ui,web-design-system,web` + `pnpm lint:tokens` + `pnpm build:tokens` idempotence; full `web-e2e` at Tier 3 and at slice end.
- token-discipline floor (`>= N` exported consts) ratchets up with each tier — set it to the actual count at each tier's close.

---

### Task 1 (Tier 0a): Dependencies + lib plumbing

- [ ] Install: `clsx tailwind-merge class-variance-authority @ng-icons/core @ng-icons/lucide @spartan-ng/brain@0.0.1-alpha.699 luxon` (+`-D @types/luxon`) via the two-sided pnpm dance.
- [ ] `libs/web-ui` eslint: scoped override allowing `hlm` selector prefixes (keep `lw` for the existing primitives).
- [ ] Merge donor `test-setup.ts` ResizeObserver stub into `libs/web-ui/src/test-setup.ts`.
- [ ] Commit.

### Task 2 (Tier 0b): Theme layer expansion

- [ ] Extend `libs/web-design-system/tokens/` with the new role groups (button, badge, input/field, overlay, selection, card, nav-item, list, shadcn-compat semantic aliases, text roles, radius incl. `control/nav-item/badge/tooltip` + `md/xs`, shadows `raised/overlay/dialog`, spacing roles, z-index (`--z-index-*`!), motion tokens + reduced-motion zeroing, font weights, opacity) for BOTH themes; values per the mapping decisions above. build.mjs grows grouped emit; equivalence spec keeps passing (it checks the legacy blocks only); contrast gate extends to every new fg/bg pair.
- [ ] Extend `apps/web/src/tailwind.css` `@theme inline` from 30 → ~300 keys, adapted from donor L30–520 minus the rem-rescale block.
- [ ] Port donor `@layer app` `ds-*` keyframes/classes (~340 lines) to `libs/web-ui/src/styles/hlm-globals.css`; add to apps/web styles array.
- [ ] Commit.

### Task 3 (Tier 0c): `_internal` + guards

- [ ] Port `cn.ts` (+spec), `pad.ts`, `selection-flash.ts`; `cn.ts` key registry matches the Task 2 theme keys (its spec is the drift guard).
- [ ] Port `token-discipline.spec.ts` scaffold with floor set low; tighten its rules to also reject Tailwind default color ramps (`gray-\d`, `amber-\d`, …) in lib class strings.
- [ ] Commit.

### Tasks 4–9 (Tiers 1–5): Component ports in topological order

Tier batches (each = port impl + specs verbatim, swap any donor-only utility per Task 2 mapping, register exports in `src/index.ts`, ratchet token-discipline floor, run tier gates, commit):

- [ ] **Task 4 / Tier 1 (leaves):** accent, avatar, badge, breadcrumb, button-group, card, checkbox, dots, footer-content, form-field, header-actions, heading, icon, input, list, lookup, masked-date, panel, progress, radio, resizable, sidebar, skeleton, spinner, textarea. (Existing lw primitives with hlm equivalents — button, card, input, icon, pill≈badge, progress, avatar — are NOT deleted yet; consumers migrate in slices C–F, deletion happens there.)
- [ ] **Task 5 / Tier 2 (brain leaves):** button, label, separator, switch, toggle, toggle-group, tabs, tooltip, popover, dialog, menu, autocomplete.
- [ ] **Task 6 / Tier 3:** alert, boolean-radio, pagination, sheet, state, tags, toast, grid-state, reorderable-list, select, combobox, calendar. Run full web-e2e here.
- [ ] **Task 7 / Tier 4:** alert-dialog (incl. ConfirmDialogService).
- [ ] **Task 8 / Tier 5:** date-picker, duration-picker.
- [ ] **Task 9:** showcase route (dev-only) rendering every ported component in both themes for the visual pass.

### Task 10: Slice gates + land

- [ ] Full gates: run-many lint/test/typecheck across web-ui, web-design-system, web; `lint:tokens`; full `web-e2e`; browser pass over the showcase in both themes.
- [ ] Merge `--no-ff` from main checkout (discard main's dirty manifests first; `pnpm install` after).

## Notes for implementers

- Donor spec suite is 12.7k LOC and comes along verbatim per component — it is what makes the later Stryker rounds tractable. If a spec depends on robin-app fixtures, inline the fixture.
- `reorderable-list` is the only component with inline `styles:` (motion vars) — port as-is.
- Icons to register per component are listed in the component source; the lib-wide set is 13 lucide glyphs.
- brain's `hlm-tailwind-preset` is NOT used — don't import it.
