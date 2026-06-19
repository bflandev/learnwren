# Landing Page — Design

> [!NOTE]
> DOCUMENT STATUS: DRAFT

## Goal

Add a public marketing landing page as the top-level (`/`) route, reproducing the
approved design in `docs/design/images/00 _ Landing page.png`. The page is the
front door for **logged-out visitors**; it explains what Learn Wren is, shows the
season's shelf, and drives sign-ups.

This is a **static marketing page** — all copy, stats, course cards, and the
testimonial are hardcoded to match the mockup. No backend data is fetched. CTAs
link to real application routes (`/register`, `/catalog`).

## Decisions (locked)

| Decision | Choice |
| --- | --- |
| Content source | **Static marketing copy** — hardcoded to match the mockup; stats and course cards are presentational, not live data. |
| Audience | **Logged-out visitors only** — authenticated users hitting `/` are redirected to `/dashboard`. |
| Placement | New **`libs/web-landing`** feature lib (one-surface-per-lib convention). |
| Header/chrome | **Reuse the existing global shell header** — it already shows *Browse courses · Log in · Register* when logged out. No bespoke landing header. |
| Hero secondary CTA | Relabel mockup's "Watch the tour · 90s" → **"Browse the shelf"** → `/catalog` (no tour video exists). |

## Architecture

### Library

Create `libs/web-landing` following the structure of the other `web-*` feature
libs (`web-catalog`, `web-learn`):

```
libs/web-landing/
  src/
    index.ts                       # barrel: LandingPageComponent, landingRoutes
    lib/
      landing.routes.ts            # landingRoutes (path '' + landingGuard)
      landing.guard.ts             # redirect authed users → /dashboard
      landing-content.ts           # all copy as typed const data
      landing-page/                # container component
      landing-hero/
      landing-stats/
      landing-shelf/
      landing-steps/
      landing-features/
      landing-testimonial/
      landing-pricing/
      landing-footer/
```

The lib is registered in `tsconfig.base.json` as `@learnwren/web-landing` and
gets its own `project.json`, `vite.config.mts`, eslint/tsconfig files generated
via the Nx Angular library generator (`@nx/angular:library`), matching the
sibling libs.

### Routing

In `apps/web/src/app/app.routes.ts`:

- Remove the tail `{ path: '', pathMatch: 'full', redirectTo: '/catalog' }`.
- Spread `...landingRoutes` so `''` lazy-loads `LandingPageComponent`.

`landingRoutes` (in the lib):

```ts
export const landingRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [landingGuard],
    loadComponent: () =>
      import('./landing-page/landing-page.component').then((m) => m.LandingPageComponent),
  },
];
```

`landingGuard` is a functional `CanActivateFn`: if `AuthService.isAuthenticated()`
returns true, it returns a `UrlTree` for `/dashboard` (so signed-in users never
see the marketing page); otherwise `true`. `/catalog` remains directly reachable
for everyone via the existing `catalogRoutes`.

The landing route is **not** an auth route, so the shell's `showHeader()`
(`!isAuthRoute(url)`) keeps the global header visible above the page.

> Note on `web-courses` guard precedent: a `CanActivateFn` that needs the
> resolved URL must use `canActivate` (not `canMatch`) — see
> `[[project_us_08_03_admin_review]]`. This guard only reads auth state, so
> `canActivate` is the correct and sufficient hook.

## Components

One container assembles eight small, single-purpose, `OnPush` presentational
components. Each component owns one section of the page and has its own spec.

