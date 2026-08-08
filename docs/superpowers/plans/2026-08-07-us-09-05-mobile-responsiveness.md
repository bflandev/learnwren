# US-09-05 Mobile Responsiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CI-gated responsive sweep that fails on horizontal overflow at 320/768/1280/2560 px across every route, and fix the layout defects it catches — chiefly a header that does not collapse at all.

**Architecture:** A second hermetic Playwright suite (`nx run web-e2e:responsive`) reusing the route inventory built for the US-09-03 accessibility gate. The suite lands **red** first, then the fixes land: the app header is extracted into its own component and collapses to a hamburger + `hlm-sheet` below `md`, and the two bare `<table>` elements get overflow containers. CI wiring goes in last, once green.

**Tech Stack:** Angular 21 (standalone, signals, OnPush), Tailwind, spartan-ng helm primitives (`hlm-sheet`, `hlm-icon`, `@ng-icons/lucide`), Playwright, Vitest, Nx.

**Spec:** [`docs/superpowers/specs/2026-08-07-us-09-05-mobile-responsiveness-design.md`](../specs/2026-08-07-us-09-05-mobile-responsiveness-design.md)

## Global Constraints

- **Work in a git worktree**, branched from local `HEAD` (local `main` is far ahead of `origin`): `git worktree add ../learnwren-us-09-05 -b feat/us-09-05-mobile-responsive HEAD`. Symlink `node_modules` to the parent checkout. Because that symlink evades `.gitignore`, **never run `git add -A`** — add files explicitly, always. Land via a local `--no-ff` merge to `main` from the main checkout.
- **The existing a11y suite must stay green after every task.** `pnpm exec nx run web-e2e:a11y`. The header work touches focus management, which that suite guards.
- **Never change `--lw-*` design token values.** Use existing tokens; the `token-discipline.spec.ts` in `web-ui` lints for this.
- **Route fixtures must stay field-verified against `shared-data-models`.** A wrong or missing field renders an error state, the `expectText` render guard fails, and the route silently stops being covered.
- **Angular conventions:** standalone components, `ChangeDetectionStrategy.OnPush`, `inject()` over constructor injection, `@if`/`@for` block syntax with `track`.
- **Commit format:** `<type>: <description>` — `feat`, `fix`, `test`, `refactor`, `docs`, `ci`, `chore`.
- **Breakpoint is Tailwind `md` (768 px).** Below `md` = collapsed header. This must match the 768 width in the sweep.
- **`vitest` does not typecheck.** A green unit-test run can hide a TypeScript error. Run `pnpm exec nx typecheck web` explicitly where the plan says to.

---

## File Structure

**Renamed (Task 1):**
- `apps/web-e2e/src/_helpers/a11y-routes.ts` → `apps/web-e2e/src/_helpers/route-inventory.ts` — the shared 22-route table plus fixtures. Type `A11yRoute` → `RouteFixture`.
- `apps/web-e2e/src/_helpers/a11y-stubs.ts` → `apps/web-e2e/src/_helpers/route-stubs.ts` — `stubAuth`, `stubJson`. Type `A11yRole` → `RouteRole`.

> **Deviation from spec §4.1, flagged for review:** the spec named only `a11y-routes.ts`. `a11y-stubs.ts` is renamed too because `route-inventory.ts` imports its `A11yRole` type — leaving a file named `a11y-stubs` as a shared dependency of a non-a11y suite recreates exactly the naming drift the rename exists to prevent. Both renames are mechanical, no behaviour change.

**Created:**
- `apps/web-e2e/playwright.responsive.config.ts` — dev-server-only Playwright config, cloned from `playwright.a11y.config.ts`.
- `apps/web-e2e/src/responsive/overflow.responsive.spec.ts` — the route × width overflow sweep.
- `apps/web-e2e/src/responsive/header.responsive.spec.ts` — hamburger collapse specs.
- `apps/web/src/app/shell/app-header.component.ts` — extracted header component.
- `apps/web/src/app/shell/app-header.component.html` — its template.
- `apps/web/src/app/shell/app-header.component.spec.ts` — its unit tests.

**Modified:**
- `apps/web/src/app/app.html` — header markup removed, replaced by `<app-header />`.
- `apps/web/src/app/app.ts` — avatar/auth members move out to the header component.
- `apps/web/src/app/app.spec.ts` — header-markup assertions move to the header spec.
- `apps/web-e2e/project.json` — new `responsive` target.
- `libs/web-courses/src/lib/course-students-page/course-students-page.component.html` — table overflow wrapper.
- `libs/web-courses/src/lib/course-analytics-page/course-analytics-page.component.html` — table overflow wrapper.
- `.github/workflows/ci.yml` — new `responsive` job.
- `docs/epics/09-non-functional-requirements.md` — gesture AC amendment.
- `README.md`, `docs/USER_GUIDE.md`, `docs/development.md` — the slice record.

Splitting the header out of `app.html` is deliberate: the root template is ~63 lines today, ~55 of which are header, and adding collapse logic pushes it past what belongs inline. `apps/web/src/app/shell/` already exists as the home for shell concerns (`is-auth-route.ts`).

---

### Task 1: Rename the shared route helpers

Purely mechanical. Do it first so every later task imports the final names and no task needs a follow-up rename.

**Files:**
- Rename: `apps/web-e2e/src/_helpers/a11y-routes.ts` → `apps/web-e2e/src/_helpers/route-inventory.ts`
- Rename: `apps/web-e2e/src/_helpers/a11y-stubs.ts` → `apps/web-e2e/src/_helpers/route-stubs.ts`
- Modify: `apps/web-e2e/src/a11y/routes.a11y.spec.ts`
- Modify: `apps/web-e2e/src/a11y/keyboard.a11y.spec.ts`
- Modify: `apps/web-e2e/src/a11y/showcase.a11y.spec.ts` (only if it imports either file — check)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `apps/web-e2e/src/_helpers/route-inventory.ts` exporting `interface RouteFixture { name: string; path: string; role: RouteRole; stubs?: (page: Page) => Promise<void>; readySelector?: string; expectText?: string; expectAttached?: boolean }`, plus `GUEST_ROUTES: RouteFixture[]`, `AUTHED_ROUTES: RouteFixture[]`, and the fixture constants `NOW`, `FIRST_CATEGORY`, `CATEGORIES`, `COURSE_CARD`, `CATALOG_LIST`, `COURSE_LIST_ITEM`, `COURSE_LIST` (all names unchanged).
  - `apps/web-e2e/src/_helpers/route-stubs.ts` exporting `type RouteRole = 'guest' | 'student' | 'instructor' | 'admin'`, `stubAuth(page: Page, role: RouteRole): Promise<void>`, `stubJson(...)` (signature unchanged).

