# Robin DS Port — Slice C: Forms & Shell Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `libs/web-auth` (5 pages) and the `apps/web` shell + dashboard onto the hlm components, establishing the form/button/alert idioms every later slice copies; delete the dead `lw-icon`.

**Architecture:** Slices C–F regrouping per the 2026-07-25 sweep survey (in the C–F plans' shared context): C = forms & shell, D = admin, E = courses+video+enrollment, F = public surfaces + last-consumer deletions. Old `lw-*` primitives are NOT deleted in C (they still have consumers) except `LwIconComponent`, which has zero consumers today.

**Tech Stack:** `@learnwren/web-ui` hlm components (slice B), Angular 21 signals/zoneless.

## Global Constraints

- Worktree branch `feat/ds-port-slice-c` from local HEAD, node_modules symlinked; per-command `cd <worktree> && pwd &&` prefix; `git add` specific paths only, never `-A`.
- Visual language: hlm variants map as — primary action `hlmBtn` (default variant), secondary/nav `variant="ghost"`, outline where the old `.lw-btn` (plain) was, destructive for dangerous actions, `variant="link"` for inline links styled as actions.
- Keep ALL `data-testid`/`data-test` hooks unchanged.
- `hlm-avatar` has no `displayName`/`userId`/initials/tone inputs: keep `avatar-tone.ts` + `deriveInitials` from the old lw avatar and content-project `<span>{{ initials }}</span>` as the fallback; picture via `src`.
- `lw-wordmark`, `lw-theme-toggle`, `lw-cover` have no hlm equivalent and STAY as-is.
- Gates per task: `pnpm nx run-many -t lint test typecheck --projects=web,web-auth,web-ui` + `lint:tokens`; slice end: affected e2e (auth flows, profile-picture, uc-01-03) on shifted emulator ports (`WEB_PORT=4300 FIRESTORE_EMULATOR_HOST=127.0.0.1:8090 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9109 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9209`, scratchpad shifted firebase config) — rerun any failure in isolation before treating as real (known machine-load flakes).

---

### Task 1: web-auth — form idiom

**Files:** all 5 page components in `libs/web-auth/src/lib/**` (login, register, register-confirm, unlock, forgot-password — templates + minor TS import changes), their specs.

- [ ] Replace `lwInput` → `hlmInput` (same attribute-directive shape), `lwButton` → `hlmBtn`.
- [ ] Wrap label+input+error trios in `hlm-form-field` with `hlmLabel`, `hlmFormFieldControl`, `hlmFormFieldError` / `hlmFormFieldHint`.
- [ ] Login's 4-branch `@switch` error block → single `<hlm-alert severity="error">` with the branch text inside (branch logic stays in TS/template, only the container changes).
- [ ] Busy buttons: `<hlm-spinner size="sm" />` + label inside `hlmBtn` (disabled while busy).
- [ ] Update lib specs where they assert old classes (survey says web-auth is testid-anchored — verify, adjust only if needed). Run web-auth tests.
- [ ] Commit: `feat(web-auth): migrate to hlm form components (ds sweep C)`.

### Task 2: apps/web shell + dashboard

**Files:** `apps/web/src/app/app.html`, `app.ts` (imports), `dashboard/dashboard.component.{html,ts}`, `apps/web/src/app/app.spec.ts`.

- [ ] Nav `.lw-btn-ghost` links → `hlmBtn variant="ghost"` on the `<a>` elements (hlmBtn works on anchors).
- [ ] Header search input → `hlmInput type="search"`.
- [ ] Header avatar chip: `lw-avatar` → `hlm-avatar` + projected initials fallback per the Global Constraints recipe; keep `deriveInitials`/`avatarToneFor` (import from their current home in web-ui — they survive the eventual `LwAvatarComponent` deletion by moving alongside the shell if needed later; for now import as-is).
- [ ] Dashboard: `lw-card` → `hlm-card` (+ header/content parts), `lw-pill` → `hlmBadge`, `lwButton` → `hlmBtn`, "Loading…" text → `<hlm-skeleton>` rows.
- [ ] `app.spec.ts:155` `querySelector('lw-avatar')` → `hlm-avatar`.
- [ ] Commit: `feat(web): shell + dashboard onto hlm components (ds sweep C)`.

### Task 3: delete dead lw-icon + e2e selector updates

- [ ] Delete `libs/web-ui/src/lib/icon/lw-icon.component.ts` + its spec + barrel line (zero consumers — verify with grep first; `hlm-icon` is the replacement and already exported).
- [ ] `apps/web-e2e/src/profile-picture.spec.ts` (9 assertions) and `uc-01-03-text-profile.spec.ts` (2): `.lw-avatar-initials` / `img.lw-avatar-image` → the hlm-avatar equivalents (inspect rendered DOM: `hlm-avatar` element, projected `<span data-testid>` if needed — prefer adding a `data-testid="header-avatar-initials"` to the projected span in Task 2 and asserting on that, decoupling e2e from component internals permanently).
- [ ] Commit: `test(web-e2e): decouple avatar assertions; chore(web-ui): delete dead lw-icon`.

### Task 4: slice gates + land

- [ ] `pnpm nx run-many -t lint test typecheck --projects=web,web-auth,web-ui` + `pnpm lint:tokens` + `pnpm build:tokens` idempotence.
- [ ] e2e: auth.spec, profile-picture.spec, uc-01-03-text-profile.spec (+ smoke: full suite if machine quiet) on shifted ports.
- [ ] Browser pass: login, register, dashboard, header — both themes.
- [ ] Merge `--no-ff` from main checkout; remove worktree.
