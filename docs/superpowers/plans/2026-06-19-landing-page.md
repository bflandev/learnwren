# Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a static marketing landing page at the top-level route `/`, visible to logged-out visitors, reproducing `docs/design/images/00 _ Landing page.png` with the existing Learn Wren design system.

**Architecture:** A new `libs/web-landing` Angular feature lib holds a `LandingPageComponent` container that stacks eight small `OnPush` presentational section components. All copy lives in one typed `landing-content.ts` module. `/` lazy-loads the page behind a `landingGuard` that redirects authenticated users to `/dashboard`. CTAs link to real routes (`/register`, `/catalog`).

**Tech Stack:** Angular 21 (standalone components, signals), Nx, vitest + `@analogjs/vite-plugin-angular` for unit tests, Playwright for e2e, Tailwind classes bound to `libs/web-ui` design tokens, Stryker for the mutation gate.

## Global Constraints

- **No new design tokens or colors.** Use only existing Tailwind theme classes (`bg`, `bg-2`, `bg-3`, `ink`, `ink-2`, `ink-3`, `ochre`, `moss`, `clay`, `line`, `line-2`) and `lw-*` component classes (`lw-card`, `lw-btn`, `lw-btn-primary`, `lw-pill`, `lw-cover`, `lw-meta`, `lw-mono`).
- **Reuse `@learnwren/web-ui` components:** `LwCardComponent`, `LwCoverComponent` (`tone`/`glyph`/`label`/`height` inputs; type `LwCoverTone = 'ochre'|'moss'|'clay'|'ink'|'paper'|'bark'`), `LwPillComponent`, `LwAvatarComponent` (`displayName`/`userId` required inputs, `size`).
- **All components:** `standalone: true`, `changeDetection: ChangeDetectionStrategy.OnPush`, `selector` prefixed `lib-`, **separate `.html` via `templateUrl`** (never inline templates — the Stryker config mutates `lib/**/*.ts` and inline template strings would create unkillable survivors).
- **All copy comes from `landing-content.ts`** — never hardcode marketing text in a template or `.ts` logic block.
- **Mutation gate:** the lib must clear ≥80% adjusted mutation score; keep `.ts` logic minimal (field assignment only) so the mutation surface is tiny.
- **CTA routes (exact):** "Start for free" → `/register`; "Browse the shelf" → `/catalog`; "Browse all 8 courses" → `/catalog`; all three pricing CTAs → `/register`.
- **Commit style:** Conventional Commits, scope `web-landing`. End each commit message body with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

```
libs/web-landing/
  project.json, vite.config.mts, tsconfig*.json, eslint.config.mjs   (generated)
  src/
    test-setup.ts                                                    (generated)
    index.ts                                                         barrel
    lib/
      landing-content.ts        all copy as typed const data
      landing.guard.ts          redirect authed users → /dashboard
      landing.guard.spec.ts
      landing.routes.ts         landingRoutes (path '' + guard)
      landing-hero/             landing-hero.component.{ts,html,spec.ts}
      landing-stats/            "
      landing-shelf/            "
      landing-steps/            "
      landing-features/         "
      landing-testimonial/      "
      landing-pricing/          "
      landing-footer/           "
      landing-page/             landing-page.component.{ts,html,spec.ts}  (container)
stryker.web-landing.config.mjs                                       (repo root)
apps/web/src/app/app.routes.ts                                       (modified)
apps/web-e2e/src/home.spec.ts                                        (rewritten)
```

---

### Task 1: Scaffold the lib + content model

**Files:**
- Generate: `libs/web-landing/**` (via Nx generator)
- Create: `libs/web-landing/src/lib/landing-content.ts`
- Create: `libs/web-landing/src/index.ts` (replace generated barrel)
- Test: `libs/web-landing/src/lib/landing-content.spec.ts`

**Interfaces:**
- Produces: the typed content constants `HERO_CONTENT`, `STATS`, `SHELF_INTRO`, `FEATURED_COURSES`, `STEPS_INTRO`, `STEPS`, `FEATURES_INTRO`, `FEATURES`, `TESTIMONIAL`, `PRICING_INTRO`, `PRICING_TIERS`, `PRICING_CTA_ROUTE`, `FOOTER_TAGLINE`, plus the interfaces `LandingStat`, `LandingFeaturedCourse`, `LandingStep`, `LandingFeature`, `LandingPricingTier`, `LandingTestimonial`. All later tasks import from `../landing-content`.

- [ ] **Step 1: Generate the library**

Run (matches sibling libs — vitest runner, `lib` prefix, `scope:web` tag):

```bash
pnpm nx g @nx/angular:library web-landing \
  --directory=libs/web-landing \
  --unitTestRunner=vitest \
  --prefix=lib \
  --tags=scope:web \
  --standalone \
  --skipTests \
  --no-interactive
```

Then confirm `libs/web-landing/project.json` has `"prefix": "lib"`, `"tags": ["scope:web"]`, and that `libs/web-landing/vite.config.mts` + `libs/web-landing/src/test-setup.ts` exist (mirror `libs/web-catalog`). Delete any generated placeholder component/spec the generator created under `src/lib/` (we author our own).

- [ ] **Step 2: Write the failing content test**

Create `libs/web-landing/src/lib/landing-content.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  FEATURED_COURSES,
  FEATURES,
  HERO_CONTENT,
  PRICING_CTA_ROUTE,
  PRICING_TIERS,
  STATS,
  STEPS,
} from './landing-content';

describe('landing-content', () => {
  it('has four stats, four courses, three steps, four features, three tiers', () => {
    expect(STATS).toHaveLength(4);
    expect(FEATURED_COURSES).toHaveLength(4);
    expect(STEPS).toHaveLength(3);
    expect(FEATURES).toHaveLength(4);
    expect(PRICING_TIERS).toHaveLength(3);
  });

  it('wires the hero CTAs to real routes', () => {
    expect(HERO_CONTENT.primaryCta.route).toBe('/register');
    expect(HERO_CONTENT.secondaryCta.route).toBe('/catalog');
  });

  it('marks exactly one pricing tier as featured and sends all CTAs to register', () => {
    expect(PRICING_TIERS.filter((t) => t.featured)).toHaveLength(1);
    expect(PRICING_CTA_ROUTE).toBe('/register');
  });

  it('assigns each course a valid cover tone', () => {
    const tones = new Set(['ochre', 'moss', 'clay', 'ink', 'paper', 'bark']);
    for (const c of FEATURED_COURSES) expect(tones.has(c.tone)).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm nx test web-landing`