- [x] **Step 1: Confirm the a11y suite is green before touching anything**

Run: `pnpm exec nx run web-e2e:a11y`
Expected: PASS. If it is already red, stop and report — do not start a rename on a red suite.

- [x] **Step 2: Find every consumer**

```bash
grep -rn "a11y-routes\|a11y-stubs\|A11yRoute\|A11yRole" apps/web-e2e/src
```

Expected hits: `routes.a11y.spec.ts` (imports `GUEST_ROUTES`, `AUTHED_ROUTES`, `type A11yRoute`), `keyboard.a11y.spec.ts` (imports fixtures and `stubAuth`), and the two comment references inside `keyboard.a11y.spec.ts` at roughly lines 116 and 276 that name `a11y-routes.ts` in prose. Update the prose references too — a comment pointing at a file that no longer exists is a small lie that costs the next reader real time.

- [x] **Step 3: Rename the files with git so history follows**

```bash
git mv apps/web-e2e/src/_helpers/a11y-routes.ts apps/web-e2e/src/_helpers/route-inventory.ts
git mv apps/web-e2e/src/_helpers/a11y-stubs.ts apps/web-e2e/src/_helpers/route-stubs.ts
```

- [x] **Step 4: Rename the types and fix imports**

In `route-stubs.ts`, rename the exported type and every internal use:

```ts
export type RouteRole = 'guest' | 'student' | 'instructor' | 'admin';

const USERS: Record<Exclude<RouteRole, 'guest'>, Record<string, unknown>> = {
  // ...unchanged...
};

/** Stub GET /api/auth/me for the given role. `guest` returns 401. */
export async function stubAuth(page: Page, role: RouteRole): Promise<void> {
  // ...unchanged...
}
```

In `route-inventory.ts`, update the import and the interface name:

```ts
import { stubJson, type RouteRole } from './route-stubs';

export interface RouteFixture {
  /** Human label used as the test title. */
  name: string;
  /** Path to navigate to. */
  path: string;
  /** Role to stub for GET /api/auth/me. */
  role: RouteRole;
  // ...remaining fields and their doc comments unchanged...
}

export const GUEST_ROUTES: RouteFixture[] = [ /* unchanged */ ];
export const AUTHED_ROUTES: RouteFixture[] = [ /* unchanged */ ];
```

In `routes.a11y.spec.ts`:

```ts
import { GUEST_ROUTES, AUTHED_ROUTES, type RouteFixture } from '../_helpers/route-inventory';

function register(route: RouteFixture): void {
```

In `keyboard.a11y.spec.ts`, change the `'../_helpers/a11y-routes'` import path to `'../_helpers/route-inventory'`, the `'../_helpers/a11y-stubs'` path (if present) to `'../_helpers/route-stubs'`, and update the two prose comments that name `a11y-routes.ts` to `route-inventory.ts`.

Do **not** change any fixture value, route path, `expectText`, or stub glob. This task changes names only.

- [x] **Step 5: Verify nothing dangles**

```bash
grep -rn "a11y-routes\|a11y-stubs\|A11yRoute\|A11yRole" apps/web-e2e/src
```

Expected: no output.

- [x] **Step 6: Run the a11y suite to prove the rename is behaviour-neutral**

Run: `pnpm exec nx run web-e2e:a11y`
Expected: PASS — the same tests, the same count as Step 1. A changed test count means an import broke and a spec silently stopped registering; investigate before continuing.

- [x] **Step 7: Commit**

```bash
git add apps/web-e2e/src/_helpers/route-inventory.ts \
        apps/web-e2e/src/_helpers/route-stubs.ts \
        apps/web-e2e/src/a11y/routes.a11y.spec.ts \
        apps/web-e2e/src/a11y/keyboard.a11y.spec.ts
git commit -m "refactor(web-e2e): rename a11y route helpers to shared route-inventory/route-stubs"
```

---

### Task 2: The responsive overflow sweep (lands RED)

**Files:**
- Create: `apps/web-e2e/playwright.responsive.config.ts`
- Create: `apps/web-e2e/src/responsive/overflow.responsive.spec.ts`
- Modify: `apps/web-e2e/project.json`

**Interfaces:**
- Consumes: `GUEST_ROUTES`, `AUTHED_ROUTES`, `RouteFixture` from `_helpers/route-inventory`; `stubAuth` from `_helpers/route-stubs` (Task 1).
- Produces: `pnpm exec nx run web-e2e:responsive`, and the exported constant `VIEWPORTS` in `overflow.responsive.spec.ts` — reused by Task 4's header spec.

- [x] **Step 1: Write the config**

Create `apps/web-e2e/playwright.responsive.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

/**
 * Standalone config for the responsive suite (US-09-05).
 *
 * Mirrors playwright.a11y.config.ts: starts ONLY the Angular dev server,
 * because these specs are hermetic — every /api call is stubbed via
 * page.route through the shared route inventory — so they need neither the
 * NestJS api nor the Firebase emulators.
 *
 * Viewport is set per-test, not here: the whole point of the suite is to
 * drive the same route at several widths, so a config-level viewport would
 * be overwritten on every test anyway and would only mislead a reader.
 *
 * Retries come from nxE2EPreset (spread below): 2 on CI, 0 locally. As with
 * the a11y gate, a green run after a retry is NOT the same as a clean
 * first-attempt pass. An overflow that depends on a late-loading font or a
 * late-mounting image can fail once and pass on retry, which hides a real
 * layout defect behind a green checkmark. Treat repeated retries in CI logs
 * as a signal to investigate.
 */
const webPort = process.env['WEB_PORT'] || '4200';
const baseURL = process.env['BASE_URL'] || `http://localhost:${webPort}`;

export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src/responsive' }),
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: `pnpm exec nx serve web --port ${webPort}`,
      url: `http://localhost:${webPort}`,
      reuseExistingServer: !process.env['CI'],
      cwd: workspaceRoot,
      // Explicit, not Playwright's unstated 60s default — same reasoning as
      // playwright.a11y.config.ts: a cold Angular dev-server compile on a
      // fresh CI checkout needs headroom, without masking a hung server for
      // a full CI timeout.
      timeout: 90_000,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [x] **Step 2: Write the failing sweep**