| Component | Responsibility |
| --- | --- |
| `LandingPageComponent` | Container. Renders the sections in order, sets the page `<title>` ("Learn Wren — slow lessons for small communities"). Holds no logic beyond wiring content → children. |
| `landing-hero` | Eyebrow pill, serif `<h1>`, subcopy, primary CTA (`Start for free` → `/register`) + secondary CTA (`Browse the shelf` → `/catalog`), and the decorative hero visual. |
| `landing-stats` | Four-up stat row (courses / members / rating / instructors). |
| `landing-shelf` | "A short shelf, considered." Section heading + "Browse all 8 courses →" link (`/catalog`) + four featured course cards. |
| `landing-steps` | "Three small steps…" Three numbered how-it-works cards. |
| `landing-features` | "The platform makes itself small…" Four feature columns. |
| `landing-testimonial` | Instructor quote with "EH" avatar (reuse `LwAvatarComponent`). |
| `landing-pricing` | "One price. The whole shelf." Three pricing tiers; all CTAs → `/register`. |
| `landing-footer` | Wordmark + minimal links (no global footer exists today; this is landing-scoped). |

### Content model — `landing-content.ts`

All marketing text lives here as typed `const` data so copy stays out of
templates and is trivially testable. Shapes:

```ts
export interface LandingStat { value: string; label: string; }
export interface LandingFeaturedCourse {
  title: string; instructor: string; category: string;
  badge?: 'Staff Pick' | 'Most Loved' | 'New';
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  enrolled: string; duration: string; tone: CoverTone; coverLabel: string;
}
export interface LandingStep { number: string; title: string; body: string; }
export interface LandingFeature { title: string; body: string; }
export interface LandingPricingTier {
  name: string; price: string; cadence: string; featured?: boolean;
  blurb: string; cta: string;
}
export interface LandingTestimonial {
  eyebrow: string; quote: string; name: string; context: string; initials: string;
}
```

Concrete content (verbatim from the mockup):

- **Hero** — eyebrow "Now enrolling"; H1 "Slow lessons, made for small
  communities."; subcopy "Learn Wren is a member-run video library for craft,
  food, garden, and field — taught by people who do the work. No algorithms, no
  infinite scroll. One course at a time."
- **Stats** — `8 / courses, hand-selected`, `1,402 / members this season`,
  `4.8 / average lesson rating`, `12 / instructors in residence`.
- **Shelf** — eyebrow "This season's library"; subcopy "We add three to five
  courses a season. Each one stays for the year. No expiring 'tracks,' no
  upsells — just rooms you can return to." Four cards:
  1. *Reading the Wren's Song* — Etta Holloway — Field Recording — **Staff Pick** — Intermediate · 312 · 3h 4m — tone `moss`, label `C-WREN-SONG`.
  2. *Sourdough, From Starter to Crust* — Mateo Reyes — Fermentation — **Most Loved** — Beginner · 1,287 · 4h 6m — tone `clay`, label `C-SOURDOUGH`.
  3. *Green Woodworking with Hand Tools* — Iris Tomlin — Craft — Beginner · 642 · 3h 18m — tone `bark`, label `C-GREENWOOD`.
  4. *Letterpress for Small Editions* — Ola Bergström — Print — **New** — Intermediate · 218 · 2h 32m — tone `paper`, label `C-LETTERPRESS`.
- **Steps** — `01 Join the community` / "Sign up in under a minute. One
  membership unlocks every course, every season — for you and a household
  guest."; `02 Pick a quiet evening` / "Browse the shelf. Modules are sized for
  a single sitting; lessons are 6 to 24 minutes. Materials and notes ship with
  every course."; `03 Make the thing` / "Watch, then put the phone away. Share
  what you made in the seasonal show-and-tell. We promise: no algorithm, no
  feed."
- **Features** — *DRM-protected video* / "Every lesson is encrypted at rest and
  at play. Instructors keep ownership; the platform never resells."; *Built for
  households* / "One membership streams to a second device on the same network —
  partners, kids, the kitchen iPad."; *Downloadable materials* / "Recipes,
  plans, plant lists, PDFs, audio stems. The course outlasts the streaming
  window."; *Open source, self-hostable* / "The whole platform is MIT-licensed.
  If you'd rather host your own community library, we'll help."