Expected: FAIL — cannot resolve `./landing-content`.

- [ ] **Step 4: Create the content module**

Create `libs/web-landing/src/lib/landing-content.ts`:

```ts
import type { LwCoverTone } from '@learnwren/web-ui';

export interface LandingStat {
  value: string;
  label: string;
}

export interface LandingFeaturedCourse {
  title: string;
  instructor: string;
  category: string;
  badge?: string;
  level: string;
  enrolled: string;
  duration: string;
  tone: LwCoverTone;
  coverLabel: string;
  glyph: string;
}

export interface LandingStep {
  number: string;
  title: string;
  body: string;
}

export interface LandingFeature {
  title: string;
  body: string;
}

export interface LandingPricingTier {
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  cta: string;
  featured: boolean;
}

export interface LandingTestimonial {
  eyebrow: string;
  quote: string;
  name: string;
  context: string;
}

export const HERO_CONTENT = {
  eyebrow: 'Now enrolling',
  title: 'Slow lessons, made for small communities.',
  subcopy:
    'Learn Wren is a member-run video library for craft, food, garden, and field — taught by people who do the work. No algorithms, no infinite scroll. One course at a time.',
  primaryCta: { label: 'Start for free', route: '/register' },
  secondaryCta: { label: 'Browse the shelf', route: '/catalog' },
} as const;

export const STATS: readonly LandingStat[] = [
  { value: '8', label: 'courses, hand-selected' },
  { value: '1,402', label: 'members this season' },
  { value: '4.8', label: 'average lesson rating' },
  { value: '12', label: 'instructors in residence' },
];

export const SHELF_INTRO = {
  eyebrow: "This season's library",
  title: 'A short shelf, considered.',
  subcopy:
    'We add three to five courses a season. Each one stays for the year. No expiring “tracks,” no upsells — just rooms you can return to.',
  browseAll: { label: 'Browse all 8 courses', route: '/catalog' },
} as const;

export const FEATURED_COURSES: readonly LandingFeaturedCourse[] = [
  {
    title: "Reading the Wren's Song",
    instructor: 'Etta Holloway',
    category: 'Field Recording',
    badge: 'Staff Pick',
    level: 'Intermediate',
    enrolled: '312',
    duration: '3h 4m',
    tone: 'moss',
    coverLabel: 'C-WREN-SONG',
    glyph: '♪',
  },
  {
    title: 'Sourdough, From Starter to Crust',
    instructor: 'Mateo Reyes',
    category: 'Fermentation',
    badge: 'Most Loved',
    level: 'Beginner',
    enrolled: '1,287',
    duration: '4h 6m',
    tone: 'clay',
    coverLabel: 'C-SOURDOUGH',
    glyph: '✱',
  },
  {
    title: 'Green Woodworking with Hand Tools',
    instructor: 'Iris Tomlin',
    category: 'Craft',
    level: 'Beginner',
    enrolled: '642',
    duration: '3h 18m',
    tone: 'bark',
    coverLabel: 'C-GREENWOOD',
    glyph: '◆',
  },
  {
    title: 'Letterpress for Small Editions',
    instructor: 'Ola Bergström',
    category: 'Print',
    badge: 'New',
    level: 'Intermediate',
    enrolled: '218',
    duration: '2h 32m',
    tone: 'paper',
    coverLabel: 'C-LETTERPRESS',
    glyph: 'A',
  },
];

export const STEPS_INTRO = {
  eyebrow: 'How it works',
  title: 'Three small steps, then the rest is just practice.',
} as const;

export const STEPS: readonly LandingStep[] = [
  {
    number: '01',
    title: 'Join the community',
    body: 'Sign up in under a minute. One membership unlocks every course, every season — for you and a household guest.',
  },
  {
    number: '02',
    title: 'Pick a quiet evening',
    body: 'Browse the shelf. Modules are sized for a single sitting; lessons are 6 to 24 minutes. Materials and notes ship with every course.',
  },
  {
    number: '03',
    title: 'Make the thing',
    body: 'Watch, then put the phone away. Share what you made in the seasonal show-and-tell. We promise: no algorithm, no feed.',
  },
];

export const FEATURES_INTRO = {
  eyebrow: 'Why Learn Wren',
  title: 'The platform makes itself small so the teacher can be large.',
} as const;

export const FEATURES: readonly LandingFeature[] = [
  {
    title: 'DRM-protected video',
    body: 'Every lesson is encrypted at rest and at play. Instructors keep ownership; the platform never resells.',
  },
  {
    title: 'Built for households',
    body: 'One membership streams to a second device on the same network — partners, kids, the kitchen iPad.',
  },
  {
    title: 'Downloadable materials',
    body: 'Recipes, plans, plant lists, PDFs, audio stems. The course outlasts the streaming window.',
  },
  {
    title: 'Open source, self-hostable',
    body: "The whole platform is MIT-licensed. If you'd rather host your own community library, we'll help.",
  },
];

export const TESTIMONIAL: LandingTestimonial = {
  eyebrow: 'Instructor — Field Recording',
  quote:
    'I wanted a place where my course could just sit — not chase a feed, not get cut into shorts. Learn Wren paid me on the first day a member finished my course. Twice in a year.',
  name: 'Etta Holloway',
  context: "Reading the Wren's Song",
};

export const PRICING_INTRO = {
  title: 'One price. The whole shelf.',
  subcopy:
    'No course-by-course pricing, no expiring rentals. Members pay once and watch everything — for the whole season.',
} as const;

export const PRICING_CTA_ROUTE = '/register';

export const PRICING_TIERS: readonly LandingPricingTier[] = [
  {
    name: 'Member · monthly',
    price: '$9',
    cadence: '/month',
    blurb: 'Full access to every course this season. Cancel anytime.',
    cta: 'Start for free',
    featured: false,
  },
  {
    name: 'Member · annual',
    price: '$84',
    cadence: '/year',
    blurb: 'Two months free. The whole shelf, all year, one payment.',
    cta: 'Start for free',
    featured: true,
  },
  {
    name: 'Community · self-host',
    price: 'Free',
    cadence: 'MIT-licensed',
    blurb: "Host your own library. Open source, forever. We'll help you stand it up.",
    cta: 'Start for free',
    featured: false,
  },
];

export const FOOTER_TAGLINE = 'Slow lessons for small communities.';
```