Create `apps/web-e2e/src/responsive/overflow.responsive.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

import { GUEST_ROUTES, AUTHED_ROUTES, type RouteFixture } from '../_helpers/route-inventory';
import { stubAuth } from '../_helpers/route-stubs';

/**
 * US-09-05: "Text is legible without horizontal scrolling on any supported
 * screen width" (320 px – 2560 px).
 *
 * 320 and 2560 are the endpoints named in the acceptance criterion. 768 is
 * the Tailwind `md` boundary, where the header swaps between its collapsed
 * and expanded layouts — the width most likely to expose an off-by-one in a
 * breakpoint. 1280 is standard desktop.
 *
 * Exported because header.responsive.spec.ts drives the same widths; one
 * definition means the two specs cannot drift apart.
 */
export const VIEWPORTS = [
  { name: '320 (small mobile)', width: 320, height: 640 },
  { name: '768 (tablet / md boundary)', width: 768, height: 1024 },
  { name: '1280 (desktop)', width: 1280, height: 800 },
  { name: '2560 (large desktop)', width: 2560, height: 1440 },
] as const;

/**
 * The one honestly machine-verifiable claim in US-09-05. Everything else in
 * the story ("renders correctly", "touch-friendly") is subjective; gating on
 * a proxy for it would overstate what CI proves. See the spec, §4.5.
 */
async function expectNoHorizontalOverflow(
  page: import('@playwright/test').Page,
  label: string,
): Promise<void> {
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });

  expect(
    overflow.scrollWidth,
    `${label}: page scrolls horizontally — content is ${
      overflow.scrollWidth - overflow.clientWidth
    }px wider than the ${overflow.clientWidth}px viewport`,
  ).toBeLessThanOrEqual(overflow.clientWidth);
}

function register(route: RouteFixture): void {
  test.describe(`${route.name} (${route.path})`, () => {
    for (const viewport of VIEWPORTS) {
      test(`has no horizontal overflow at ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await stubAuth(page, route.role);
        await route.stubs?.(page);
        await page.goto(route.path);

        await page.waitForSelector(route.readySelector ?? 'h1, h2, [role="heading"]');

        // Prove the route rendered its REAL content, not an error/empty
        // state — a stubbed page settles on an error paragraph just as fast
        // as on real data, and an error page is narrow enough to pass an
        // overflow check trivially. Without this guard a fixture-shape bug
        // turns into a silently-passing test. Same contract as the a11y
        // sweep; see RouteFixture.expectText in _helpers/route-inventory.ts.
        if (route.expectText) {
          const locator = page.getByText(route.expectText);
          if (route.expectAttached) {
            await expect(locator.first()).toBeAttached();
          } else {
            await expect(locator.first()).toBeVisible();
          }
        }

        await expectNoHorizontalOverflow(page, `${route.name} @ ${viewport.width}px`);
      });
    }
  });
}

test.describe('guest routes', () => {
  GUEST_ROUTES.forEach(register);
});

test.describe('authenticated routes', () => {
  AUTHED_ROUTES.forEach(register);
});
```

- [x] **Step 3: Add the Nx target**

Modify `apps/web-e2e/project.json` — add `responsive` alongside `a11y`:

```json
{
  "name": "web-e2e",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "projectType": "application",
  "sourceRoot": "apps/web-e2e/src",
  "implicitDependencies": ["web"],
  "tags": ["scope:web"],
  "// targets": "to see all targets run: nx show project web-e2e --web",
  "targets": {
    "e2e": {
      "dependsOn": ["api:build"]
    },
    "a11y": {
      "executor": "@nx/playwright:playwright",
      "options": {
        "config": "apps/web-e2e/playwright.a11y.config.ts"
      }
    },
    "responsive": {
      "executor": "@nx/playwright:playwright",
      "options": {
        "config": "apps/web-e2e/playwright.responsive.config.ts"
      }
    }
  }
}
```

- [x] **Step 4: Run the sweep and capture the RED output**

Run: `pnpm exec nx run web-e2e:responsive`

Expected: **FAIL.** The header does not collapse (`apps/web/src/app/app.html:8` is one flat flex row with no breakpoints), so routes should fail at 320 px with a message like `... page scrolls horizontally — content is NNNpx wider than the 320px viewport`.

**Record the actual failure list** — which routes, which widths, how many px over — in the commit message body. This list is the input to Task 6, and it is the only honest source for what is actually broken. Do not edit the sweep to make it smaller.

If the sweep passes entirely at this point, stop and investigate before continuing: the most likely cause is that `expectText` guards are failing silently or the routes are rendering error states, not that the header is fine.

- [x] **Step 5: Commit the red gate**

```bash
git add apps/web-e2e/playwright.responsive.config.ts \
        apps/web-e2e/src/responsive/overflow.responsive.spec.ts \
        apps/web-e2e/project.json
git commit -m "test(web-e2e): responsive overflow sweep at 320/768/1280/2560 (red)

Fails on: <paste the actual route/width/px list from Step 4>

Not yet wired into CI — the gate is added in the final task, once green."
```

---

### Task 3: Extract the header into its own component (no behaviour change)

Pure refactor. Landing it separately from the collapse means a reviewer can reject the collapse design without also rejecting the extraction, and it keeps the collapse diff readable.

**Files:**
- Create: `apps/web/src/app/shell/app-header.component.ts`
- Create: `apps/web/src/app/shell/app-header.component.html`
- Create: `apps/web/src/app/shell/app-header.component.spec.ts`
- Modify: `apps/web/src/app/app.html`
- Modify: `apps/web/src/app/app.ts`
- Modify: `apps/web/src/app/app.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `AppHeaderComponent` (selector `app-header`, standalone, `OnPush`, no inputs, no outputs — it reads `AuthService` itself). Task 4 modifies it.

- [x] **Step 1: Write the header component's failing spec**

Create `apps/web/src/app/shell/app-header.component.spec.ts`. These assertions are moved from `app.spec.ts` — read that file first and mirror its existing `TestBed` setup and auth-stubbing helper rather than inventing a new one.

