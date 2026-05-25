# Auth Pages Restyle — Implementation Summary

**Date:** 2026-05-22
**Spec:** `docs/superpowers/specs/2026-05-22-design-system-adoption-design.md`
**Plan:** `docs/superpowers/plans/2026-05-22-auth-pages-restyle.md`

Slice 3 of the design-system adoption. The five standalone `web-auth` pages — login, register, register-confirm, forgot-password, unlock — are restyled into the Learn Wren dark design system so their text is legible on the dark `bg-bg` body. A new `lwInput` attribute directive is added to `libs/web-ui` (10th export) so form inputs match the design tokens. No component logic changed; templates and `@Component.imports` only.

## What shipped

### Angular (`libs/web-ui`)

- `libs/web-ui/src/lib/input/lw-input.directive.ts` — standalone `LwInputDirective`. Selector `input[lwInput]` at commit-time (selector was widened to `input, textarea, select` later the same day in `2c32807`, after the slice's auth-page work was already merged). `host.class` applies `block w-full rounded border border-line bg-bg px-3 py-2 text-ink outline-none placeholder:text-ink-4 focus:border-ochre disabled:opacity-50`.
- `libs/web-ui/src/lib/input/lw-input.directive.spec.ts` — 2 vitest specs covering the class application and the consumer-class preservation case (commit `4ff567e` lifts the host components to module scope to avoid the per-test `TestBed.resetTestingModule()` the plan's exact-text spec used).
- `libs/web-ui/src/index.ts` — adds `export * from './lib/input/lw-input.directive'` as the 10th export (now 11th: a `cover-tone` re-export was added in a parallel `web-ui` change).

### Angular (`libs/web-auth`)

All five pages now use `bg-bg-2 border border-line rounded-lg` as the wrapper, `lwInput` on every form input, `lwButton` with `variant="primary"` on every submit and `variant="ghost"` (or default) on inline action buttons, and `text-ochre hover:underline` on secondary `<a routerLink>` links. Error/locked/unverified branches recolour to `text-bad` / `text-warn` / `text-good`. Labels use `text-ink-2`; helper hints use `text-ink-3`.

- `login-page/login-page.component.{ts,html}` — adds `LwButtonDirective, LwInputDirective` to imports; template rewritten with the new card surface and design-token error states (`invalid`, `unverified`, `locked`, `generic`).
- `register-page/register-page.component.{ts,html}` — same import addition; password hints rendered as `text-xs text-ink-3` bulleted list.
- `register-confirm-page/register-confirm-page.component.{ts,html}` — adds `LwButtonDirective` to imports; resend button restyled, confirmation `text-good`, dashboard link as ochre text.
- `forgot-password-page/forgot-password-page.component.{ts,html}` — adds both directives; pre/post-submit branches both restyled. A follow-up polish commit (`cf83380`) applies `text-ink-2` to the link paragraphs for consistency with the rest of the slice.
- `unlock-page/unlock-page.component.html` — template-only edit (no `<button>`/`<input>`, no imports change); all five `state().kind` branches restyled.
- `libs/web-auth/tsconfig.lib.json` — `nx sync` adds the `@learnwren/web-ui` project reference now that `web-auth` imports it (commit `212e276`).

## Plan deviations worth knowing about

- **Card surface vs. `<lw-card>` component (planned).** Documented at the top of the plan as a deliberate deviation from the spec's prose ("card surface (lw-card)"). The restyle applies `bg-bg-2 border border-line rounded-lg p-6` directly to each page's `<section>` wrapper rather than wrapping content in `LwCardComponent`. Identical visual result; one less import per file. `LwCardComponent` stays available for genuine card components (course cards) in Slice 4.
- **Secondary nav links use inline `text-ochre hover:underline` anchors, not `lwButton`.** Also documented at the top of the plan. The `lwButton` directive's selector is `button[lwButton]` and does not match `<a routerLink>`; styling anchors as ochre text links is the correct treatment.
- **`lw-input.directive.spec.ts` lifts the host components to module scope.** The plan's exact-text spec declared the second host component inside the `it()` callback and called `TestBed.resetTestingModule()`. Commit `4ff567e` (same day) moved both host components to module scope — cleaner and idiomatic for vitest/Angular TestBed. Two test cases, both green.
- **Same-day extension of `lwInput` to `textarea` and `select`** (commit `2c32807`, ~30 minutes after the slice's last auth-page commit). The slice as planned shipped `input[lwInput]` only; the widened selector and four-case spec (input, with-class, textarea, select) are the current state on disk but were a forward-looking extension landed in the same dev session, not strictly part of Slice 3's plan. The auth pages do not use `lwInput` on a `<textarea>` or `<select>`.

## Verification outcome

- **Unit tests**: all green per the plan's Task 7 verification. `libs/web-ui` adds 2 specs from the new directive (4 specs after the same-day textarea/select extension). The five existing `web-auth` page specs (login 20, register 9, register-confirm 2, forgot-password 3, unlock 6 — 40 cases total) all stayed green because the restyle preserved element types (`<input formControlName>`, `<button>`) and text content (the assertion surface of those specs).
- **Typecheck + lint + build**: covered by `pnpm nx run-many -t lint test typecheck build --projects=web-ui,web-auth,web` in Task 7 Step 3.
- **Browser walk-through (Task 7 Step 4)**: manual confirmation of dark-surface cards, legible warm-white headings/labels, design-styled inputs, ochre primary button, and a working form submission on `/login`, `/register`, `/forgot-password`. Not automated.
- The slice ships as 9 commits between `791a3e1` (directive) and `212e276` (tsconfig sync) on 2026-05-22, plus the follow-up polish `cf83380` and the directive extension `2c32807` the same day.

## Follow-ups not in scope

Per the spec's §2 / Non-Goals and the plan's "Out of scope" self-review note:

- **Slice 4 — restyle `web-courses`** (course list, create, editor, materials, publish bar).
- **Slice 5 — restyle `web-video` + dashboard** (upload, player chrome, `video-state-badge` via `LwPill`, dashboard hero).
- **`LwPillComponent` missing `ochre` tone** — flagged in the foundation's final review; deferred to Slice 5's video-badge work. (Subsequently shipped on its own; see commit `fc0a356`.)
- **Visual regression tooling, self-hosted fonts, density toggle, global ⌘K search** — all explicitly out of scope for the whole design-system adoption per spec Non-Goals.
- **No new product features.** The auth pages' behaviour, validators, redirect handling, and signal-state machine are untouched by this slice.