- [ ] **Step 5: Replace the barrel**

Overwrite `libs/web-landing/src/index.ts` (the route/guard/component exports are added in Task 8; for now export content types so the lib has a public surface):

```ts
export * from './lib/landing-content';
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm nx test web-landing`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add libs/web-landing tsconfig.base.json
git commit -m "feat(web-landing): scaffold lib and typed marketing content model

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `landingGuard`

**Files:**
- Create: `libs/web-landing/src/lib/landing.guard.ts`
- Test: `libs/web-landing/src/lib/landing.guard.spec.ts`

**Interfaces:**
- Consumes: `AuthService` from `@learnwren/web-auth` — `currentUser(): AuthenticatedUser | null | undefined`, `isAuthenticated(): boolean`, `refresh(): Promise<void>`.
- Produces: `export const landingGuard: CanActivateFn` — resolves the auth state (refreshing when unknown) and returns a `/dashboard` `UrlTree` for authenticated users, otherwise `true`.

- [ ] **Step 1: Write the failing test**

Create `libs/web-landing/src/lib/landing.guard.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@learnwren/web-auth';

import { landingGuard } from './landing.guard';

function run(auth: Partial<AuthService>, router: Partial<Router>) {
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: Router, useValue: router },
    ],
  });
  return TestBed.runInInjectionContext(() =>
    landingGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
}

describe('landingGuard', () => {
  it('allows the landing page for an anonymous visitor', async () => {
    const auth = {
      currentUser: vi.fn().mockReturnValue(null),
      isAuthenticated: vi.fn().mockReturnValue(false),
      refresh: vi.fn(),
    } as unknown as AuthService;
    const result = await run(auth, { createUrlTree: vi.fn() } as unknown as Router);
    expect(result).toBe(true);
  });

  it('refreshes when the session is unknown, then allows if still anonymous', async () => {
    const refresh = vi.fn(async () => undefined);
    const auth = {
      currentUser: vi.fn().mockReturnValue(undefined),
      isAuthenticated: vi.fn().mockReturnValue(false),
      refresh,
    } as unknown as AuthService;
    const result = await run(auth, { createUrlTree: vi.fn() } as unknown as Router);
    expect(refresh).toHaveBeenCalledOnce();
    expect(result).toBe(true);
  });

  it('redirects an authenticated user to /dashboard', async () => {
    const tree = {} as UrlTree;
    const createUrlTree = vi.fn().mockReturnValue(tree);
    const auth = {
      currentUser: vi.fn().mockReturnValue({ uid: 'a' }),
      isAuthenticated: vi.fn().mockReturnValue(true),
      refresh: vi.fn(),
    } as unknown as AuthService;
    const result = await run(auth, { createUrlTree } as unknown as Router);
    expect(createUrlTree).toHaveBeenCalledWith(['/dashboard']);
    expect(result).toBe(tree);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test web-landing`
Expected: FAIL — cannot resolve `./landing.guard`.

- [ ] **Step 3: Create the guard**

Create `libs/web-landing/src/lib/landing.guard.ts`:

```ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '@learnwren/web-auth';

/**
 * The landing page is for logged-out visitors. Authenticated users are sent to
 * their dashboard. When the session has not yet resolved (currentUser ===
 * undefined on a fresh load), refresh once before deciding — mirrors authGuard.
 */
export const landingGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.currentUser() === undefined) {
    await auth.refresh();
  }

  return auth.isAuthenticated() ? router.createUrlTree(['/dashboard']) : true;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm nx test web-landing`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-landing/src/lib/landing.guard.ts libs/web-landing/src/lib/landing.guard.spec.ts
git commit -m "feat(web-landing): add landingGuard redirecting authed users to /dashboard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Hero section

**Files:**
- Create: `libs/web-landing/src/lib/landing-hero/landing-hero.component.ts`
- Create: `libs/web-landing/src/lib/landing-hero/landing-hero.component.html`
- Test: `libs/web-landing/src/lib/landing-hero/landing-hero.component.spec.ts`

**Interfaces:**
- Consumes: `HERO_CONTENT` from `../landing-content`.
- Produces: `LandingHeroComponent` (selector `lib-landing-hero`).

- [ ] **Step 1: Write the failing test**

Create `libs/web-landing/src/lib/landing-hero/landing-hero.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { LandingHeroComponent } from './landing-hero.component';

function render(): HTMLElement {
  TestBed.configureTestingModule({
    imports: [LandingHeroComponent],
    providers: [provideRouter([])],
  });
  const fixture = TestBed.createComponent(LandingHeroComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('LandingHeroComponent', () => {
  it('renders the headline as the single h1', () => {
    const el = render();
    const h1s = el.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.textContent).toContain('Slow lessons, made for small communities.');
  });

  it('links the primary CTA to /register and the secondary CTA to /catalog', () => {
    const el = render();
    const primary = el.querySelector('a[href="/register"]');
    const secondary = el.querySelector('a[href="/catalog"]');
    expect(primary?.textContent).toContain('Start for free');
    expect(secondary?.textContent).toContain('Browse the shelf');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test web-landing`
Expected: FAIL — cannot resolve `./landing-hero.component`.

- [ ] **Step 3: Create the component + template**

Create `libs/web-landing/src/lib/landing-hero/landing-hero.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { HERO_CONTENT } from '../landing-content';

@Component({
  selector: 'lib-landing-hero',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './landing-hero.component.html',
})
export class LandingHeroComponent {
  protected readonly hero = HERO_CONTENT;
}
```

Create `libs/web-landing/src/lib/landing-hero/landing-hero.component.html`:

```html
<section class="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-2 md:items-center">
  <div>
    <span class="lw-pill mb-5 inline-flex">{{ hero.eyebrow }}</span>
    <h1 class="font-serif text-5xl leading-tight md:text-6xl">{{ hero.title }}</h1>
    <p class="mt-5 max-w-xl text-lg text-ink-2">{{ hero.subcopy }}</p>
    <div class="mt-8 flex flex-wrap gap-3">
      <a [routerLink]="hero.primaryCta.route" class="lw-btn lw-btn-primary">{{
        hero.primaryCta.label
      }}</a>
      <a [routerLink]="hero.secondaryCta.route" class="lw-btn">{{ hero.secondaryCta.label }}</a>
    </div>
  </div>

  <!-- Decorative hero visual: a stylized stack of a course card over a faux
       player, built from existing tokens. Presentational only. -->
  <div class="relative hidden h-80 md:block" aria-hidden="true">
    <div class="absolute right-0 top-6 w-72 rounded-lg border border-line bg-bg-2 p-4 shadow-2">
      <div class="lw-cover h-32 w-full rounded" data-tone="ochre"></div>
      <p class="mt-3 font-serif text-lg">Visible Mending</p>
      <p class="lw-meta mt-1">Module 2 · Sashiko &amp; Darning</p>
    </div>
    <div
      class="absolute left-0 top-28 flex h-40 w-64 items-end rounded-lg border border-line bg-bg-3 p-4 shadow-2"
    >
      <div class="lw-progress w-full"><span style="width: 42%"></span></div>
    </div>
  </div>
</section>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm nx test web-landing`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-landing/src/lib/landing-hero
git commit -m "feat(web-landing): add hero section

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Stats section

**Files:**
- Create: `libs/web-landing/src/lib/landing-stats/landing-stats.component.ts`
- Create: `libs/web-landing/src/lib/landing-stats/landing-stats.component.html`
- Test: `libs/web-landing/src/lib/landing-stats/landing-stats.component.spec.ts`

**Interfaces:**
- Consumes: `STATS` from `../landing-content`.
- Produces: `LandingStatsComponent` (selector `lib-landing-stats`).

- [ ] **Step 1: Write the failing test**

Create `libs/web-landing/src/lib/landing-stats/landing-stats.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LandingStatsComponent } from './landing-stats.component';

describe('LandingStatsComponent', () => {
  it('renders every stat value and label', () => {
    TestBed.configureTestingModule({ imports: [LandingStatsComponent] });
    const fixture = TestBed.createComponent(LandingStatsComponent);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    for (const value of ['8', '1,402', '4.8', '12']) expect(text).toContain(value);
    expect(text).toContain('members this season');
    expect(text).toContain('instructors in residence');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test web-landing`
Expected: FAIL — cannot resolve `./landing-stats.component`.

- [ ] **Step 3: Create the component + template**

Create `libs/web-landing/src/lib/landing-stats/landing-stats.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';

import { STATS } from '../landing-content';

@Component({
  selector: 'lib-landing-stats',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing-stats.component.html',
})
export class LandingStatsComponent {
  protected readonly stats = STATS;
}
```

Create `libs/web-landing/src/lib/landing-stats/landing-stats.component.html`:

```html
<section class="border-y border-line">
  <dl class="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-10 md:grid-cols-4">
    @for (stat of stats; track stat.label) {
      <div>
        <dt class="font-serif text-3xl">{{ stat.value }}</dt>
        <dd class="lw-meta mt-1">{{ stat.label }}</dd>
      </div>
    }
  </dl>
</section>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm nx test web-landing`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-landing/src/lib/landing-stats
git commit -m "feat(web-landing): add stats section

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Shelf section (featured courses)

**Files:**
- Create: `libs/web-landing/src/lib/landing-shelf/landing-shelf.component.ts`
- Create: `libs/web-landing/src/lib/landing-shelf/landing-shelf.component.html`
- Test: `libs/web-landing/src/lib/landing-shelf/landing-shelf.component.spec.ts`

**Interfaces:**
- Consumes: `SHELF_INTRO`, `FEATURED_COURSES` from `../landing-content`; `LwCardComponent`, `LwCoverComponent`, `LwPillComponent` from `@learnwren/web-ui`.
- Produces: `LandingShelfComponent` (selector `lib-landing-shelf`).

- [ ] **Step 1: Write the failing test**

Create `libs/web-landing/src/lib/landing-shelf/landing-shelf.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { LandingShelfComponent } from './landing-shelf.component';

function render(): HTMLElement {
  TestBed.configureTestingModule({
    imports: [LandingShelfComponent],
    providers: [provideRouter([])],
  });
  const fixture = TestBed.createComponent(LandingShelfComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('LandingShelfComponent', () => {
  it('renders four course cards with their titles and instructors', () => {
    const el = render();
    expect(el.querySelectorAll('lw-cover')).toHaveLength(4);
    const text = el.textContent ?? '';
    expect(text).toContain("Reading the Wren's Song");
    expect(text).toContain('Letterpress for Small Editions');
    expect(text).toContain('Etta Holloway');
  });

  it('renders the section heading and the browse-all link to /catalog', () => {
    const el = render();
    expect(el.querySelector('h2')?.textContent).toContain('A short shelf, considered.');
    const link = el.querySelector('a[href="/catalog"]');
    expect(link?.textContent).toContain('Browse all 8 courses');
  });

  it('applies each course cover tone to its lw-cover', () => {
    const el = render();
    const tones = Array.from(el.querySelectorAll('lw-cover')).map((c) =>
      c.getAttribute('data-tone'),
    );
    expect(tones).toEqual(['moss', 'clay', 'bark', 'paper']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test web-landing`
Expected: FAIL — cannot resolve `./landing-shelf.component`.

- [ ] **Step 3: Create the component + template**

Create `libs/web-landing/src/lib/landing-shelf/landing-shelf.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { LwCardComponent, LwCoverComponent, LwPillComponent } from '@learnwren/web-ui';

import { FEATURED_COURSES, SHELF_INTRO } from '../landing-content';

@Component({
  selector: 'lib-landing-shelf',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LwCardComponent, LwCoverComponent, LwPillComponent],
  templateUrl: './landing-shelf.component.html',
})
export class LandingShelfComponent {
  protected readonly intro = SHELF_INTRO;
  protected readonly courses = FEATURED_COURSES;
}
```