```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { AppHeaderComponent } from './app-header.component';

// Reuse app.spec.ts's existing TestBed providers and auth stub helper —
// import them rather than duplicating. If they are inline in app.spec.ts,
// lift them into a shared local test helper as part of this step.

describe('AppHeaderComponent', () => {
  it('renders the search bar', async () => {
    const fixture = TestBed.createComponent(AppHeaderComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('lib-course-search-bar')).not.toBeNull();
  });

  it('shows Log in / Register for a guest', async () => {
    // ...as asserted in app.spec.ts today...
  });

  it('shows the My Courses nav link for an instructor', async () => {
    // ...as asserted in app.spec.ts today...
  });

  it('hides the My Courses nav link for a student', async () => {
    // ...as asserted in app.spec.ts today...
  });

  it('shows the Admin nav link for an admin', async () => {
    // ...as asserted in app.spec.ts today...
  });

  it('hides the Admin nav link for an instructor', async () => {
    // ...as asserted in app.spec.ts today...
  });

  it('renders the user initials in the avatar when authenticated', async () => {
    // ...as asserted in app.spec.ts today...
  });

  it('links the avatar to /settings/profile', async () => {
    // ...as asserted in app.spec.ts today...
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm exec nx test web -- app-header`
Expected: FAIL — `Cannot find module './app-header.component'`.

- [x] **Step 3: Create the component**

Create `apps/web/src/app/shell/app-header.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '@learnwren/web-auth';
import { CourseSearchBarComponent } from '@learnwren/web-catalog';
import {
  HlmAvatar,
  HlmButton,
  LwWordmarkComponent,
  ThemeToggleComponent,
  avatarToneFor,
  deriveInitials,
} from '@learnwren/web-ui';

@Component({
  selector: 'app-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    HlmAvatar,
    HlmButton,
    LwWordmarkComponent,
    ThemeToggleComponent,
    CourseSearchBarComponent,
  ],
  templateUrl: './app-header.component.html',
})
export class AppHeaderComponent {
  protected readonly auth = inject(AuthService);

  protected readonly avatarInitials = computed(() =>
    deriveInitials(this.auth.currentUser()?.displayName ?? ''),
  );
  protected readonly avatarTone = computed(() =>
    avatarToneFor(this.auth.currentUser()?.uid ?? ''),
  );
}
```

Create `apps/web/src/app/shell/app-header.component.html` by moving lines 8–51 of `apps/web/src/app/app.html` verbatim — the whole `<header>` element, unchanged. Do not adjust classes in this task.

- [x] **Step 4: Rewire the root**

In `apps/web/src/app/app.html`, replace the `<header>...</header>` block (currently lines 8–51) with a single element, leaving the `@if (showHeader())` wrapper, the skip link, and both `<main>` branches exactly as they are:

```html
@if (showHeader()) {
  <app-header />
  <main id="main-content" tabindex="-1" class="bg-bg text-ink focus-ring">
    <router-outlet />
  </main>
} @else {
```

In `apps/web/src/app/app.ts`: add `AppHeaderComponent` to `imports`; remove `RouterLink`, `HlmAvatar`, `HlmButton`, `LwWordmarkComponent`, `ThemeToggleComponent`, `CourseSearchBarComponent` from `imports` and their now-unused import statements; delete the `avatarInitials` and `avatarTone` computeds and the `deriveInitials` / `avatarToneFor` imports. **Keep** `AuthService` only if something outside the header still uses it — check; if not, remove it too.

Leave the constructor's focus-management block and `showHeader` untouched. That block carries a long comment explaining a real WCAG 2.4.3 fix and a subtle `afterNextRender` race; it belongs to the root, not the header.

- [x] **Step 5: Move the header assertions out of `app.spec.ts`**

