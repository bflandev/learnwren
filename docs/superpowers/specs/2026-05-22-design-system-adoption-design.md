# Design System Adoption Design Spec

**Status:** Draft
**Scope:** Adopt the "Learn Wren studio" design system (delivered as a Claude Design artifact in `docs/design/`) into the Angular web app. Establish the token layer, a shared `web-ui` component library, and the app shell; then restyle the already-built pages. No new product features.

## Goal

Replace the app's current ad-hoc `slate-*` Tailwind styling with the earth-tone, dark-mode-first "Learn Wren studio" design system. After this work, every page renders with the design's tokens (colour, type, spacing, radii), the app has real layout chrome instead of a centered-text placeholder, and a dark/light theme toggle works at runtime.

The design artifact lives at `docs/design/Learn Wren.html` with assets in `docs/design/Learn Wren_files/` — notably `tokens.css` (the token source), `primitives.jsx` (component reference), and screen mockups (`dashboard.jsx`, `catalogue.jsx`, `detail.jsx`, `player.jsx`, `search.jsx`).

## Non-Goals

Explicitly out of scope:

- **New features.** The design mocks student-facing discovery/learning screens (browse catalogue, course detail, search, student dashboard). Course discovery, enrollment, and the student learning experience remain unbuilt and are not part of this work. Their mockups inform `web-ui` but no new routes/pages are created.
- **Self-hosted fonts.** Fonts load from Google Fonts via `<link>` (matches the design artifact). Self-hosting is noted as later hardening.
- **User-facing density control.** `tokens.css` defines compact/cozy/comfortable density modes; the app fixes density at `cozy`. No UI to change it.
- **A global search bar / ⌘K.** The design's `TopNav` includes one; there is no search feature, so it is dropped from the app shell.
- **Visual regression tooling.** No screenshot/Chromatic harness is set up; verification is unit tests plus manual walk-through.

## Decisions Made During Brainstorming

| Decision | Choice | Rationale |
| :--- | :--- | :--- |
| Scope | Design system only — foundation + restyle existing pages | The design targets unbuilt student features; restyling what exists is the achievable, valuable slice. The `web-ui` lib pays off later when those features are built. |
| Token mechanism | Hybrid — `tokens.css` CSS variables + Tailwind theme references them | Keeps Tailwind as the authoring API (consistent with the codebase) while CSS variables drive runtime dark/light theming, which static Tailwind values cannot do cleanly. |
| Theme default | Dark, with a user-facing toggle to light | Matches the design's stated intent ("Dark mode is the default"); both themes already exist in `tokens.css`. |
| Rollout | Approach A — foundation first, then restyle one feature lib per slice | Matches the repo's vertical-slice convention; each slice is independently reviewable and shippable. |
| Shared components | New Nx lib `libs/web-ui` (`@learnwren/web-ui`) | A shared home for design-system primitives; reused by every feature lib and by future student screens. |
| App shell | Composed in `apps/web`, not in `web-ui` | The shell is route- and auth-aware (app-specific); it consumes `web-ui` primitives but is not itself a reusable primitive. |

## 1. Token Layer

### 1.1 `tokens.css`

The design's `tokens.css` becomes the design-system source of truth. It moves to `libs/web-ui/src/styles/tokens.css` **unmodified** — it already defines:

- All `--lw-*` custom properties under `:root, .lw-theme-dark` and the overrides under `.lw-theme-light`.
- Density classes `.lw-density-{compact,cozy,comfortable}`.
- Component classes `.lw-btn`, `.lw-pill`, `.lw-cover`, `.lw-progress`, `.lw-wordmark`, `.lw-meta`, `.lw-mono`, plus `.lw-screen`.

**Important:** `.lw-screen` is an *artboard* helper (`overflow: hidden`, fixed height) meant for the design canvas — the real app does **not** use it. Equivalent base styles (background, ink colour, font, font-size, letter-spacing) are applied to `body` instead (§1.4).

`apps/web/src/styles.scss` imports the file before the `@tailwind` directives:

```scss
@import '../../../libs/web-ui/src/styles/tokens.css';

@tailwind base;
@tailwind components;
@tailwind utilities;
```

### 1.2 Fonts

`apps/web/src/index.html` `<head>` gains the Google Fonts link for the three families used by the design — **Inter Tight**, **Source Serif 4**, **JetBrains Mono** — with `preconnect` hints, matching the design artifact's `css2` request.

### 1.3 Tailwind theme

`apps/web/tailwind.config.js` `theme.extend` maps semantic names onto the CSS variables so Tailwind utilities resolve to tokens:

```js
theme: {
  extend: {
    colors: {
      bg:    { DEFAULT: 'var(--lw-bg)', 2: 'var(--lw-bg-2)', 3: 'var(--lw-bg-3)' },
      line:  { DEFAULT: 'var(--lw-line)', 2: 'var(--lw-line-2)' },
      ink:   { DEFAULT: 'var(--lw-ink)', 2: 'var(--lw-ink-2)', 3: 'var(--lw-ink-3)', 4: 'var(--lw-ink-4)' },
      ochre: { DEFAULT: 'var(--lw-ochre)', 2: 'var(--lw-ochre-2)', ink: 'var(--lw-ochre-ink)' },
      moss:  'var(--lw-moss)',
      clay:  'var(--lw-clay)',
      rust:  'var(--lw-rust)',
      good:  'var(--lw-good)',
      warn:  'var(--lw-warn)',
      bad:   'var(--lw-bad)',
    },
    fontFamily: {
      sans:  'var(--lw-font-sans)',
      serif: 'var(--lw-font-serif)',
      mono:  'var(--lw-font-mono)',
    },
    borderRadius: {
      sm: 'var(--lw-r-sm)', DEFAULT: 'var(--lw-r)', lg: 'var(--lw-r-lg)', xl: 'var(--lw-r-xl)',
    },
    boxShadow: {
      1: 'var(--lw-shadow-1)', 2: 'var(--lw-shadow-2)',
    },
  },
}
```

Resulting utilities: `bg-bg`, `bg-bg-2`, `text-ink-2`, `border-line`, `text-ochre`, `rounded-lg`, `shadow-2`, `font-serif`, etc. Tailwind's default `slate-*` palette remains available, so pages not yet restyled keep working during the intermediate state.

Bespoke effects that do not map cleanly to utilities — density spacing (`--lw-pad`/`--lw-gap`), the `.lw-cover` tone gradients, the diagonal striped overlay — stay as CSS classes in `tokens.css` and are consumed by the relevant `web-ui` components.

### 1.4 Theme + base styling

- `index.html` ships `<html class="lw-theme-dark">` and `<body class="lw-density-cozy">` so there is no theme flash before Angular boots.
- `styles.scss` sets base `body` styling from the tokens: `background: var(--lw-bg)`, `color: var(--lw-ink)`, `font-family: var(--lw-font-sans)`, base `font-size: 14px`, `line-height: 1.45`, `letter-spacing: -0.005em` — the non-artboard equivalent of `.lw-screen`. Serif heading defaults (`h1–h4`) are applied globally as in `tokens.css`.
- **`ThemeService`** (in `web-ui`): a signal-based service exposing `theme(): 'dark' | 'light'`, `toggle()`, and `set(theme)`. It persists the choice to `localStorage` under a `lw-theme` key and applies `lw-theme-dark` / `lw-theme-light` to `document.documentElement`. On construction it reconciles any stored preference with the default class already on `<html>`. Default is `dark` when nothing is stored.

## 2. The `web-ui` Library

New Nx Angular library `libs/web-ui`, import alias `@learnwren/web-ui`, generated with the standard `@nx/angular:library` generator (buildable not required — it is consumed by `apps/web` and the feature libs). All components are `standalone`, `ChangeDetectionStrategy.OnPush`.

Components ported from `primitives.jsx`:

| Component | Selector | Notes |
| :--- | :--- | :--- |
| `LwIconComponent` | `<lw-icon>` | Inputs `name`, `size` (default 16), `stroke` (default 1.5). Ports the ~25-icon inline-SVG set from `primitives.jsx` (`search`, `bell`, `play`, `pause`, `check`, `lock`, `arrow`, `chev-r/d`, `filter`, `grid`, `list`, `clock`, `users`, `level`, `doc`, `down`, `captions`, `settings`, `fs`, `vol`, `more`, `leaf`, `x`, `bookmark`). |
| `lwButton` (directive) | `button[lwButton]` | Input `variant: 'primary' \| 'default' \| 'ghost'` (default `'default'`). Applies the `.lw-btn` family; keeps native `<button>` semantics and `type`. |
| `LwCardComponent` | `<lw-card>` | Content-projected surface — `bg-bg-2`, `border-line`, `rounded-lg`. |
| `LwPillComponent` | `<lw-pill>` | Input `active` (boolean) and optional `tone` (`'default' \| 'ochre' \| 'good' \| 'warn' \| 'bad'`); content-projected label. |
| `LwProgressComponent` | `<lw-progress>` | Input `value` (0–1). Renders the `.lw-progress` track + fill. |
| `LwCoverComponent` | `<lw-cover>` | Inputs `tone`, `glyph`, `label`, `height`. Renders the striped placeholder with serif glyph and monospace label. |
| `LwWordmarkComponent` | `<lw-wordmark>` | The italic-serif "Learn Wren" wordmark with the ochre dot; input `size`. |
| `ThemeToggleComponent` | `<lw-theme-toggle>` | Button bound to `ThemeService.toggle()`, shows the current-theme icon. |