Create `libs/web-landing/src/lib/landing-shelf/landing-shelf.component.html`:

```html
<section class="mx-auto max-w-6xl px-6 py-20">
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="lw-meta">{{ intro.eyebrow }}</p>
      <h2 class="mt-2 font-serif text-4xl">{{ intro.title }}</h2>
      <p class="mt-3 max-w-xl text-ink-2">{{ intro.subcopy }}</p>
    </div>
    <a [routerLink]="intro.browseAll.route" class="lw-btn">{{ intro.browseAll.label }} →</a>
  </div>

  <div class="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
    @for (course of courses; track course.title) {
      <lw-card class="block p-0">
        <lw-cover [tone]="course.tone" [glyph]="course.glyph" [label]="course.coverLabel" />
        <div class="p-4">
          <div class="flex items-center gap-2">
            <span class="lw-meta">{{ course.category }}</span>
            @if (course.badge) {
              <lw-pill [active]="true">{{ course.badge }}</lw-pill>
            }
          </div>
          <h3 class="mt-2 font-serif text-lg">{{ course.title }}</h3>
          <p class="lw-meta mt-1">{{ course.instructor }}</p>
          <p class="lw-meta mt-3">
            {{ course.level }} · {{ course.enrolled }} · {{ course.duration }}
          </p>
        </div>
      </lw-card>
    }
  </div>
</section>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm nx test web-landing`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-landing/src/lib/landing-shelf
git commit -m "feat(web-landing): add featured-courses shelf section

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Steps + Features sections

**Files:**
- Create: `libs/web-landing/src/lib/landing-steps/landing-steps.component.{ts,html}`
- Create: `libs/web-landing/src/lib/landing-features/landing-features.component.{ts,html}`
- Test: `libs/web-landing/src/lib/landing-steps/landing-steps.component.spec.ts`
- Test: `libs/web-landing/src/lib/landing-features/landing-features.component.spec.ts`

**Interfaces:**
- Consumes: `STEPS_INTRO`, `STEPS`, `FEATURES_INTRO`, `FEATURES` from `../landing-content`.
- Produces: `LandingStepsComponent` (selector `lib-landing-steps`), `LandingFeaturesComponent` (selector `lib-landing-features`).

- [ ] **Step 1: Write the failing tests**

Create `libs/web-landing/src/lib/landing-steps/landing-steps.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LandingStepsComponent } from './landing-steps.component';

describe('LandingStepsComponent', () => {
  it('renders the heading and all three numbered steps', () => {
    TestBed.configureTestingModule({ imports: [LandingStepsComponent] });
    const fixture = TestBed.createComponent(LandingStepsComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h2')?.textContent).toContain('Three small steps');
    const text = el.textContent ?? '';
    for (const n of ['01', '02', '03']) expect(text).toContain(n);
    expect(text).toContain('Join the community');
    expect(text).toContain('Make the thing');
  });
});
```

Create `libs/web-landing/src/lib/landing-features/landing-features.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LandingFeaturesComponent } from './landing-features.component';

describe('LandingFeaturesComponent', () => {
  it('renders the heading and all four feature columns', () => {
    TestBed.configureTestingModule({ imports: [LandingFeaturesComponent] });
    const fixture = TestBed.createComponent(LandingFeaturesComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h2')?.textContent).toContain('makes itself small');
    const text = el.textContent ?? '';
    expect(text).toContain('DRM-protected video');
    expect(text).toContain('Built for households');
    expect(text).toContain('Downloadable materials');
    expect(text).toContain('Open source, self-hostable');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm nx test web-landing`
Expected: FAIL — cannot resolve the two component modules.

- [ ] **Step 3: Create the components + templates**

Create `libs/web-landing/src/lib/landing-steps/landing-steps.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';

import { STEPS, STEPS_INTRO } from '../landing-content';

@Component({
  selector: 'lib-landing-steps',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing-steps.component.html',
})
export class LandingStepsComponent {
  protected readonly intro = STEPS_INTRO;
  protected readonly steps = STEPS;
}
```

Create `libs/web-landing/src/lib/landing-steps/landing-steps.component.html`:

```html
<section class="border-t border-line">
  <div class="mx-auto max-w-6xl px-6 py-20">
    <p class="lw-meta">{{ intro.eyebrow }}</p>
    <h2 class="mt-2 max-w-2xl font-serif text-4xl">{{ intro.title }}</h2>
    <div class="mt-10 grid gap-5 md:grid-cols-3">
      @for (step of steps; track step.number) {
        <div class="rounded-lg border border-line bg-bg-2 p-6">
          <p class="lw-mono text-ochre">{{ step.number }}</p>
          <h3 class="mt-3 font-serif text-xl">{{ step.title }}</h3>
          <p class="mt-2 text-ink-2">{{ step.body }}</p>
        </div>
      }
    </div>
  </div>
</section>
```

Create `libs/web-landing/src/lib/landing-features/landing-features.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';

import { FEATURES, FEATURES_INTRO } from '../landing-content';

@Component({
  selector: 'lib-landing-features',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing-features.component.html',
})
export class LandingFeaturesComponent {
  protected readonly intro = FEATURES_INTRO;
  protected readonly features = FEATURES;
}
```

Create `libs/web-landing/src/lib/landing-features/landing-features.component.html`:

```html
<section class="border-t border-line">
  <div class="mx-auto max-w-6xl px-6 py-20">
    <p class="lw-meta">{{ intro.eyebrow }}</p>
    <h2 class="mt-2 max-w-2xl font-serif text-4xl">{{ intro.title }}</h2>
    <div class="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
      @for (feature of features; track feature.title) {
        <div>
          <h3 class="font-serif text-lg">{{ feature.title }}</h3>
          <p class="mt-2 text-ink-2">{{ feature.body }}</p>
        </div>
      }
    </div>
  </div>
</section>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm nx test web-landing`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-landing/src/lib/landing-steps libs/web-landing/src/lib/landing-features
git commit -m "feat(web-landing): add how-it-works and features sections

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Testimonial + Pricing sections