Delete from `apps/web/src/app/app.spec.ts` the tests now living in the header spec (`shows the header for a guest...`'s search-bar assertion, the Log in/Register test, both My Courses tests, both Admin tests, the initials test, the profile-link test, and the `hlm-avatar` binding test).

**Keep** in `app.spec.ts`: `renders the router outlet`, `provides a skip-to-content link...`, `hides the header on an auth route`, and a reduced `shows the header for a guest on a non-auth route` that now asserts only that `app-header` is present:

```ts
it('shows the header for a guest on a non-auth route', async () => {
  const fixture = TestBed.createComponent(App);
  await TestBed.inject(Router).navigateByUrl('/catalog');
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('app-header')).not.toBeNull();
});
```

- [x] **Step 6: Run the unit tests and the typecheck**

Run: `pnpm exec nx test web`
Expected: PASS.

Run: `pnpm exec nx typecheck web`
Expected: PASS. Run this explicitly — `vitest` does not typecheck, so a leftover unused import or a stale reference in `app.ts` will pass the test run and fail the build.

- [x] **Step 7: Prove the refactor is behaviour-neutral**

Run: `pnpm exec nx run web-e2e:a11y`
Expected: PASS.

Run: `pnpm exec nx run web-e2e:responsive`
Expected: FAIL, with **exactly the same failure list as Task 2 Step 4**. A pure extraction must not change the failure set. If it shrank or grew, the move was not verbatim — go find what changed.

- [x] **Step 8: Commit**

```bash
git add apps/web/src/app/shell/app-header.component.ts \
        apps/web/src/app/shell/app-header.component.html \
        apps/web/src/app/shell/app-header.component.spec.ts \
        apps/web/src/app/app.html \
        apps/web/src/app/app.ts \
        apps/web/src/app/app.spec.ts
git commit -m "refactor(web): extract the app header into its own shell component"
```

---

### Task 4: Collapse the header below `md`

**Files:**
- Modify: `apps/web/src/app/shell/app-header.component.ts`
- Modify: `apps/web/src/app/shell/app-header.component.html`
- Modify: `apps/web/src/app/shell/app-header.component.spec.ts`
- Create: `apps/web-e2e/src/responsive/header.responsive.spec.ts`

**Interfaces:**
- Consumes: `AppHeaderComponent` (Task 3); `VIEWPORTS` from `responsive/overflow.responsive.spec.ts` (Task 2); `stubAuth` from `_helpers/route-stubs` (Task 1).
- Produces: the header's collapsed layout, keyed on the `data-testid` values `header-nav-toggle` (the hamburger), `header-nav` (the desktop nav), and `header-nav-sheet` (the sheet content).

Target layout below `md`:

```
┌────────────────────────────┐
│ ☰   ⌂ Learn Wren     ◑  ◍ │
└────────────────────────────┘
   sheet: nav links (role-filtered) + search bar
```

- [x] **Step 1: Write the failing e2e header spec**

Create `apps/web-e2e/src/responsive/header.responsive.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

import { stubAuth } from '../_helpers/route-stubs';

/**
 * US-09-05: "Navigation menus collapse into a hamburger menu on small
 * screens." The one other objectively testable criterion in the story
 * besides horizontal overflow.
 *
 * The admin role is the worst case — seven nav links — so it is the one
 * driven at 320px.
 */
const MOBILE = { width: 320, height: 640 };
const DESKTOP = { width: 1280, height: 800 };

test.describe('header collapse', () => {
  test('below md: hamburger is shown and the inline nav is hidden', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await stubAuth(page, 'admin');
    await page.goto('/catalog');

    await expect(page.getByTestId('header-nav-toggle')).toBeVisible();
    await expect(page.getByTestId('header-nav')).toBeHidden();
  });

  test('at md and above: inline nav is shown and the hamburger is hidden', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await stubAuth(page, 'admin');
    await page.goto('/catalog');

    await expect(page.getByTestId('header-nav')).toBeVisible();
    await expect(page.getByTestId('header-nav-toggle')).toBeHidden();
  });

  test('the sheet exposes every link the desktop nav shows for the role', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await stubAuth(page, 'admin');
    await page.goto('/catalog');

    await page.getByTestId('header-nav-toggle').click();
    const sheet = page.getByTestId('header-nav-sheet');
    await expect(sheet).toBeVisible();

    for (const label of [
      'Browse courses',
      'Dashboard',
      'Admin',
      'Users',
      'Categories',
      'Health',
    ]) {
      await expect(sheet.getByRole('link', { name: label })).toBeVisible();
    }
    // Search moves into the sheet, where it gets full width instead of the
    // ~120px it would be crushed to in a 320px header bar.
    await expect(sheet.locator('lib-course-search-bar')).toBeVisible();
  });

  test('the toggle reports its state and returns focus on close', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await stubAuth(page, 'admin');
    await page.goto('/catalog');

    const toggle = page.getByTestId('header-nav-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('header-nav-sheet')).toBeHidden();
    // WCAG 2.4.3: dismissing an overlay must not strand focus on <body>.
    await expect(toggle).toBeFocused();
  });

  test('a student does not see instructor or admin links in the sheet', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await stubAuth(page, 'student');
    await page.goto('/catalog');

    await page.getByTestId('header-nav-toggle').click();
    const sheet = page.getByTestId('header-nav-sheet');
    await expect(sheet.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'My Courses' })).toBeHidden();
    await expect(sheet.getByRole('link', { name: 'Admin' })).toBeHidden();
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm exec nx run web-e2e:responsive -- header.responsive`
Expected: FAIL — no element carries `data-testid="header-nav-toggle"`.

- [x] **Step 3: Implement the collapse**

Update `apps/web/src/app/shell/app-header.component.ts` — add the sheet imports and the hamburger icon:

```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { lucideMenu } from '@ng-icons/lucide';

import { AuthService } from '@learnwren/web-auth';
import { CourseSearchBarComponent } from '@learnwren/web-catalog';
import {
  HlmAvatar,
  HlmButton,
  HlmIcon,
  HlmSheetImports,
  LwWordmarkComponent,
  ThemeToggleComponent,
  avatarToneFor,
  deriveInitials,
} from '@learnwren/web-ui';

@Component({
  selector: 'app-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    HlmAvatar,
    HlmButton,
    HlmIcon,
    ...HlmSheetImports,
    LwWordmarkComponent,
    ThemeToggleComponent,
    CourseSearchBarComponent,
  ],
  providers: [provideIcons({ lucideMenu })],
  templateUrl: './app-header.component.html',
})
export class AppHeaderComponent {
  protected readonly auth = inject(AuthService);

  protected readonly avatarInitials = computed(() =>
    deriveInitials(this.auth.currentUser()?.displayName ?? ''),
  );
  protected readonly avatarTone = computed(() =>
    avatarToneFor(this.auth.currentUser()?.uid ?? ''),
  );
}
```

Verify the `HlmSheetImports` / `HlmIcon` / `provideIcons` pattern against the working example at `apps/web/src/app/showcase/hlm-showcase.component.html:592-600` and `libs/web-ui/src/lib/theme-toggle/theme-toggle.component.ts:14`. If `@learnwren/web-ui` does not re-export `HlmSheetImports` from its root `index.ts`, add that export — do not deep-import `libs/web-ui/src/lib/sheet`.

Rewrite `apps/web/src/app/shell/app-header.component.html`. The nav link list appears twice — inline for desktop, and inside the sheet — so extract it into an `<ng-template>` and instantiate it in both places rather than duplicating seven links:

```html
<ng-template #navLinks>
  <a routerLink="/catalog" hlmBtn variant="ghost">Browse courses</a>
  @if (auth.isAuthenticated()) {
    <a routerLink="/dashboard" hlmBtn variant="ghost">Dashboard</a>
    @if (auth.currentUser()?.role === 'INSTRUCTOR') {
      <a routerLink="/courses" hlmBtn variant="ghost">My Courses</a>
    }
    @if (auth.currentUser()?.role === 'ADMIN') {
      <a routerLink="/admin/instructor-applications" hlmBtn variant="ghost">Admin</a>
      <a routerLink="/admin/users" hlmBtn variant="ghost">Users</a>
      <a routerLink="/admin/categories" hlmBtn variant="ghost">Categories</a>
      <a routerLink="/admin/health" hlmBtn variant="ghost">Health</a>
    }
  }
</ng-template>

<header class="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-bg px-4 py-3.5 md:gap-6 md:px-6">
  <!-- Mobile: hamburger opens the nav + search in a sheet. The sheet is the
       only place those live below md; the bar keeps the theme toggle and the
       avatar, the two controls a student actually reaches for on a phone. -->
  <hlm-sheet side="left" class="md:hidden">
    <button
      hlmBtn
      variant="ghost"
      hlmSheetTrigger
      type="button"
      aria-label="Open navigation menu"
      aria-controls="header-nav-sheet"
      data-testid="header-nav-toggle"
    >
      <hlm-icon name="lucideMenu" />
    </button>
    <hlm-sheet-overlay />
    <hlm-sheet-content *brnSheetContent id="header-nav-sheet" data-testid="header-nav-sheet">
      <h2 hlmSheetTitle>Menu</h2>
      <nav class="mt-4 flex flex-col items-start gap-1">
        <ng-container *ngTemplateOutlet="navLinks" />
      </nav>
      <div class="mt-4">
        <lib-course-search-bar />
      </div>
    </hlm-sheet-content>
  </hlm-sheet>

  <a routerLink="/catalog"><lw-wordmark [size]="20" /></a>

  <nav class="hidden gap-1 md:flex" data-testid="header-nav">
    <ng-container *ngTemplateOutlet="navLinks" />
  </nav>

  <span class="flex-1"></span>

  <div class="hidden md:block">
    <lib-course-search-bar />
  </div>
  <lw-theme-toggle />

  @if (auth.isAuthenticated()) {
    <a
      role="img"
      routerLink="/settings/profile"
      class="flex items-center gap-2"
      [attr.aria-label]="'Profile settings for ' + (auth.currentUser()?.displayName ?? '')"
    >
      <hlm-avatar
        size="sm"
        [src]="auth.currentUser()?.photoUrl"
        [alt]="auth.currentUser()?.displayName ?? ''"
        [attr.data-tone]="avatarTone()"
      >
        <span data-testid="header-avatar-initials" class="text-xs font-medium">{{
          avatarInitials()
        }}</span>
      </hlm-avatar>
      <!-- Dropped below md: the name chip is what blows the row out at 320px,
           and the avatar link already carries the accessible name via its
           aria-label above. -->
      <span class="user-chip-name hidden text-sm md:inline">{{
        auth.currentUser()?.displayName
      }}</span>
    </a>
  } @else {
    <a routerLink="/login" hlmBtn variant="ghost">Log in</a>
    <a routerLink="/register" hlmBtn>Register</a>
  }
</header>
```

`*ngTemplateOutlet` needs `NgTemplateOutlet` in the component's `imports` — add it from `@angular/common`.

**On `aria-expanded`:** the spec requires the toggle to report its state. Check whether `hlmSheetTrigger` already manages `aria-expanded` — spartan's brain layer often does. If it does, delete the manual handling and let the primitive own it. If it does not, bind it to the sheet's open state rather than hardcoding `"false"`. The Step 1 spec asserts the attribute flips, so a hardcoded value fails.

**On focus return:** likewise check whether the sheet restores focus to its trigger on close. If it does not, wire it explicitly — the Step 1 test asserts it, and the a11y gate will independently catch a regression here.

- [x] **Step 4: Add unit tests for the collapsed structure**

Append to `apps/web/src/app/shell/app-header.component.spec.ts`:

```ts
it('renders both the hamburger toggle and the inline nav (CSS decides which shows)', async () => {
  const fixture = TestBed.createComponent(AppHeaderComponent);
  fixture.detectChanges();
  expect(
    fixture.nativeElement.querySelector('[data-testid="header-nav-toggle"]'),
  ).not.toBeNull();
  expect(fixture.nativeElement.querySelector('[data-testid="header-nav"]')).not.toBeNull();
});

it('labels the hamburger for assistive technology', async () => {
  const fixture = TestBed.createComponent(AppHeaderComponent);
  fixture.detectChanges();
  const toggle: HTMLElement = fixture.nativeElement.querySelector(
    '[data-testid="header-nav-toggle"]',
  );
  expect(toggle.getAttribute('aria-label')).toBe('Open navigation menu');
});
```

Both toggle and nav are always in the DOM — visibility is a Tailwind `md:` concern, so jsdom cannot judge it. Breakpoint behaviour is proven by the Playwright specs in Step 1, which run in a real browser at real widths. Do not try to assert `hidden`/`md:flex` classes in a unit test; that asserts the implementation, not the behaviour.

- [x] **Step 5: Run everything**

Run: `pnpm exec nx test web`
Expected: PASS.

Run: `pnpm exec nx typecheck web`
Expected: PASS.

Run: `pnpm exec nx run web-e2e:responsive -- header.responsive`
Expected: PASS — all five header specs.

Run: `pnpm exec nx run web-e2e:responsive`
Expected: the overflow sweep's 320 px header failures are **gone**. Other routes may still fail on their own content; that is Task 6. Record the remaining failure list.

Run: `pnpm exec nx run web-e2e:a11y`
Expected: PASS. This is the gate most at risk from this task — if the sheet traps focus badly or the hamburger lacks a name, it fails here.

- [x] **Step 6: Commit**

```bash
git add apps/web/src/app/shell/app-header.component.ts \
        apps/web/src/app/shell/app-header.component.html \
        apps/web/src/app/shell/app-header.component.spec.ts \
        apps/web-e2e/src/responsive/header.responsive.spec.ts
git commit -m "feat(web): collapse the header to a hamburger sheet below md"
```

---

### Task 5: Give the two bare tables an overflow container

**Files:**
- Modify: `libs/web-courses/src/lib/course-students-page/course-students-page.component.html:38`
- Modify: `libs/web-courses/src/lib/course-analytics-page/course-analytics-page.component.html:51`

**Interfaces:**
- Consumes: the responsive sweep from Task 2.
- Produces: nothing other tasks depend on.

Both are `<table class="w-full ...">` directly inside an `hlm-card` with no wrapper, so at 320 px the page body scrolls instead of the table.

- [x] **Step 1: Confirm the sweep currently fails on these routes**

Run: `pnpm exec nx run web-e2e:responsive -- overflow.responsive`

Expected: the `student roster (/courses/c-1/students)` and `course analytics (/courses/c-1/analytics)` cases fail at 320 px. If they do **not**, stop: either the fixtures render an empty state (the roster shows "No students enrolled yet." when `rows()` is empty, which has no table at all), or the tables already fit. Check the fixture data in `_helpers/route-inventory.ts` before adding a fix for a problem that is not there.

- [x] **Step 2: Wrap the roster table**

In `course-students-page.component.html`, wrap the `<table>` — keeping every column. Dropping columns at narrow widths loses data; a scrollable table is the honest tradeoff.

```html
<hlm-card>
  <div class="overflow-x-auto">
    <table class="w-full text-left text-sm">
      <!-- ...unchanged... -->
    </table>
  </div>
</hlm-card>
```

- [x] **Step 3: Wrap the analytics table**

In `course-analytics-page.component.html`, apply the same wrapper around the `<table class="mt-2 w-full text-left text-sm">`. Move the `mt-2` onto the wrapping `div` so the spacing still applies outside the scroll container:

```html
<div class="mt-2 overflow-x-auto">
  <table class="w-full text-left text-sm">
    <!-- ...unchanged... -->
  </table>
</div>
```

- [x] **Step 4: Verify**

Run: `pnpm exec nx run web-e2e:responsive -- overflow.responsive`
Expected: both routes now PASS at every width.

Run: `pnpm exec nx test web-courses`
Expected: PASS. If a test asserts on the DOM path from `hlm-card` to `table`, the new `div` breaks it — update the selector, not the markup.

Run: `pnpm exec nx run web-e2e:a11y`
Expected: PASS. A scrollable region can need a keyboard-reachable affordance; if axe flags it, give the wrapper `tabindex="0"` and an `aria-label` rather than removing the wrapper.

- [x] **Step 5: Commit**

```bash
git add libs/web-courses/src/lib/course-students-page/course-students-page.component.html \
        libs/web-courses/src/lib/course-analytics-page/course-analytics-page.component.html
git commit -m "fix(web-courses): scroll the roster and analytics tables inside their own container"
```

---

### Task 6: Fix the remaining sweep failures

This task has no pre-written fix list on purpose. Tasks 4 and 5 address the defects that were identifiable by reading the code; this one addresses whatever the sweep actually found. The US-09-03 slice found two defects nobody predicted, which is why the fix list is not guessed in advance.

**Files:** determined by the sweep output. Likely candidates given near-zero breakpoint counts: `libs/web-auth`, `libs/web-profile`, `libs/web-enrollment`, `libs/web-admin`, `libs/web-catalog`.

**Interfaces:**
- Consumes: the failure list recorded in Task 2 Step 4, minus what Tasks 4 and 5 fixed.
- Produces: a green `nx run web-e2e:responsive`.

- [x] **Step 1: Get the current failure list**

Run: `pnpm exec nx run web-e2e:responsive`

Write down every remaining `route @ width` and its overflow in px. If the list is empty, skip to Step 5 and commit nothing — that is a legitimate outcome and better than inventing work.

- [x] **Step 2: For each failing route, find the overflowing element**

Do not guess from reading the template. Run the app and measure. With `pnpm start:web` running, open the failing route at 320 px in the browser and evaluate:

```js
// Every element wider than the viewport, innermost first — the last entries
// are the actual culprits; ancestors are just inheriting the width.
[...document.querySelectorAll('*')]
  .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth)
  .map((el) => ({
    tag: el.tagName,
    cls: el.className,
    right: Math.round(el.getBoundingClientRect().right),
  }));
```

- [x] **Step 3: Apply the narrowest fix that holds**

In order of preference:

1. **A fixed width or `min-w` that should be fluid** → make it `w-full` with a `max-w-*` cap.
2. **A multi-column grid or flex row that should stack** → add the `md:` prefix so it is single-column below the breakpoint (e.g. `grid-cols-1 md:grid-cols-3`).
3. **A long unbreakable string** (an email, a URL, an ID) → `break-words` or `truncate` with a `title` attribute so the full value stays available.
4. **A genuinely wide element** (a table, a code block, a chart) → wrap in `overflow-x-auto`, as Task 5 does.

Do not fix an overflow by setting `overflow-x: hidden` on the body or a page container. That makes the test pass while making the content unreachable — a worse outcome than the scroll bar, and invisible to the gate afterwards.

- [x] **Step 4: Re-run after each route's fix**

Run: `pnpm exec nx run web-e2e:responsive`

Fix one route at a time and re-run. Commit per route or per small group, so a bad fix is easy to isolate.

- [x] **Step 5: Full verification**

Run: `pnpm exec nx run web-e2e:responsive`
Expected: PASS, all routes, all four widths.

Run: `pnpm exec nx run web-e2e:a11y`
Expected: PASS.

Run: `pnpm exec nx run-many -t test lint typecheck`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
# Add each modified template explicitly — never `git add -A`, the worktree's
# node_modules symlink evades .gitignore.
git add <each modified file>
git commit -m "fix(web): resolve horizontal overflow at 320px on <routes>"
```

---

### Task 7: Manual verification at 320 px

The gate proves no horizontal scroll. It does not prove the page is usable. This step is what the spec's §4.5 promises, and its findings are recorded honestly whether or not they get fixed in this slice.

**Files:**
- Create: `docs/superpowers/plans/2026-08-07-us-09-05-manual-verification.md`

- [x] **Step 1: Walk the core journeys at 320 px**

With `pnpm emulators` and `pnpm start` running, open the app in a browser at a 320 px viewport (device emulation, iPhone SE profile) and walk:

1. Land → browse catalogue → open a course → register → verify → sign in.
2. Signed in as a student: enrol → Start Learning → play a lesson → open the outline drawer → mark complete.
3. Signed in as an instructor: course editor → add a module and a lesson → open the roster and the analytics tables.
4. Signed in as an admin: each of the four admin pages, and the hamburger sheet with all seven links.

- [x] **Step 2: Check the player specifically**

US-09-05's touch criterion is met by native `<video controls>` (spec §6). Confirm on a real touch device or emulation that the scrubber is draggable, tap-to-play works, and fullscreen engages. Note anything that does not.

- [x] **Step 3: Note touch-target sizes**

WCAG 2.5.5 (44×44 px) is Level AAA and deliberately outside the AA gate, so this is observation, not a gate. Note any control that is uncomfortably small — the hamburger, the theme toggle, the avatar, table sort buttons, player controls.

- [x] **Step 4: Write it down**

Record findings in `docs/superpowers/plans/2026-08-07-us-09-05-manual-verification.md`: what was walked, what passed, what is ugly-but-passing, and anything deferred with a reason. "Ugly but passing" entries are real findings — write them down rather than quietly deciding they do not count.

- [x] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-08-07-us-09-05-manual-verification.md
git commit -m "docs: manual 320px verification record for US-09-05"
```

---

### Task 8: Amend the epic, wire CI, update the docs

Last, so `main` never carries a red gate.

**Files:**
- Modify: `docs/epics/09-non-functional-requirements.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `docs/USER_GUIDE.md`
- Modify: `docs/development.md`

- [x] **Step 1: Amend the gesture acceptance criterion**

In `docs/epics/09-non-functional-requirements.md`, under US-09-05, replace:

```markdown
- The video player is touch-friendly and supports swipe-to-seek and pinch-to-zoom on mobile devices.
```

with:

```markdown
- The video player is touch-friendly on mobile devices. **Amended 2026-08-07:** this is satisfied by the native `<video controls>` player, which provides a touch scrubber, tap-to-play, and fullscreen with pinch-zoom on iOS and Android. Custom swipe-to-seek and pinch-to-zoom handlers were considered and declined: layering custom gestures over the native controls would forfeit the keyboard operability and screen-reader labelling those controls provide for free, putting the WCAG 2.1 AA gate landed in US-09-03 at risk. See `docs/superpowers/specs/2026-08-07-us-09-05-mobile-responsiveness-design.md` §6.
```

Preserve the file's `> [!NOTE] DOCUMENT STATUS: DRAFT` banner.

- [x] **Step 2: Add the CI job**

In `.github/workflows/ci.yml`, add after the `a11y` job (clone its shape — same runner, same setup steps, same 10-minute timeout):

```yaml
  # Hermetic responsive gate (US-09-05): asserts no horizontal overflow at
  # 320/768/1280/2560px across the shared route inventory, plus the header's
  # hamburger collapse below md. Driven by its own
  # apps/web-e2e/playwright.responsive.config.ts. Like the a11y job it starts
  # only the Angular dev server and stubs every /api call, so it needs
  # neither the Firebase emulators nor the api, and runs in parallel with the
  # emulator-backed jobs rather than gating them.
  #
  # What this gate does NOT prove: "no horizontal overflow" is not "renders
  # correctly". A page can pass here and still be cramped or awkward to use
  # on a phone. Touch-target sizing and general visual sanity are verified
  # manually — see docs/superpowers/plans/2026-08-07-us-09-05-manual-verification.md.
  responsive:
    name: Responsive gate (320px–2560px)
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up pnpm
        uses: pnpm/action-setup@v4

      - name: Set up Node 22
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Playwright browser
        run: pnpm exec playwright install --with-deps chromium

      - name: Run responsive sweep
        run: pnpm exec nx run web-e2e:responsive
```

- [x] **Step 3: Update `README.md`**

Add a bullet to the project-status block, next to the existing EP-09 US-09-03 entry:

```markdown
> - **EP-09 US-09-05 Mobile responsiveness** — the app header collapses to a hamburger + slide-out sheet below `md` (768 px), carrying the nav links and the search bar; the theme toggle and avatar stay in the bar. Every route is swept for horizontal overflow at 320 / 768 / 1280 / 2560 px on each CI run (`nx run web-e2e:responsive`), gated at zero with no allowlist, sharing the route inventory with the accessibility sweep. Honest scope: the gate proves no horizontal scrolling, which is not the same as "renders correctly" — touch-target sizing and visual sanity were verified manually at 320 px, not gated. The swipe-to-seek / pinch-to-zoom criterion is met by the native player's own touch affordances rather than custom gesture handlers (the epic AC is amended to say so); building a custom gesture layer would have put the WCAG 2.1 AA gate at risk. US-09-01 (performance) and US-09-04 (self-hosting) remain open.
```

Also update the `libs`/layout notes if the header extraction warrants a mention under `apps/web`.

- [x] **Step 4: Update `docs/USER_GUIDE.md` and `docs/development.md`**

`USER_GUIDE.md` is the authoritative feature matrix — add the mobile-header behaviour. `development.md` documents the scripts — add `nx run web-e2e:responsive` alongside the existing `nx run web-e2e:a11y` entry, noting it needs neither the emulators nor the api.

- [x] **Step 5: Full verification before merge**

```bash
pnpm exec nx run-many -t lint test build typecheck
pnpm exec nx run web-e2e:a11y
pnpm exec nx run web-e2e:responsive
```

Expected: all PASS. Report the real output — if something fails, say so with the output rather than reporting the slice complete.

- [x] **Step 6: Commit**

```bash
git add docs/epics/09-non-functional-requirements.md \
        .github/workflows/ci.yml \
        README.md \
        docs/USER_GUIDE.md \
        docs/development.md
git commit -m "ci: gate on the 320-2560px responsive sweep; docs for US-09-05"
```

- [ ] **Step 7: Land the branch**

Follow the worktree merge guard: **never chain commit + merge + worktree-remove in one command.** Check status first, merge from the `main` checkout, verify, then remove the worktree.

```bash
# From the main checkout, not the worktree:
git merge --no-ff feat/us-09-05-mobile-responsive -m "Merge feat/us-09-05-mobile-responsive: responsive gate + header collapse"
```

Then verify `main` is green before removing the worktree with `git worktree remove`.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
| :--- | :--- |
| §4.1 Reuse route inventory + rename | Task 1 |
| §4.2 Overflow assertion, 4 widths | Task 2 |
| §4.3 Header specs | Task 4 Step 1 |
| §4.4 Config, target, CI wiring | Task 2 (config + target), Task 8 (CI) |
| §4.5 Honest limits recorded | Task 7, Task 8 Steps 2–3 |
| §5.1 Header collapse | Tasks 3 + 4 |
| §5.2 Table overflow containers | Task 5 |
| §5.3 Learn page (verify only, no pre-declared change) | Task 2 Step 4 / Task 6 |
| §5.4 Everything else decided by the gate | Task 6 |
| §6 Epic amendment | Task 8 Step 1 |
| §7 Testing (red-first, a11y stays green, unit tests) | Tasks 2, 3, 4 |
| §8 Scope cuts | Task 7 Step 3, Task 8 Step 1 |
| §9 Risks | Task 1 Steps 1/6, Task 3 Step 7 |

No gaps.

**Known soft spots** — places where the plan tells the implementer to verify rather than handing them the answer, because the answer depends on runtime behaviour I did not execute:

1. **Task 4 Step 3, `aria-expanded` and focus return.** Whether spartan's `hlmSheetTrigger` / `BrnSheetContent` already manage these is unverified — I read the exports and the showcase usage, not the brain-layer source. The plan makes both assertions in the Playwright spec first, so the implementer finds out by running the test rather than by trusting me.
2. **Task 3 Step 1, the header spec's TestBed setup.** The existing setup in `app.spec.ts` was seen only via `grep`, not read in full, so the plan instructs mirroring it rather than reproducing it verbatim — a fabricated setup block would have been worse than an explicit instruction to go look.
3. **Task 5 Step 1** guards against the roster fixture rendering the empty state (which has no table), in which case the fix would address a defect that is not there.
4. **Task 6** has no pre-written fix list by design. It is the largest unknown in the plan and the one most likely to change its size once Task 2 goes red.