The library also owns `src/styles/tokens.css` and re-exports every component plus `ThemeService` from `src/index.ts`. Each component ships a Jest spec (the workspace test setup uses Jest; `test-setup.ts` is generated by the library generator).

## 3. App Shell

`apps/web/src/app/app.html` currently renders a centered "Learn Wren" text placeholder (`data-testid="hero"`) wrapping `<router-outlet>`. It is rewritten into real chrome:

- **Authenticated layout:** a sticky top bar — `<lw-wordmark>` + nav links (instructor-appropriate: **Dashboard**, **My Courses**) + `<lw-theme-toggle>` + an avatar chip showing the user's initials (from `AuthService.currentUser()`). Below it, `<router-outlet>` renders inside a `bg-bg` content region.
- **Unauthenticated layout:** auth pages (login, register, register-confirm, forgot-password, unlock) render as centered cards on `bg-bg` with **no** top bar.
- The shell decides which layout to render from `AuthService.currentUser()` — the top bar renders only when a user is present. This keeps pre-login pages chrome-free without a route-data refactor.
- The design's global ⌘K search bar is **not** included (no search feature).

`index.html` is also updated: theme/density classes on `<html>`/`<body>` (§1.4), the font `<link>` (§1.2), and a real `<title>` ("Learn Wren").

**Test impact:** removing the `data-testid="hero"` element breaks `apps/web/src/app/app.spec.ts` and any `web-e2e` test referencing `hero`. Both are updated as part of this slice — the app spec asserts on the new shell, and the e2e selector is repointed to a stable element (e.g. the wordmark).

## 4. Page Restyle Slices

Each slice is a separate, independently reviewable change consuming `@learnwren/web-ui`. Slices 4–5 are scoped here at the page level; their detailed designs are produced when their implementation plans are written.

### Slice 3 — `web-auth`

Pages: `login`, `register`, `register-confirm`, `forgot-password`, `unlock`. Restyle:

- Centered card surface (`lw-card`), serif headings, design-styled text inputs, `lwButton` (`primary` for submit, `ghost` for secondary links).
- Error / locked / unverified / resend states keep their existing logic and signals; only presentation changes — status messaging uses `warn` / `bad` tones.

### Slice 4 — `web-courses`

Pages/components: `courses-list-page`, `course-create-page`, `course-editor-page`, `materials/materials-list`, `publish/publish-eligibility-panel`, `publish/course-publish-bar`, `components/module-tree`. The design's `CourseCard` and `Cover` (from `primitives.jsx`) map directly onto the course list. Forms and the editor adopt the surface / input / button treatment.

### Slice 5 — `web-video` + dashboard

Components: `video-upload`, `video-player` (chrome informed by the design's `player.jsx`), `video-state-badge` → rendered via `LwPill` with status tones (`good` / `warn` / `bad`), `polling` (no visual surface). Plus `apps/web/src/app/dashboard/dashboard.component.ts` — restyled to the design's hero + section pattern, adapted with instructor-appropriate content (no student watch-hour stats).

## 5. Testing & Verification

- **Unit:** every `web-ui` component gets a Jest spec (variant rendering, projected content, inputs). `ThemeService` is tested for: default dark, `toggle()` flips the `documentElement` class, and `localStorage` persistence + reconciliation on construction.
- **Existing specs:** restyling edits templates. Specs asserting on removed structure or hard-coded classes (notably the `hero` `data-testid` in `app.spec.ts`) are updated within the slice that changes them. Behaviour-based specs should be unaffected.
- **E2E:** `web-e2e` Playwright selectors are audited per slice; the `hero`-based selector is repointed in Slice 1/3.
- **Per slice:** `nx affected` `lint`, `test`, `build` must pass; plus a manual walk-through of the restyled pages in **both** dark and light themes via `pnpm emulators` + `pnpm start`, confirming the theme toggle and no regressions.

## 6. Build Sequence

1. **Slice 1 — Token foundation:** move `tokens.css` into `libs/web-ui`, add fonts, wire `tailwind.config.js`, base `body` styling, `index.html` theme/density classes. (`web-ui` lib is generated here so it can hold `tokens.css`.)
2. **Slice 2 — `web-ui` primitives + app shell:** build the components and `ThemeService`; rewrite `app.html` into the shell; update `app.spec.ts` and the `hero` e2e selector.
3. **Slice 3 — restyle `web-auth`.**
4. **Slice 4 — restyle `web-courses`.**
5. **Slice 5 — restyle `web-video` + dashboard.**

This spec covers Slices 1–3 in implementable detail. Slices 4–5 are page-level scoped here and will each get a dedicated design pass before implementation.