**Files:**
- Create: `libs/web-landing/src/lib/landing-testimonial/landing-testimonial.component.{ts,html}`
- Create: `libs/web-landing/src/lib/landing-pricing/landing-pricing.component.{ts,html}`
- Test: `libs/web-landing/src/lib/landing-testimonial/landing-testimonial.component.spec.ts`
- Test: `libs/web-landing/src/lib/landing-pricing/landing-pricing.component.spec.ts`

**Interfaces:**
- Consumes: `TESTIMONIAL`, `PRICING_INTRO`, `PRICING_TIERS`, `PRICING_CTA_ROUTE` from `../landing-content`; `LwAvatarComponent` from `@learnwren/web-ui`.
- Produces: `LandingTestimonialComponent` (selector `lib-landing-testimonial`), `LandingPricingComponent` (selector `lib-landing-pricing`).

- [ ] **Step 1: Write the failing tests**

Create `libs/web-landing/src/lib/landing-testimonial/landing-testimonial.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LandingTestimonialComponent } from './landing-testimonial.component';

describe('LandingTestimonialComponent', () => {
  it('renders the quote, attribution and an avatar', () => {
    TestBed.configureTestingModule({ imports: [LandingTestimonialComponent] });
    const fixture = TestBed.createComponent(LandingTestimonialComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent ?? '';
    expect(text).toContain('I wanted a place where my course could just sit');
    expect(text).toContain('Etta Holloway');
    expect(el.querySelector('lw-avatar')).not.toBeNull();
  });
});
```

Create `libs/web-landing/src/lib/landing-pricing/landing-pricing.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { LandingPricingComponent } from './landing-pricing.component';

function render(): HTMLElement {
  TestBed.configureTestingModule({
    imports: [LandingPricingComponent],
    providers: [provideRouter([])],
  });
  const fixture = TestBed.createComponent(LandingPricingComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('LandingPricingComponent', () => {
  it('renders the heading and three price points', () => {
    const el = render();
    expect(el.querySelector('h2')?.textContent).toContain('One price. The whole shelf.');
    const text = el.textContent ?? '';
    for (const p of ['$9', '$84', 'Free']) expect(text).toContain(p);
  });

  it('points every pricing CTA at /register', () => {
    const el = render();
    const ctas = Array.from(el.querySelectorAll('a')).filter(
      (a) => a.textContent?.includes('Start for free'),
    );
    expect(ctas).toHaveLength(3);
    for (const a of ctas) expect(a.getAttribute('href')).toBe('/register');
  });

  it('marks the annual tier as featured', () => {
    const el = render();
    expect(el.querySelector('[data-featured="true"]')?.textContent).toContain('$84');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm nx test web-landing`
Expected: FAIL — cannot resolve the two component modules.

- [ ] **Step 3: Create the components + templates**

Create `libs/web-landing/src/lib/landing-testimonial/landing-testimonial.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';

import { LwAvatarComponent } from '@learnwren/web-ui';

import { TESTIMONIAL } from '../landing-content';

@Component({
  selector: 'lib-landing-testimonial',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LwAvatarComponent],
  templateUrl: './landing-testimonial.component.html',
})
export class LandingTestimonialComponent {
  protected readonly testimonial = TESTIMONIAL;
}
```

Create `libs/web-landing/src/lib/landing-testimonial/landing-testimonial.component.html`:

```html
<section class="border-t border-line bg-bg-2">
  <figure class="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-20 md:flex-row md:items-start">
    <lw-avatar [displayName]="testimonial.name" userId="etta-holloway" size="lg" />
    <div>
      <figcaption class="lw-meta">{{ testimonial.eyebrow }}</figcaption>
      <blockquote class="mt-3 font-serif text-2xl leading-snug">
        "{{ testimonial.quote }}"
      </blockquote>
      <p class="lw-meta mt-4">{{ testimonial.name }} · {{ testimonial.context }}</p>
    </div>
  </figure>
</section>
```

Create `libs/web-landing/src/lib/landing-pricing/landing-pricing.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { PRICING_CTA_ROUTE, PRICING_INTRO, PRICING_TIERS } from '../landing-content';

@Component({
  selector: 'lib-landing-pricing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './landing-pricing.component.html',
})
export class LandingPricingComponent {
  protected readonly intro = PRICING_INTRO;
  protected readonly tiers = PRICING_TIERS;
  protected readonly ctaRoute = PRICING_CTA_ROUTE;
}
```

Create `libs/web-landing/src/lib/landing-pricing/landing-pricing.component.html`:

```html
<section class="border-t border-line">
  <div class="mx-auto max-w-6xl px-6 py-20 text-center">
    <h2 class="font-serif text-4xl">{{ intro.title }}</h2>
    <p class="mx-auto mt-3 max-w-xl text-ink-2">{{ intro.subcopy }}</p>
    <div class="mt-12 grid gap-5 text-left md:grid-cols-3">
      @for (tier of tiers; track tier.name) {
        <div
          class="flex flex-col rounded-lg border bg-bg-2 p-6"
          [class.border-ochre]="tier.featured"
          [class.border-line]="!tier.featured"
          [attr.data-featured]="tier.featured"
        >
          <p class="lw-meta">{{ tier.name }}</p>
          <p class="mt-2">
            <span class="font-serif text-4xl">{{ tier.price }}</span>
            <span class="lw-meta ml-1">{{ tier.cadence }}</span>
          </p>
          <p class="mt-3 flex-1 text-ink-2">{{ tier.blurb }}</p>
          <a
            [routerLink]="ctaRoute"
            class="lw-btn mt-6"
            [class.lw-btn-primary]="tier.featured"
            >{{ tier.cta }}</a
          >
        </div>
      }
    </div>
  </div>
</section>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm nx test web-landing`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-landing/src/lib/landing-testimonial libs/web-landing/src/lib/landing-pricing
git commit -m "feat(web-landing): add testimonial and pricing sections

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Footer + container + barrel + route wiring

