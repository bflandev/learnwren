# Design System Foundation — Implementation Summary

**Date:** 2026-05-22
**Spec:** `docs/superpowers/specs/2026-05-22-design-system-adoption-design.md`
**Plan:** `docs/superpowers/plans/2026-05-22-design-system-foundation.md`

Slice 1 of the "Learn Wren studio" design-system adoption. Stands up a new `libs/web-ui` Nx library with the `--lw-*` token layer, wires Tailwind to read those CSS variables, and ships the first wave of design primitives (icon, button, card, pill, progress, cover, wordmark, theme toggle) plus a signal-based `ThemeService`. Replaces the placeholder hero in `apps/web` with a real authenticated/unauthenticated app shell. No product behaviour changes; pages not yet restyled keep their existing `slate-*` look.

## What shipped

### Library (`libs/web-ui`, alias `@learnwren/web-ui`)

- Scaffolded via `@nx/angular:library` with prefix `lw`, Vitest unit runner, tag `scope:web` (commits `ae0159d`, `4d9c482`). Non-buildable; consumed directly by `apps/web` and the feature libs.
- `libs/web-ui/src/styles/tokens.css` — design tokens copied unmodified from `docs/design/Learn Wren_files/tokens.css`. Defines `--lw-*` custom properties under `:root, .lw-theme-dark`, overrides for `.lw-theme-light`, density classes (`.lw-density-{compact,cozy,comfortable}`), and the `.lw-btn` / `.lw-pill` / `.lw-cover` / `.lw-progress` / `.lw-wordmark` component classes.
- `theme/theme.service.ts` — `@Injectable({providedIn: 'root'})`, signal-based, `theme()` / `toggle()` / `set()`. Persists to `localStorage` under `lw-theme`; reconciles a stored preference with the document-element class on construction. Default `'dark'`.
- `icon/lw-icon.component.ts` — `<lw-icon>` with inputs `name`, `size` (default 16), `stroke` (default 1.5). Ships 27 inline SVG paths transcribed from `primitives.jsx` plus `sun` / `moon` for the theme toggle. Inner SVG is bypassed through `DomSanitizer.bypassSecurityTrustHtml` and rendered via `[innerHTML]`.
- `button/lw-button.directive.ts` — `button[lwButton]` attribute directive with `variant: 'primary' | 'default' | 'ghost'`. Applies `lw-btn`, `lw-btn-primary`, `lw-btn-ghost` via the host metadata; keeps native `<button>` semantics.
- `wordmark/lw-wordmark.component.ts` — `<lw-wordmark>` italic-serif "Learn Wren" with the ochre dot from `tokens.css`; `size` input drives `font-size.px`.
- `card/lw-card.component.ts` — content-projected surface; host classes `block bg-bg-2 border border-line rounded-lg`.
- `pill/lw-pill.component.ts` — `<lw-pill>` with `active` boolean and `tone: 'default' | 'good' | 'warn' | 'bad'`. Tone maps to `var(--lw-{good,warn,bad})` via inline `color` style. (Spec listed `'ochre'` as a tone; it was not included at foundation ship and was added in the follow-up auth-pages slice — see Deviations.)
- `progress/lw-progress.component.ts` — `<lw-progress>` with `value` (0–1, clamped). Renders `.lw-progress` track + inner `<span>` fill at `width.%`. ARIA `progressbar` semantics added in `e46d6aa`.
- `cover/lw-cover.component.ts` — `<lw-cover>` with `tone: 'ochre' | 'moss' | 'clay' | 'ink' | 'paper' | 'bark'`, `glyph`, `label`, `height`. Renders the striped placeholder via the `.lw-cover` class set and `[data-tone]`.
- `theme-toggle/theme-toggle.component.ts` — `<lw-theme-toggle>` button bound to `ThemeService.toggle()`; renders `sun` (in dark mode) / `moon` (in light) and updates an `aria-label` reflecting the *next* theme (`5e287a7`).
- `src/index.ts` — barrel re-exporting `ThemeService`, `LwIconComponent`/`LwIconName`, `LwButtonDirective`/`LwButtonVariant`, `LwWordmarkComponent`, `LwCardComponent`, `LwPillComponent`/`LwPillTone`, `LwProgressComponent`, `LwCoverComponent`/`LwCoverTone`, `ThemeToggleComponent`.

### Web app (`apps/web`)