- **Testimonial** — eyebrow "Instructor — Field Recording"; quote "I wanted a
  place where my course could just sit — not chase a feed, not get cut into
  shorts. Learn Wren paid me on the first day a member finished my course. Twice
  in a year."; Etta Holloway · Reading the Wren's Song; initials "EH".
- **Pricing** — heading "One price. The whole shelf."; tiers: `Member · monthly`
  $9 /month; `Member · annual` $84 /year (**featured**); `Community / Self-host`
  (host your own). All CTAs → `/register`.

## Visual treatment

- Built entirely from existing design tokens (`libs/web-ui/src/styles/tokens.css`)
  and Tailwind theme classes (`bg`, `ink`, `ochre`, `moss`, `clay`, `lw-card`,
  `lw-btn`, `lw-pill`, `lw-cover`). **No new colors or token additions.**
- Course cards reuse `LwCoverComponent` / `lw-pill` so they read identically to
  the catalog shelf.
- **Hero visual:** the mockup's stacked course-card + video-player collage is
  reproduced as a **stylized CSS/HTML approximation** using existing card/cover
  tokens, marked `aria-hidden="true"` (decorative). A pixel-exact screenshot
  rebuild is explicitly out of scope — the visual spirit matches, not every pixel.
- **Responsive:** multi-column grids (stats four-up, shelf four-up, steps
  three-up, features four-up, pricing three-up) collapse to a single column on
  narrow viewports via existing Tailwind responsive utilities.
- **Accessibility:** exactly one `<h1>` (hero); section headings are `<h2>`;
  CTAs are real `routerLink` anchors with visible focus rings (`focus-visible`);
  decorative visuals carry `aria-hidden`. The shell's existing skip-link covers
  the page.

## Testing

### Unit (vitest, per lib)

Each component gets a spec with real content and link assertions — strong enough
to clear the **≥80% adjusted mutation gate** (per `[[project_mutation_round_2]]`).
Representative assertions:

- Hero renders the H1 text; primary CTA `routerLink="/register"`, secondary
  `routerLink="/catalog"`.
- Stats renders all four `value`/`label` pairs from content.
- Shelf renders four cards with correct titles/badges and the "Browse all"
  link → `/catalog`.
- Steps/features render the full content arrays (count + text).
- Pricing renders three tiers, marks the annual tier featured, all CTAs →
  `/register`.
- `landingGuard`: returns `true` when logged out; returns a `/dashboard`
  `UrlTree` when authenticated (assert against a mocked `AuthService`).

### Mutation onboarding

Add `stryker.web-landing.config.mjs` at the repo root (mirroring
`stryker.web-catalog.config.mjs`: vitest runner, mutate `lib/**/*.ts` excluding
`*.spec.ts`/`*.routes.ts`/`index.ts`, json+html reporters under
`reports/mutation/web-landing/`). The CI `mutation-affected` job discovers it
automatically (`ls stryker.*.config.mjs`), so no `ci.yml` edit is required — the
lib joins the matrix on its next affected run.

### e2e (web-e2e, Playwright)

`landing.spec.ts`:

- Logged-out visit to `/` renders the landing hero H1.
- Authenticated session at `/` redirects to `/dashboard`.
- Clicking "Start for free" navigates to `/register`.
- Clicking "Browse the shelf" navigates to `/catalog`.

## Out of scope / deferred

- Live/aggregate data for stats and course cards (explicitly chosen static).
- A real "tour" video (secondary CTA repurposed to `/catalog`).
- A global site-wide footer (this footer is landing-scoped only).
- i18n / multiple seasons / a CMS for the copy — content is a typed module,
  editable in code.

## Affected files (summary)

- **New:** `libs/web-landing/**`, `stryker.web-landing.config.mjs`,
  `apps/web-e2e/src/landing.spec.ts`.
- **Edited:** `apps/web/src/app/app.routes.ts` (swap `''` redirect for
  `...landingRoutes`), `tsconfig.base.json` (path alias — generator-managed).