**Files:**
- Create: `libs/web-landing/src/lib/landing-footer/landing-footer.component.{ts,html}`
- Test: `libs/web-landing/src/lib/landing-footer/landing-footer.component.spec.ts`
- Create: `libs/web-landing/src/lib/landing-page/landing-page.component.{ts,html}`
- Test: `libs/web-landing/src/lib/landing-page/landing-page.component.spec.ts`
- Create: `libs/web-landing/src/lib/landing.routes.ts`
- Modify: `libs/web-landing/src/index.ts`
- Modify: `apps/web/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `FOOTER_TAGLINE` from `../landing-content`; all eight section components; `landingGuard`; `LwWordmarkComponent` from `@learnwren/web-ui`; `Title` from `@angular/platform-browser`.
- Produces: `LandingFooterComponent` (selector `lib-landing-footer`), `LandingPageComponent` (selector `lib-landing-page`), `landingRoutes: Route[]`. Barrel exports `landingRoutes`, `landingGuard`, `LandingPageComponent`.

- [ ] **Step 1: Write the failing tests**

Create `libs/web-landing/src/lib/landing-footer/landing-footer.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LandingFooterComponent } from './landing-footer.component';

describe('LandingFooterComponent', () => {
  it('renders the wordmark and tagline', () => {
    TestBed.configureTestingModule({ imports: [LandingFooterComponent] });
    const fixture = TestBed.createComponent(LandingFooterComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('lw-wordmark')).not.toBeNull();
    expect(el.textContent).toContain('Slow lessons for small communities.');
  });
});
```

Create `libs/web-landing/src/lib/landing-page/landing-page.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { LandingPageComponent } from './landing-page.component';