- `apps/web/project.json` — build `styles` array now leads with `libs/web-ui/src/styles/tokens.css`, then `apps/web/src/styles.scss`.
- `apps/web/src/styles.scss` — Tailwind directives plus a `body` baseline (`background: var(--lw-bg)`, `color: var(--lw-ink)`, `font-family: var(--lw-font-sans)`, `font-size: 14px`, `line-height: 1.45`, `letter-spacing: -0.005em`) and serif heading defaults for `h1`–`h4`. This is the non-artboard substitute for `.lw-screen`.
- `apps/web/src/index.html` — `<html class="lw-theme-dark">`, `<body class="lw-density-cozy">`, real `<title>Learn Wren</title>`, Google Fonts preconnect + a single `css2` request for **Inter Tight**, **Source Serif 4**, **JetBrains Mono**.
- `apps/web/tailwind.config.js` — `theme.extend` maps `bg`/`bg-{2,3}`, `line`/`line-2`, `ink`/`ink-{2,3,4}`, `ochre`/`ochre-{2,ink}`, `moss`/`clay`/`rust`/`good`/`warn`/`bad`, `fontFamily.{sans,serif,mono}`, `borderRadius.{sm,DEFAULT,lg,xl}`, and `boxShadow.{1,2}` onto the `--lw-*` variables. `fontFamily` uses the array form to satisfy Tailwind's plugin contract (`cccf2c2`).
- `apps/web/src/app/app.ts` + `app.html` — rewritten as the design-system app shell (`db53505`). Authenticated layout renders a sticky `<header>` with `<lw-wordmark>`, Dashboard / My Courses ghost-button nav links, `<lw-theme-toggle>`, and an avatar chip showing the user's two-letter initials computed from `AuthService.currentUser().displayName`. Unauthenticated layout renders only a centred `<main>` so login / register / forgot-password pages stay chrome-free.
- `apps/web/tsconfig.app.json` — project references re-synced after `apps/web` started importing `@learnwren/web-ui` directly (`5ae08ff`).

### Tests

- 27 Vitest specs across the nine `libs/web-ui` files at ship (`theme.service` 4, `lw-button` 3, `lw-icon` 3, `lw-card` 2, `lw-pill` 4, `lw-progress` 4, `lw-cover` 3, `lw-wordmark` 2, `theme-toggle` 2). Each primitive was added with a failing-first spec per the plan's TDD order.
- `apps/web/src/app/app.spec.ts` — rewritten (`db53505`) to provide a fake `AuthService` (signal-based `currentUser`) plus `provideRouter([])`, `provideHttpClient`, `provideHttpClientTesting`. Asserts: router outlet renders, no `<header>` for unauthenticated, `<header>` + `.lw-wordmark` + initials (`"EW"`) for authenticated. Removes the prior `data-testid="hero"` assertion.
- `apps/web-e2e/src/home.spec.ts` — re-pointed off the deleted `hero` element. New assertion: visiting `/` redirects to `/login` and the email control is visible.

## Plan deviations worth knowing about

- **`LwPillComponent` shipped without the `'ochre'` tone the spec listed.** The initial implementation (`0443c38`) accepted `'default' | 'good' | 'warn' | 'bad'` only. The `'ochre'` case was added later (`fc0a356`) when the courses-list restyle needed it. The directive's `LwPillTone` union and the in-component `switch` were widened at that point.
- **Tailwind `fontFamily` values are wrapped in arrays.** The plan's bare strings (`sans: 'var(--lw-font-sans)'`) tripped a Tailwind plugin contract, so the config ships `['var(--lw-font-sans)']` etc. (`cccf2c2`).
- **`LwProgressComponent` gained `progressbar` ARIA semantics on top of the planned implementation** (`e46d6aa`): host `role="progressbar"`, `aria-valuemin/max/now`. Not in the spec text; added during review.
- **`ThemeToggleComponent`'s `aria-label` describes the *target* theme.** Spec says "shows the current-theme icon"; the implementation icon already reflects current state, and the label now reads e.g. "Switch to light theme" while in dark (`5e287a7`).
- **`ThemeService.set()` got its own direct test** (`1885053`) in addition to the path that runs through `toggle()`, because `toggle()` never exercises the branch where `set()` is called with the *same* theme.
- **`LwButtonDirective` ghost-variant test asserts that the base `lw-btn` class is still present** (`e1be17c`) — the plan's ghost test only checked for `lw-btn-ghost`.
- **`LwIconComponent` gained a default-stroke regression test** (`038f8a0`) to lock the `stroke="1.5"` default.

## Verification outcome

- Unit: `pnpm nx test web-ui` and `pnpm nx test web` green at ship. 27 web-ui Vitest specs plus the four-case `App` spec.
- Typecheck and lint: green across `web-ui` and `web` (`pnpm nx run-many -t lint test build --projects=web-ui,web`).
- Build: `pnpm nx build web` green; bundle still emits both light and dark theme CSS as expected.
- Manual walk-through (per Task 14): visiting `http://localhost:4200` redirects to `/login` and renders on the dark earth-tone background with Inter Tight / Source Serif loaded; after sign-in the top bar shows the wordmark, nav links, theme toggle, and avatar initials; clicking the toggle flips the whole app between dark and light and the choice survives a reload.
- Visual: pages outside the shell (auth, courses, video) still rendered with their pre-existing `slate-*` styling at ship — expected and explicitly deferred to the follow-on slices.

## Follow-ups not in scope

- Restyling `web-auth`, `web-courses`, and `web-video` + dashboard. These are Slices 3–5 of the spec and shipped in subsequent slices (auth-pages restyle introduced the `lwInput` directive and the `'ochre'` pill tone; instructor-UI Plan A / B restyled `web-courses` and `web-video` + dashboard).
- Per-course deterministic cover tones (`coverToneForId`) — added later (`a072ee4`) once the catalog needed colour-keyed cards. The foundation `LwCoverComponent` accepts a `tone` input but does not compute one.
- Self-hosted fonts (spec §Non-Goals).
- User-facing density control — density is fixed at `cozy` in `<body>`.
- Global ⌘K search bar in the shell — dropped because there is no search feature at foundation time.
- Visual regression / screenshot harness — verification stays unit + manual.