describe('LandingPageComponent', () => {
  function render(): HTMLElement {
    TestBed.configureTestingModule({
      imports: [LandingPageComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(LandingPageComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('assembles all eight sections in order', () => {
    const el = render();
    for (const tag of [
      'lib-landing-hero',
      'lib-landing-stats',
      'lib-landing-shelf',
      'lib-landing-steps',
      'lib-landing-features',
      'lib-landing-testimonial',
      'lib-landing-pricing',
      'lib-landing-footer',
    ]) {
      expect(el.querySelector(tag)).not.toBeNull();
    }
  });

  it('sets the document title', () => {
    render();
    expect(TestBed.inject(Title).getTitle()).toContain('Learn Wren');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm nx test web-landing`
Expected: FAIL — cannot resolve `./landing-footer.component` / `./landing-page.component`.

- [ ] **Step 3: Create the footer**

Create `libs/web-landing/src/lib/landing-footer/landing-footer.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';

import { LwWordmarkComponent } from '@learnwren/web-ui';

import { FOOTER_TAGLINE } from '../landing-content';

@Component({
  selector: 'lib-landing-footer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LwWordmarkComponent],
  templateUrl: './landing-footer.component.html',
})
export class LandingFooterComponent {
  protected readonly tagline = FOOTER_TAGLINE;
}
```

Create `libs/web-landing/src/lib/landing-footer/landing-footer.component.html`:

```html
<footer class="border-t border-line">
  <div
    class="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-10 text-ink-3 md:flex-row md:items-center md:justify-between"
  >
    <lw-wordmark [size]="18" />
    <p class="lw-meta">{{ tagline }}</p>
  </div>
</footer>
```

- [ ] **Step 4: Create the container**

Create `libs/web-landing/src/lib/landing-page/landing-page.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';

import { LandingFeaturesComponent } from '../landing-features/landing-features.component';
import { LandingFooterComponent } from '../landing-footer/landing-footer.component';
import { LandingHeroComponent } from '../landing-hero/landing-hero.component';
import { LandingPricingComponent } from '../landing-pricing/landing-pricing.component';
import { LandingShelfComponent } from '../landing-shelf/landing-shelf.component';
import { LandingStatsComponent } from '../landing-stats/landing-stats.component';
import { LandingStepsComponent } from '../landing-steps/landing-steps.component';
import { LandingTestimonialComponent } from '../landing-testimonial/landing-testimonial.component';

@Component({
  selector: 'lib-landing-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LandingHeroComponent,
    LandingStatsComponent,
    LandingShelfComponent,
    LandingStepsComponent,
    LandingFeaturesComponent,
    LandingTestimonialComponent,
    LandingPricingComponent,
    LandingFooterComponent,
  ],
  templateUrl: './landing-page.component.html',
})
export class LandingPageComponent implements OnInit {
  private readonly title = inject(Title);

  ngOnInit(): void {
    this.title.setTitle('Learn Wren — slow lessons for small communities');
  }
}
```

Create `libs/web-landing/src/lib/landing-page/landing-page.component.html`:

```html
<lib-landing-hero />
<lib-landing-stats />
<lib-landing-shelf />
<lib-landing-steps />
<lib-landing-features />
<lib-landing-testimonial />
<lib-landing-pricing />
<lib-landing-footer />
```

- [ ] **Step 5: Create the routes and update the barrel**

Create `libs/web-landing/src/lib/landing.routes.ts`:

```ts
import type { Route } from '@angular/router';

import { landingGuard } from './landing.guard';

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

Overwrite `libs/web-landing/src/index.ts`:

```ts
export * from './lib/landing-content';
export { landingGuard } from './lib/landing.guard';
export { landingRoutes } from './lib/landing.routes';
export { LandingPageComponent } from './lib/landing-page/landing-page.component';
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm nx test web-landing`
Expected: PASS (all section + container + guard + content specs).

- [ ] **Step 7: Wire the app route**

In `apps/web/src/app/app.routes.ts`, add to the imports block:

```ts
import { landingRoutes } from '@learnwren/web-landing';
```

Then replace the final redirect line:

```ts
  { path: '', pathMatch: 'full', redirectTo: '/catalog' },
```

with:

```ts
  ...landingRoutes,
```

(Keep it as the last entry in the `appRoutes` array.)

- [ ] **Step 8: Verify the app builds and typechecks**

Run: `pnpm nx build web` (or `pnpm nx run web:build`)
Expected: build succeeds; `@learnwren/web-landing` resolves.

> If the import path does not resolve, run `pnpm nx sync` to refresh TS project references (cross-lib imports need the path mapping synced — a known repo gotcha).

- [ ] **Step 9: Commit**

```bash
git add libs/web-landing apps/web/src/app/app.routes.ts tsconfig.base.json
git commit -m "feat(web-landing): assemble landing page and serve it at /

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Mutation config + e2e

**Files:**
- Create: `stryker.web-landing.config.mjs` (repo root)
- Rewrite: `apps/web-e2e/src/home.spec.ts`

**Interfaces:**
- Consumes: the running app at `/` (logged-out landing) and the auth/register API for the authed-redirect case.
- Produces: a Stryker config the CI `mutation-affected` job auto-discovers; an e2e suite proving landing render, CTA navigation, and authed redirect.

- [ ] **Step 1: Add the Stryker config**

Create `stryker.web-landing.config.mjs` (mirrors `stryker.web-catalog.config.mjs`):

```js
// Stryker config scoped to libs/web-landing — static marketing landing page.
//
// Excluded from mutation:
// - *.routes.ts — pure config (route arrays); no runtime logic.
// - landing-content.ts — static copy data; assertions in landing-content.spec
//   lock its shape, but per-string mutation produces equivalent-ish noise.
// - index.ts — barrel re-exports.
//
// Component .ts files carry only field assignment + ngOnInit(setTitle); templates
// (.html) are not mutated by Stryker — that surface is covered by spec DOM assertions.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/web-landing/vite.config.mts',
  },
  mutate: [
    'libs/web-landing/src/lib/**/*.ts',
    '!libs/web-landing/src/lib/**/*.spec.ts',
    '!libs/web-landing/src/lib/**/*.test.ts',
    '!libs/web-landing/src/lib/**/*.routes.ts',
    '!libs/web-landing/src/lib/landing-content.ts',
    '!libs/web-landing/src/index.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/web-landing/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/web-landing/mutation.json' },
  thresholds: { high: 75, low: 50, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 15000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
```

- [ ] **Step 2: Run the mutation gate locally**

Run: `pnpm exec stryker run stryker.web-landing.config.mjs`
Expected: mutation score ≥ 80% adjusted. If survivors remain (most likely the `landingGuard` branches), add a targeted assertion to `landing.guard.spec.ts` until they are killed.

- [ ] **Step 3: Rewrite the home e2e**

Overwrite `apps/web-e2e/src/home.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099';
  process.env['FIRESTORE_EMULATOR_HOST'] = '127.0.0.1:8080';
  admin.initializeApp({ projectId: 'demo-learnwren' });
}

const API_BASE = 'http://localhost:3333/api';

/** Register a STUDENT and mark them verified so they can log in. */
async function registerVerifiedStudent(): Promise<{ email: string; password: string }> {
  const email = `web-e2e-landing-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
  const password = 'Aa1!aaaaaaaa';
  const reg = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName: 'S' }),
  });
  expect(reg.status).toBe(201);
  const { uid } = (await reg.json()) as { uid: string };
  await admin.auth().updateUser(uid, { emailVerified: true });
  return { email, password };
}

test('a logged-out visitor sees the landing page at /', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /Slow lessons, made for small communities/i,
    }),
  ).toBeVisible();
});

test('the hero "Start for free" CTA navigates to /register', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Start for free' }).first().click();
  await expect(page).toHaveURL(/\/register$/);
});

test('the hero "Browse the shelf" CTA navigates to /catalog', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Browse the shelf' }).click();
  await expect(page).toHaveURL(/\/catalog$/);
});

test('an authenticated user is redirected from / to /dashboard', async ({ page }) => {
  const { email, password } = await registerVerifiedStudent();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard$/);

  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard$/);
});
```

- [ ] **Step 4: Run the e2e**

Run: `pnpm nx e2e web-e2e --grep "landing|Start for free|Browse the shelf|redirected from"`
(Requires the emulators + app running per `docs/development.md`; the e2e target boots them as configured.)
Expected: all four tests PASS.

- [ ] **Step 5: Final full check + commit**

Run: `pnpm nx test web-landing && pnpm nx lint web-landing && pnpm nx build web`
Expected: all green.

```bash
git add stryker.web-landing.config.mjs apps/web-e2e/src/home.spec.ts
git commit -m "test(web-landing): add mutation config and landing e2e suite

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- New `libs/web-landing` lib → Task 1. ✅
- `landingGuard` redirect (authed → /dashboard) → Task 2 (unit) + Task 9 (e2e). ✅
- Route swap `''` → landing → Task 8 Step 7. ✅
- Reuse global shell header (no bespoke header) → not built here; the route stays a non-auth route, so `app.html`'s `showHeader()` keeps the existing header. No app-shell change needed beyond the route. ✅
- Eight section components + container + typed content module → Tasks 3–8. ✅
- All copy verbatim from mockup → Task 1 content module (sourced from the design image). ✅
- CTA wiring (register/catalog) → hero (Task 3), shelf (Task 5), pricing (Task 7); asserted in specs + e2e. ✅
- Hero visual as decorative `aria-hidden` approximation → Task 3 template. ✅
- One `<h1>`, `<h2>` section heads, focus-visible → Task 3 (single h1) + section templates; shell provides skip-link. ✅
- Unit specs ≥80% mutation + Stryker onboarding → Task 9. ✅
- e2e (render, authed redirect, CTA nav) → Task 9. ✅
- No new tokens → Global Constraints + templates use existing classes only. ✅

**Placeholder scan:** No TBD/TODO; every code step has complete code. ✅

**Type consistency:** `LwCoverTone` (not the spec's shorthand `CoverTone`) is the real exported type and is used in `landing-content.ts` and `landing-shelf`. Content constant names are identical across the producing task (Task 1) and every consuming task. Component selectors (`lib-landing-*`) match between templates, container imports, and the container spec's `querySelector` assertions. Guard signature (`CanActivateFn`, returns `true | UrlTree`) matches its spec and `landing.routes.ts`. ✅

> **Note for the implementer:** the design spec (`docs/superpowers/specs/2026-06-19-landing-page-design.md`) refers to the cover-tone type as `CoverTone`; the actual exported type is **`LwCoverTone`** (from `@learnwren/web-ui`). This plan uses the correct name — follow the plan.
