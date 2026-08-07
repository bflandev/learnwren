# US-09-03 Accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sweep every Learn Wren UI surface with axe-core for WCAG 2.1 AA violations, fix all of them, verify four keyboard-only user journeys, and gate CI at zero violations.

**Architecture:** A new **hermetic** Playwright suite in `apps/web-e2e` running under its own config, so it needs only the Angular dev server — no Firebase emulators, no API build. Authentication and all page data are supplied by `page.route` stubs (the pattern six existing specs already use). Two tiers: `/showcase` renders every design-system primitive on one page, so component-level fixes land once in `web-ui` / `web-design-system`; the route sweep then catches only composition-level issues.

**Tech Stack:** Playwright, `@axe-core/playwright`, Angular 21, Nx.

## Spec deviation (deliberate, and an improvement)

The design spec (§3) assumed the sweep would ride the existing emulator harness. **It does not.** Investigation found `authGuard` (`libs/web-auth/src/lib/auth.guard.ts`) and `adminRoleGuard` (`libs/web-admin/src/lib/admin-role.guard.ts`) both gate solely on `AuthService.refresh()`, which is a single `GET /api/auth/me`. Stubbing that one endpoint satisfies every guarded route at any role.

Going hermetic means the a11y gate:

- needs no Firebase emulators and no `api:build`, so it runs standalone and fast in CI;
- renders **populated** fixture data rather than empty states, which is where violations actually live;
- is deterministic — no seeded-data drift between runs.

Everything else in the spec stands unchanged.

## Global Constraints

- **axe tags:** exactly `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`. Never include `best-practice`.
- **Gate:** zero violations. No allowlist file. A genuine false positive gets a scoped `.disableRules([...])` at the single call site with a comment naming why.
- **Keyboard specs:** may use only `keyboard.press` / `press`. No `click()`, no `fill()`, no `focus()`.
- **Branch:** git worktree created from local `HEAD`; land via local `--no-ff` merge to `main`. Symlink `node_modules` to the parent. Add files explicitly — never `git add -A` (the symlink evades `.gitignore`).
- **Commit format:** `<type>: <description>` — `feat`, `fix`, `test`, `docs`, `chore`, `refactor`.
- **Never edit** `apps/web-e2e/playwright.config.ts`. The a11y suite gets its own config.
- **Test IDs:** existing specs use `getByTestId`. Never remove or rename an existing `data-testid` while fixing a violation — 18 specs depend on them.
- **Fixtures are DRY:** every test fixture constant (`NOW`, `CATEGORIES`, `COURSE_CARD`, `COURSE_DETAIL`, `COURSE_TREE`, `LESSON_PAYLOAD`) is declared **once**, exported from `apps/web-e2e/src/_helpers/a11y-routes.ts`, and imported everywhere else. Never re-declare a fixture inline in a spec file.

---

## File Structure

**Create:**

| File | Responsibility |
| :--- | :--- |
| `apps/web-e2e/playwright.a11y.config.ts` | Standalone config: web dev server only, no api, `testMatch` limited to a11y specs |
| `apps/web-e2e/src/_helpers/a11y-scan.ts` | The single place AA tags are configured; runs axe and formats violations |
| `apps/web-e2e/src/_helpers/a11y-stubs.ts` | `stubAuth()` + `stubJson()` — role and page-data stubbing |
| `apps/web-e2e/src/_helpers/a11y-routes.ts` | The route inventory table with per-route stubs |
| `apps/web-e2e/src/a11y/showcase.a11y.spec.ts` | Tier 1 — design-system components |
| `apps/web-e2e/src/a11y/routes.a11y.spec.ts` | Tier 2 — every real surface |
| `apps/web-e2e/src/a11y/keyboard.a11y.spec.ts` | Four keyboard-only journeys |

**Modify:**

- `apps/web-e2e/project.json` — add the `a11y` target
- `package.json` — add `@axe-core/playwright` dev dependency, add `a11y` script
- `.github/workflows/ci.yml` — run the a11y target
- `README.md`, `docs/USER_GUIDE.md` — record the slice
- Component files under `libs/web-ui`, `libs/web-design-system`, and feature libs — the actual fixes

---

## Task 1: Walking skeleton — axe harness, stubs, and the `a11y` target

Prove the whole gate works end to end on a single page before scaling it to 20.

**Files:**
- Create: `apps/web-e2e/playwright.a11y.config.ts`
- Create: `apps/web-e2e/src/_helpers/a11y-scan.ts`
- Create: `apps/web-e2e/src/_helpers/a11y-stubs.ts`
- Create: `apps/web-e2e/src/a11y/routes.a11y.spec.ts` (one route only for now)
- Modify: `apps/web-e2e/project.json`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `scanA11y(page: Page, options?: { include?: string; disableRules?: string[] }): Promise<void>` — runs axe at AA tags and asserts zero violations, throwing a formatted report on failure.
  - `stubAuth(page: Page, role: 'guest' | 'student' | 'instructor' | 'admin'): Promise<void>`
  - `stubJson(page: Page, urlGlob: string, body: unknown, status?: number): Promise<void>`

- [ ] **Step 1: Install the dependency**

```bash
pnpm add -D -w @axe-core/playwright
```

- [ ] **Step 2: Create the axe wrapper**

Create `apps/web-e2e/src/_helpers/a11y-scan.ts`:

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * The WCAG 2.1 Level AA rule set — the exact conformance target named by
 * US-09-03. `best-practice` is deliberately excluded: it ships opinions
 * rather than conformance requirements, and would dilute a gate that is
 * only credible if every entry in it is genuinely mandatory.
 */
const AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export interface ScanOptions {
  /** CSS selector to limit the scan to a subtree. */
  include?: string;
  /**
   * Rules to switch off for this call only. Every use MUST carry a comment
   * naming why the finding is a false positive. There is no allowlist file.
   */
  disableRules?: string[];
}

/** Run axe against the current page state and assert zero AA violations. */
export async function scanA11y(page: Page, options: ScanOptions = {}): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags(AA_TAGS);
  if (options.include) builder = builder.include(options.include);
  if (options.disableRules?.length) builder = builder.disableRules(options.disableRules);

  const results = await builder.analyze();

  expect(results.violations, formatViolations(results.violations)).toEqual([]);
}

/** Render violations as an actionable report — rule, impact, help URL, nodes. */
function formatViolations(
  violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations'],
): string {
  if (violations.length === 0) return 'no violations';
  return violations
    .map((v) => {
      const nodes = v.nodes.map((n) => `      - ${n.target.join(' ')}`).join('\n');
      return [
        `  [${v.impact ?? 'unknown'}] ${v.id}: ${v.help}`,
        `    ${v.helpUrl}`,
        nodes,
      ].join('\n');
    })
    .join('\n\n');
}
```

- [ ] **Step 3: Create the stub helpers**

Create `apps/web-e2e/src/_helpers/a11y-stubs.ts`:

```ts
import type { Page } from '@playwright/test';

export type A11yRole = 'guest' | 'student' | 'instructor' | 'admin';

/**
 * Both authGuard (libs/web-auth/src/lib/auth.guard.ts) and adminRoleGuard
 * (libs/web-admin/src/lib/admin-role.guard.ts) gate solely on
 * AuthService.refresh(), which is one GET /api/auth/me. Stubbing that single
 * endpoint therefore satisfies every guarded route at any role — no
 * emulators, no real session cookie.
 */
const USERS: Record<Exclude<A11yRole, 'guest'>, Record<string, unknown>> = {
  student: {
    uid: 'a11y-student',
    email: 'student@example.com',
    displayName: 'Sam Student',
    role: 'STUDENT',
    emailVerified: true,
  },
  instructor: {
    uid: 'a11y-instructor',
    email: 'instructor@example.com',
    displayName: 'Ingrid Instructor',
    role: 'INSTRUCTOR',
    emailVerified: true,
  },
  admin: {
    uid: 'a11y-admin',
    email: 'admin@example.com',
    displayName: 'Ada Admin',
    role: 'ADMIN',
    emailVerified: true,
  },
};

/** Stub GET /api/auth/me for the given role. `guest` returns 401. */
export async function stubAuth(page: Page, role: A11yRole): Promise<void> {
  await page.route('**/api/auth/me', (route) => {
    if (role === 'guest') {
      void route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'UNAUTHENTICATED' }),
      });
      return;
    }
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(USERS[role]),
    });
  });
}

/** Fulfil a URL glob with a JSON body. */
export async function stubJson(
  page: Page,
  urlGlob: string,
  body: unknown,
  status = 200,
): Promise<void> {
  await page.route(urlGlob, (route) => {
    void route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}
```

> **Playwright gotcha, load-bearing:** route handlers match in **reverse registration order**. Register broad globs FIRST and specific paths LAST, or the glob shadows the specific route. `admin-users.spec.ts:54` documents this same trap.

- [ ] **Step 4: Create the standalone config**

Create `apps/web-e2e/playwright.a11y.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

/**
 * Standalone config for the accessibility suite.
 *
 * Unlike playwright.config.ts, this starts ONLY the Angular dev server: the
 * a11y specs are hermetic (every /api call is stubbed via page.route), so
 * they need neither the NestJS api nor the Firebase emulators. That keeps
 * the CI gate fast and free of seeded-data flake.
 */
const webPort = process.env['WEB_PORT'] || '4200';
const baseURL = process.env['BASE_URL'] || `http://localhost:${webPort}`;

export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src/a11y' }),
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
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 5: Add the Nx target**

`nx.json:81-84` infers the `e2e` target from `playwright.config.ts` only, so the a11y config needs an explicit target. Modify `apps/web-e2e/project.json` — replace the `targets` block with:

```json
  "targets": {
    "e2e": {
      "dependsOn": ["api:build"]
    },
    "a11y": {
      "executor": "@nx/playwright:playwright",
      "options": {
        "config": "apps/web-e2e/playwright.a11y.config.ts"
      }
    }
  }
```

Add to `package.json` scripts (alongside the existing `"e2e"` at line 19):

```json
    "a11y": "nx run web-e2e:a11y",
```

- [ ] **Step 6: Write the walking-skeleton spec**

Create `apps/web-e2e/src/a11y/routes.a11y.spec.ts`:

```ts
import { test } from '@playwright/test';

import { scanA11y } from '../_helpers/a11y-scan';
import { stubAuth } from '../_helpers/a11y-stubs';

test('/login has no WCAG 2.1 AA violations', async ({ page }) => {
  await stubAuth(page, 'guest');
  await page.goto('/login');
  await page.getByRole('heading').first().waitFor();
  await scanA11y(page);
});
```

- [ ] **Step 7: Run it**

```bash
pnpm nx run web-e2e:a11y
```

Expected: the suite runs, starting only the web dev server. It either PASSES (login is clean) or FAILS with a formatted violation report. **Either outcome proves the harness works** — a crash, a missing-module error, or the api being started does not.

- [ ] **Step 8: Fix any violations found on `/login`**

Apply the recipes in the Appendix. Re-run Step 7 until green.

- [ ] **Step 9: Lint and commit**

```bash
pnpm nx run web-e2e:lint
git add apps/web-e2e/playwright.a11y.config.ts apps/web-e2e/src/_helpers/a11y-scan.ts apps/web-e2e/src/_helpers/a11y-stubs.ts apps/web-e2e/src/a11y/routes.a11y.spec.ts apps/web-e2e/project.json package.json pnpm-lock.yaml
git commit -m "test(web-e2e): axe-core a11y harness with standalone hermetic config"
```

---

## Task 2: Tier 1 — the design-system showcase sweep

`/showcase` (`apps/web/src/app/showcase/hlm-showcase.component.html`) renders every hlm primitive on one page. Fixes here land in the shared libs and vanish from every consuming surface at once. **This task must reach zero before Task 3 is triaged**, or the same missing label gets counted and hand-fixed on a dozen routes.

**Files:**
- Create: `apps/web-e2e/src/a11y/showcase.a11y.spec.ts`
- Modify: components under `libs/web-ui/src`, `libs/web-design-system/src` (whatever the sweep finds)

**Interfaces:**
- Consumes: `scanA11y` from Task 1.

- [ ] **Step 1: Write the sweep spec**

Create `apps/web-e2e/src/a11y/showcase.a11y.spec.ts`:

```ts
import { test } from '@playwright/test';

import { scanA11y } from '../_helpers/a11y-scan';

/**
 * Tier 1 — the design-system sweep.
 *
 * /showcase is a dev-only, guard-free route that renders every hlm primitive
 * on one page. A violation caught here is fixed once in web-ui /
 * web-design-system and disappears across every consuming surface, so this
 * spec must be green before the per-route sweep is triaged.
 */
test('the design-system showcase has no WCAG 2.1 AA violations', async ({ page }) => {
  await page.goto('/showcase');
  await page.getByRole('heading').first().waitFor();
  await scanA11y(page);
});
```

- [ ] **Step 2: Run it and capture the report**

```bash
pnpm nx run web-e2e:a11y -- --grep showcase
```

Expected on first run: FAIL, with a violation list. Read the whole report before fixing anything — group by rule id, because one rule typically maps to one shared component and therefore one fix.

- [ ] **Step 3: Fix violations in the shared libs**

Apply the Appendix recipes. Fix in `libs/web-ui/src` / `libs/web-design-system/src`, **not** in `hlm-showcase.component.html` — patching the showcase hides the defect from the routes that use the component.

If `color-contrast` fires on a `--lw-*` token: **stop and report it before changing the token.** The token value is the visual design the Robin port just landed; changing it shifts the design. Per spec §8, fix the token rather than exempt the rule, but surface the change for review first.

- [ ] **Step 4: Re-run until green**

```bash
pnpm nx run web-e2e:a11y -- --grep showcase
```
Expected: PASS.

- [ ] **Step 5: Verify no collateral damage**

Shared-component markup changes can break selectors in the 18 existing specs and the `web-ui` component tests.

```bash
pnpm nx affected -t lint test typecheck
```
Expected: all PASS. Fix any broken selector by updating the *test*, never by reverting the a11y fix — unless the fix removed a `data-testid`, which is forbidden by the Global Constraints.

- [ ] **Step 6: Mutation round if logic changed**

If any fix changed component **logic** (a computed, a signal, a conditional) rather than only markup, run the scoped Stryker round for that lib per the repo's 100% standard. Markup-only edits need no mutation run.

```bash
pnpm nx run web-ui:mutation
```

- [ ] **Step 7: Commit**

```bash
git add apps/web-e2e/src/a11y/showcase.a11y.spec.ts libs/web-ui libs/web-design-system
git commit -m "fix(web-ui): resolve WCAG 2.1 AA violations in design-system primitives"
```

---

## Task 3: Tier 2 — the route inventory and the guest sweep

**Files:**
- Create: `apps/web-e2e/src/_helpers/a11y-routes.ts`
- Modify: `apps/web-e2e/src/a11y/routes.a11y.spec.ts` (replace the Task 1 skeleton)

**Interfaces:**
- Consumes: `scanA11y`, `stubAuth`, `stubJson` from Task 1.
- Produces: `A11yRoute` interface and `GUEST_ROUTES` / `AUTHED_ROUTES` arrays consumed by Task 4.

- [ ] **Step 1: Create the route table**

Create `apps/web-e2e/src/_helpers/a11y-routes.ts`. Paths are verified against `apps/web/src/app/app.routes.ts` and the six lib route files:

```ts
import type { Page } from '@playwright/test';

import { stubJson, type A11yRole } from './a11y-stubs';

export interface A11yRoute {
  /** Human label used as the test title. */
  name: string;
  /** Path to navigate to. */
  path: string;
  /** Role to stub for GET /api/auth/me. */
  role: A11yRole;
  /** Stub the page's data calls. Register broad globs BEFORE specific paths. */
  stubs?: (page: Page) => Promise<void>;
  /** A selector that must be visible before scanning, so axe sees settled DOM. */
  readySelector?: string;
}

export const NOW = '2026-08-01T00:00:00.000Z';

export const CATEGORIES = [
  { id: 'design', name: 'Design' },
  { id: 'engineering', name: 'Engineering' },
];

export const COURSE_CARD = {
  id: 'c-1',
  title: 'Introduction to Wren',
  description: 'A short course used by the accessibility sweep.',
  category: 'engineering',
  difficulty: 'BEGINNER',
  instructorName: 'Ingrid Instructor',
  enrollmentCount: 12,
  coverImageUrl: null,
  publishedAt: NOW,
};

export const CATALOG_LIST = { courses: [COURSE_CARD], total: 1, page: 1, pageSize: 12 };

export const COURSE_DETAIL = {
  ...COURSE_CARD,
  instructorId: 'a11y-instructor',
  instructorBiography: 'Teaches things.',
  moduleCount: 1,
  lessonCount: 2,
  status: 'PUBLISHED',
};

export const GUEST_ROUTES: A11yRoute[] = [
  { name: 'landing', path: '/', role: 'guest' },
  { name: 'login', path: '/login', role: 'guest' },
  { name: 'register', path: '/register', role: 'guest' },
  { name: 'register confirm', path: '/register/confirm', role: 'guest' },
  { name: 'forgot password', path: '/forgot-password', role: 'guest' },
  { name: 'unlock', path: '/auth/unlock', role: 'guest' },
  {
    name: 'catalogue',
    path: '/catalog',
    role: 'guest',
    stubs: async (page) => {
      await stubJson(page, '**/api/categories', CATEGORIES);
      await stubJson(page, '**/api/catalog**', CATALOG_LIST);
    },
  },
  {
    name: 'search results',
    path: '/search?q=wren',
    role: 'guest',
    stubs: async (page) => {
      await stubJson(page, '**/api/catalog/search**', CATALOG_LIST);
    },
  },
  {
    name: 'course detail',
    path: '/catalog/c-1',
    role: 'guest',
    stubs: async (page) => {
      // Broad glob first, specific path last — handlers match in REVERSE order.
      await stubJson(page, '**/api/catalog**', CATALOG_LIST);
      await stubJson(page, '**/api/catalog/c-1', COURSE_DETAIL);
    },
  },
];
```

- [ ] **Step 2: Replace the skeleton spec with the table-driven sweep**

Overwrite `apps/web-e2e/src/a11y/routes.a11y.spec.ts`:

```ts
import { test } from '@playwright/test';

import { scanA11y } from '../_helpers/a11y-scan';
import { stubAuth } from '../_helpers/a11y-stubs';
import { GUEST_ROUTES, type A11yRoute } from '../_helpers/a11y-routes';

function register(route: A11yRoute): void {
  test(`${route.name} (${route.path}) has no WCAG 2.1 AA violations`, async ({ page }) => {
    await stubAuth(page, route.role);
    await route.stubs?.(page);
    await page.goto(route.path);
    // Wait for settled DOM so axe does not scan a loading skeleton.
    await page.waitForSelector(route.readySelector ?? 'h1, h2, [role="heading"]');
    await scanA11y(page);
  });
}

GUEST_ROUTES.forEach(register);
```

- [ ] **Step 3: Run the guest sweep**

```bash
pnpm nx run web-e2e:a11y -- --grep-invert showcase
```
Expected: 9 tests run. Some will FAIL with violation reports.

- [ ] **Step 4: Fix the violations**

Apply the Appendix recipes. These are composition-level surfaces, so expect heading-order, landmark, and form-label findings rather than component defects (Task 2 already cleared those).

- [ ] **Step 5: Re-run until green, then check for collateral damage**

```bash
pnpm nx run web-e2e:a11y
pnpm nx affected -t lint test typecheck
```
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web-e2e/src/_helpers/a11y-routes.ts apps/web-e2e/src/a11y/routes.a11y.spec.ts libs apps/web/src
git commit -m "fix(web): resolve WCAG 2.1 AA violations on public routes"
```

---

## Task 4: Tier 2 — the authenticated route sweep

**Files:**
- Modify: `apps/web-e2e/src/_helpers/a11y-routes.ts` (add `AUTHED_ROUTES`)
- Modify: `apps/web-e2e/src/a11y/routes.a11y.spec.ts` (register the new table)

**Interfaces:**
- Consumes: `A11yRoute`, `register` pattern, `stubJson` from Task 3.
- Produces: `AUTHED_ROUTES: A11yRoute[]`.

- [ ] **Step 1: Append the authed table**

Add to `apps/web-e2e/src/_helpers/a11y-routes.ts`. Endpoint paths are verified against the web libs' HTTP calls:

```ts
export const PROFILE = {
  uid: 'a11y-student',
  email: 'student@example.com',
  displayName: 'Sam Student',
  biography: 'Learning things.',
  photoUrl: null,
  role: 'STUDENT',
  completedCourses: [],
};

export const LESSON_PAYLOAD = {
  courseId: 'c-1',
  courseTitle: 'Introduction to Wren',
  lessonId: 'l-1',
  lessonTitle: 'Getting started',
  videoId: null,
  videoState: 'READY',
  completedAt: null,
  lastPositionSec: 0,
  materials: [],
  outline: [
    {
      moduleId: 'm-1',
      title: 'Module 1',
      order: 0,
      lessons: [
        { lessonId: 'l-1', title: 'Getting started', order: 0, completedAt: null, videoState: 'READY' },
        { lessonId: 'l-2', title: 'Going further', order: 1, completedAt: NOW, videoState: 'PROCESSING' },
      ],
    },
  ],
};

export const COURSE_TREE = {
  id: 'c-1',
  title: 'Introduction to Wren',
  description: 'A short course used by the accessibility sweep.',
  category: 'engineering',
  difficulty: 'BEGINNER',
  status: 'DRAFT',
  coverImageUrl: null,
  modules: [
    {
      id: 'm-1',
      title: 'Module 1',
      order: 0,
      studentsNotifiedAt: null,
      lessons: [{ id: 'l-1', title: 'Getting started', order: 0, videoId: null }],
    },
  ],
};

export const AUTHED_ROUTES: A11yRoute[] = [
  {
    name: 'student dashboard',
    path: '/dashboard',
    role: 'student',
    stubs: async (page) => {
      await stubJson(page, '**/api/enrollments**', { enrollments: [] });
    },
  },
  {
    name: 'profile settings',
    path: '/settings/profile',
    role: 'student',
    stubs: async (page) => {
      await stubJson(page, '**/api/profile', PROFILE);
      await stubJson(page, '**/api/profile/instructor-application', {}, 404);
    },
  },
  {
    // Unguarded landing page hit after the user clicks the email-change link.
    name: 'email changed confirmation',
    path: '/settings/profile/email-changed',
    role: 'guest',
    stubs: async (page) => {
      await stubJson(page, '**/api/profile/email/confirm', { ok: true });
    },
  },
  {
    name: 'learn page',
    path: '/learn/c-1/l-1',
    role: 'student',
    stubs: async (page) => {
      await stubJson(page, '**/api/playback/config', { impl: 'fake' });
      await stubJson(page, '**/api/learn/courses/c-1/lessons/l-1', LESSON_PAYLOAD);
    },
  },
  {
    name: 'course list',
    path: '/courses',
    role: 'instructor',
    stubs: async (page) => {
      await stubJson(page, '**/api/courses', { courses: [COURSE_TREE] });
    },
  },
  {
    name: 'new course form',
    path: '/courses/new',
    role: 'instructor',
    stubs: async (page) => {
      await stubJson(page, '**/api/categories', CATEGORIES);
    },
  },
  {
    name: 'course editor',
    path: '/courses/c-1/edit',
    role: 'instructor',
    stubs: async (page) => {
      await stubJson(page, '**/api/categories', CATEGORIES);
      await stubJson(page, '**/api/courses/c-1/tree', COURSE_TREE);
      await stubJson(page, '**/api/courses/c-1/publish-eligibility', {
        eligible: false,
        reasons: [{ code: 'NO_READY_VIDEO', message: 'Add a lesson video.' }],
      });
    },
  },
  {
    name: 'student roster',
    path: '/courses/c-1/students',
    role: 'instructor',
    stubs: async (page) => {
      await stubJson(page, '**/api/courses/c-1/students', {
        students: [
          {
            uid: 'a11y-student',
            displayName: 'Sam Student',
            email: 'student@example.com',
            enrolledAt: NOW,
            completedLessons: 1,
            totalLessons: 2,
          },
        ],
      });
    },
  },
  {
    name: 'course analytics',
    path: '/courses/c-1/analytics',
    role: 'instructor',
    stubs: async (page) => {
      await stubJson(page, '**/api/courses/c-1/analytics', {
        enrolledTotal: 1,
        averageCompletionPct: 50,
        newEnrollments: { last7Days: 1, last30Days: 1, last90Days: 1 },
        lessons: [
          { lessonId: 'l-1', title: 'Getting started', completionRate: 0.5, averagePositionPct: 42 },
        ],
      });
    },
  },
  {
    name: 'admin instructor applications',
    path: '/admin/instructor-applications',
    role: 'admin',
    stubs: async (page) => {
      await stubJson(page, '**/api/admin/instructor-applications**', {
        applications: [
          {
            uid: 'a11y-applicant',
            displayName: 'Pat Applicant',
            email: 'pat@example.com',
            statement: 'I would like to teach.',
            expertise: 'Wren',
            submittedAt: NOW,
          },
        ],
      });
    },
  },
  {
    name: 'admin user directory',
    path: '/admin/users',
    role: 'admin',
    stubs: async (page) => {
      await stubJson(page, '**/api/admin/users**', {
        users: [
          {
            id: 'u1',
            displayName: 'Ada Lovelace',
            email: 'ada@example.com',
            role: 'STUDENT',
            status: 'ACTIVE',
            createdAt: NOW,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        capped: false,
      });
    },
  },
  {
    name: 'admin user detail',
    path: '/admin/users/u1',
    role: 'admin',
    stubs: async (page) => {
      // Broad glob FIRST, specific detail LAST (reverse-order matching).
      await stubJson(page, '**/api/admin/users**', {
        users: [], total: 0, page: 1, pageSize: 20, capped: false,
      });
      await stubJson(page, '**/api/admin/users/u1', {
        id: 'u1',
        displayName: 'Ada Lovelace',
        email: 'ada@example.com',
        biography: 'Mathematician',
        role: 'STUDENT',
        status: 'ACTIVE',
        createdAt: NOW,
        enrollments: [
          { courseId: 'c-1', courseTitle: 'Introduction to Wren', status: 'ACTIVE', enrolledAt: NOW },
        ],
        authoredCourses: [],
      });
    },
  },
  {
    name: 'admin categories',
    path: '/admin/categories',
    role: 'admin',
    stubs: async (page) => {
      await stubJson(page, '**/api/admin/categories**', { categories: CATEGORIES });
    },
  },
  {
    name: 'admin health',
    path: '/admin/health',
    role: 'admin',
    stubs: async (page) => {
      await stubJson(page, '**/api/admin/health', {
        services: [
          { name: 'API', status: 'UP', detail: null },
          { name: 'Database', status: 'UP', detail: null },
          { name: 'Transcoding queue', status: 'UP', detail: 'fake' },
          { name: 'Object storage', status: 'DOWN', detail: 'unreachable' },
        ],
        stats: { storageUsedBytes: 1024, storageQuotaBytes: null, registeredUsers: 3, publishedCourses: 1 },
        alerts: [{ code: 'TRANSCODE_BACKLOG', message: '12 jobs pending.' }],
      });
    },
  },
];
```

> The health fixture deliberately includes a `DOWN` row and an alert: status colours and alert banners are exactly where `color-contrast` and `role="alert"` findings hide, and an all-green fixture would never render them.

- [ ] **Step 2: Register the authed table plus the two extra states**

Edit `apps/web-e2e/src/a11y/routes.a11y.spec.ts`. **Amend the two existing import lines in place** — do not add new ones, or `no-duplicate-imports` will fail lint:

```ts
import { stubAuth, stubJson } from '../_helpers/a11y-stubs';
import { GUEST_ROUTES, AUTHED_ROUTES, type A11yRoute } from '../_helpers/a11y-routes';
```

Leave `register()` unchanged and register the second table:

```ts
GUEST_ROUTES.forEach(register);
AUTHED_ROUTES.forEach(register);
```

Then append the two second-state scans the spec requires (§4) to the same file:

```ts
/**
 * The learn page is scanned twice — the outline drawer is a distinct
 * interactive surface with its own focus-trap obligations, and it is not in
 * the DOM until opened.
 */
test('learn page with the outline drawer open has no WCAG 2.1 AA violations', async ({ page }) => {
  const route = AUTHED_ROUTES.find((r) => r.name === 'learn page');
  if (!route) throw new Error('learn page route missing from AUTHED_ROUTES');
  await stubAuth(page, route.role);
  await route.stubs?.(page);
  await page.goto(route.path);
  await page.getByRole('button', { name: /outline|contents|lessons/i }).first().click();
  await scanA11y(page);
});

/**
 * There is no separate lesson-editor route — lesson editing lives inside
 * /courses/:id/edit. The open edit panel carries the video upload, caption
 * upload, and materials controls: the densest interactive surface in the app.
 */
test('course editor with a lesson panel open has no WCAG 2.1 AA violations', async ({ page }) => {
  const route = AUTHED_ROUTES.find((r) => r.name === 'course editor');
  if (!route) throw new Error('course editor route missing from AUTHED_ROUTES');
  await stubAuth(page, route.role);
  await route.stubs?.(page);
  await stubJson(page, '**/api/courses/c-1/modules/m-1/lessons/l-1/materials', { materials: [] });
  await page.goto(route.path);
  await page.getByText('Getting started').first().click();
  await scanA11y(page);
});
```

> If the accessible names in those two `getByRole` / `getByText` calls do not match the real DOM, fix the **selector** to match what the app renders. Do not rename app controls to suit the test.

- [ ] **Step 3: Run the full sweep**

```bash
pnpm nx run web-e2e:a11y
```
Expected: ~24 tests. Triage every failure.

- [ ] **Step 4: Fix the violations**

Apply the Appendix recipes.

- [ ] **Step 5: Re-run until green and check collateral damage**

```bash
pnpm nx run web-e2e:a11y
pnpm nx affected -t lint test typecheck
```
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web-e2e/src libs apps/web/src
git commit -m "fix(web): resolve WCAG 2.1 AA violations on authenticated routes"
```

---

## Task 5: Keyboard journeys — sign in, and discover-and-enrol

axe proves elements *are* focusable; it cannot prove a journey *works*. These specs use only keys.

**Files:**
- Create: `apps/web-e2e/src/a11y/keyboard.a11y.spec.ts`

**Interfaces:**
- Consumes: `stubAuth`, `stubJson` from Task 1; fixtures from Task 3.
- Produces: `expectVisibleFocus(page): Promise<void>` (module-local; Task 6 appends to this same file).

- [ ] **Step 1: Write the focus-visibility helper and the first two journeys**

Create `apps/web-e2e/src/a11y/keyboard.a11y.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';

import { stubAuth, stubJson } from '../_helpers/a11y-stubs';

/**
 * Assert the focused element is a real control AND paints a visible focus
 * indicator. The Robin design-system port touched focus rings, and a control
 * that is focusable but shows no focus state passes every automated axe check
 * while failing WCAG SC 2.4.7.
 */
async function expectVisibleFocus(page: Page): Promise<void> {
  const active = page.locator(':focus-visible');
  await expect(active).toHaveCount(1);
  const hasIndicator = await active.evaluate((el) => {
    const s = getComputedStyle(el);
    const ring =
      (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) ||
      s.boxShadow !== 'none';
    return ring;
  });
  expect(hasIndicator, 'focused element paints no visible focus indicator').toBe(true);
}

/** Press Tab until the predicate matches the focused element, or fail. */
async function tabTo(page: Page, accessibleName: RegExp, max = 40): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const name = await page
      .locator(':focus')
      .evaluate((el) => el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '')
      .catch(() => '');
    if (accessibleName.test(name)) return;
  }
  throw new Error(`never reached a control matching ${accessibleName} within ${max} tabs`);
}

test('journey 1: a user can sign in using only the keyboard', async ({ page }) => {
  await stubAuth(page, 'guest');
  await page.route('**/api/auth/login', (route) =>
    void route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' }),
    }),
  );

  await page.goto('/login');

  // Reach the email field by keyboard alone and type into it.
  await tabTo(page, /email/i);
  await expectVisibleFocus(page);
  await page.keyboard.type('student@example.com');

  await page.keyboard.press('Tab');
  await expectVisibleFocus(page);
  await page.keyboard.type('Aa1!aaaaaaaa');

  // Submit with Enter from within the form.
  await page.keyboard.press('Enter');

  // The failure must be ANNOUNCED, not merely rendered: it needs a live
  // region (or focus moved to it), or a screen-reader user never learns the
  // submission failed.
  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(/invalid/i);
});

test('journey 2: a student can go from catalogue to enrolled using only the keyboard', async ({ page }) => {
  const NOW = '2026-08-01T00:00:00.000Z';
  const CARD = {
    id: 'c-1',
    title: 'Introduction to Wren',
    description: 'A short course used by the accessibility sweep.',
    category: 'engineering',
    difficulty: 'BEGINNER',
    instructorName: 'Ingrid Instructor',
    enrollmentCount: 12,
    coverImageUrl: null,
    publishedAt: NOW,
  };

  await stubAuth(page, 'student');
  await stubJson(page, '**/api/categories', [
    { id: 'design', name: 'Design' },
    { id: 'engineering', name: 'Engineering' },
  ]);
  await stubJson(page, '**/api/catalog**', { courses: [CARD], total: 1, page: 1, pageSize: 12 });
  await stubJson(page, '**/api/catalog/c-1', {
    ...CARD,
    instructorId: 'a11y-instructor',
    instructorBiography: 'Teaches things.',
    moduleCount: 1,
    lessonCount: 2,
    status: 'PUBLISHED',
  });
  await stubJson(page, '**/api/enrollments/c-1', {}, 404);
  await page.route('**/api/enrollments', (route) =>
    void route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ courseId: 'c-1', status: 'ACTIVE', enrolledAt: NOW }),
    }),
  );

  await page.goto('/catalog');

  // Reach the course link and activate it with Enter.
  await tabTo(page, /Introduction to Wren/i);
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/catalog\/c-1/);

  // Focus must not be lost to <body> after client-side navigation.
  await tabTo(page, /enrol|enroll/i);
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');

  await expect(page.getByRole('button', { name: /leave|start learning/i }).first()).toBeVisible();
});
```

- [ ] **Step 2: Run the two journeys**

```bash
pnpm nx run web-e2e:a11y -- --grep "journey 1|journey 2"
```
Expected: likely FAIL on first run. The three probable causes, in order: no `role="alert"` on the login error, no visible `:focus-visible` indicator, and focus resetting to `<body>` after router navigation.

- [ ] **Step 3: Fix the app**

Apply Appendix recipes A5 (live region) and A6 (focus indicator). If focus resets after navigation, add a router-driven focus handler to the app shell — see recipe A7.

- [ ] **Step 4: Re-run until green**

```bash
pnpm nx run web-e2e:a11y
pnpm nx affected -t lint test typecheck
```
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-e2e/src/a11y/keyboard.a11y.spec.ts libs apps/web/src
git commit -m "test(web-e2e): keyboard-only sign-in and enrolment journeys"
```

---

## Task 6: Keyboard journeys — learn navigation, and drag-and-drop reorder

**Journey 4 is the highest-risk item in this slice.** Pointer-driven drag-and-drop is the classic keyboard trap. If Angular CDK's keyboard reorder is not wired on the module/lesson lists, this test fails and the fix is real interaction work, not a label.

**Files:**
- Modify: `apps/web-e2e/src/a11y/keyboard.a11y.spec.ts`
- Modify: `libs/web-courses/src` (if the reorder is not keyboard-operable)

**Interfaces:**
- Consumes: `expectVisibleFocus` and `tabTo` from Task 5.

- [ ] **Step 1: Append journeys 3 and 4**

Add to `apps/web-e2e/src/a11y/keyboard.a11y.spec.ts`:

```ts
test('journey 3: a student can navigate lessons and mark complete using only the keyboard', async ({ page }) => {
  await stubAuth(page, 'student');
  await stubJson(page, '**/api/playback/config', { impl: 'fake' });
  await stubJson(page, '**/api/learn/courses/c-1/lessons/l-1', {
    courseId: 'c-1',
    courseTitle: 'Introduction to Wren',
    lessonId: 'l-1',
    lessonTitle: 'Getting started',
    videoId: null,
    videoState: 'READY',
    completedAt: null,
    lastPositionSec: 0,
    materials: [],
    outline: [
      {
        moduleId: 'm-1',
        title: 'Module 1',
        order: 0,
        lessons: [
          { lessonId: 'l-1', title: 'Getting started', order: 0, completedAt: null, videoState: 'READY' },
          { lessonId: 'l-2', title: 'Going further', order: 1, completedAt: null, videoState: 'READY' },
        ],
      },
    ],
  });
  await page.route('**/api/learn/courses/c-1/lessons/l-1/complete', (route) =>
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ completedAt: '2026-08-01T00:00:00.000Z' }),
    }),
  );

  await page.goto('/learn/c-1/l-1');

  // Open the outline drawer by keyboard.
  await tabTo(page, /outline|contents|lessons/i);
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');

  // Escape must close it — an unclosable drawer is a keyboard trap.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Mark the lesson complete by keyboard.
  await tabTo(page, /mark as complete/i);
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');
  await expect(page.getByText(/completed/i).first()).toBeVisible();
});

test('journey 4: an instructor can reorder modules using only the keyboard', async ({ page }) => {
  const TREE = {
    id: 'c-1',
    title: 'Introduction to Wren',
    description: 'A short course used by the accessibility sweep.',
    category: 'engineering',
    difficulty: 'BEGINNER',
    status: 'DRAFT',
    coverImageUrl: null,
    modules: [
      { id: 'm-1', title: 'First module', order: 0, studentsNotifiedAt: null, lessons: [] },
      { id: 'm-2', title: 'Second module', order: 1, studentsNotifiedAt: null, lessons: [] },
    ],
  };

  await stubAuth(page, 'instructor');
  await stubJson(page, '**/api/categories', [{ id: 'engineering', name: 'Engineering' }]);
  await stubJson(page, '**/api/courses/c-1/tree', TREE);
  await stubJson(page, '**/api/courses/c-1/publish-eligibility', { eligible: true, reasons: [] });

  let reorderBody: unknown = null;
  await page.route('**/api/courses/c-1/modules/order', async (route) => {
    reorderBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/courses/c-1/edit');

  // Reach the first module's drag handle by keyboard.
  await tabTo(page, /reorder|drag|move/i);
  await expectVisibleFocus(page);

  // Angular CDK keyboard drag: Space to lift, Arrow to move, Space to drop.
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');

  await expect.poll(() => reorderBody).not.toBeNull();
});
```

- [ ] **Step 2: Run them**

```bash
pnpm nx run web-e2e:a11y -- --grep "journey 3|journey 4"
```
Expected: journey 4 quite possibly FAILS at `tabTo(/reorder|drag|move/i)` — meaning the drag handle is not reachable by keyboard at all.

- [ ] **Step 3: Make the reorder keyboard-operable if it is not**

Angular CDK's `cdkDrag` is pointer-only by default. If the handle is unreachable or Space does nothing, add a keyboard affordance. The lazy fix that satisfies the AC without reimplementing DnD is a pair of focusable "Move up" / "Move down" buttons that call the *same* reorder handler the drag already calls — see recipe A8. Reuse the existing handler; do not write a second reorder path.

If you take the buttons route, update the journey-4 selector from `/reorder|drag|move/i` to match the real button name.

- [ ] **Step 4: Re-run until green**

```bash
pnpm nx run web-e2e:a11y
pnpm nx affected -t lint test typecheck
```
Expected: both PASS.

- [ ] **Step 5: Mutation round if reorder logic changed**

If Step 3 added logic to `web-courses` (not just markup), run the scoped Stryker round:

```bash
pnpm nx run web-courses:mutation
```

- [ ] **Step 6: Commit**

```bash
git add apps/web-e2e/src/a11y/keyboard.a11y.spec.ts libs/web-courses libs/web-learn
git commit -m "feat(web-courses): keyboard-operable module reorder; learn-page keyboard journeys"
```

---

## Task 7: CI gate and documentation

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `docs/USER_GUIDE.md`

- [ ] **Step 1: Read the existing workflow**

```bash
cat .github/workflows/ci.yml
```
Identify the step that runs `web-e2e:e2e` and how Playwright browsers are installed.

- [ ] **Step 2: Add the a11y step**

Add a step after lint/test and **before** the emulator-backed e2e step (it is faster and needs no emulators, so it should fail first). Match the file's existing style:

```yaml
      - name: Accessibility gate (WCAG 2.1 AA)
        run: pnpm nx run web-e2e:a11y
```

If the workflow installs Playwright browsers in a dedicated step, ensure that step runs before this one. If the e2e job is separate and browser install is job-scoped, add the install to this job too.

- [ ] **Step 3: Verify the target runs clean from a cold start**

```bash
pnpm nx reset
pnpm nx run web-e2e:a11y
```
Expected: PASS. `nx reset` matters — a stale daemon has shipped stale artifacts in this repo before.

- [ ] **Step 4: Update `README.md`**

Add a bullet to the PROJECT STATUS block, after the EP-07 Slice C entry, matching the surrounding style:

```markdown
> - **EP-09 US-09-03 Accessibility** — every UI surface is swept by axe-core for WCAG 2.1 AA violations on each CI run, gated at zero with no allowlist; four keyboard-only journey specs (sign in, discover-and-enrol, lesson navigation, module reorder) verify the "navigable by keyboard alone" criterion. The suite is hermetic (`nx run web-e2e:a11y`) — it stubs `/api` via `page.route` and needs neither the emulators nor the api. Honest scope: this is automated conformance plus targeted manual verification, not a certified audit — automated tooling catches roughly a third to a half of WCAG issues. No screen-reader pass; mobile responsiveness (US-09-05) and performance (US-09-01) remain open.
```

- [ ] **Step 5: Update `docs/USER_GUIDE.md`**

The "What is not built" section (line ~1227) opens with *"Every story in the written spec is implemented."* That is now inaccurate — EP-09 has open stories. Replace that opening line with:

```markdown
Every story in EP-01 through EP-08 is implemented. EP-09 (non-functional
requirements) is partly done: US-09-02 (security) and US-09-03 (accessibility)
are shipped; **US-09-01 (performance), US-09-04 (self-hosting), and US-09-05
(mobile responsiveness) are not built.** The remaining gaps below are
deliberate scope cuts inside shipped features:
```

And add to the bullet list:

```markdown
- **Screen-reader verification** — the accessibility gate is automated axe plus
  targeted keyboard journeys. No VoiceOver/NVDA pass has been run, and "alt text
  is present and non-empty" is verified, not "alt text is descriptive".
```

- [ ] **Step 6: Full verification before merge**

```bash
pnpm nx reset
pnpm lint && pnpm typecheck && pnpm test
pnpm nx run web-e2e:a11y
pnpm e2e
```
Expected: all PASS. `pnpm e2e` needs the emulators running (`pnpm emulators` in another terminal) — check for orphaned emulators from another project first, which has bitten this repo before.

- [ ] **Step 7: Commit and merge**

```bash
git add .github/workflows/ci.yml README.md docs/USER_GUIDE.md
git commit -m "ci: gate on WCAG 2.1 AA accessibility sweep; docs for US-09-03"
```

Then from the **main checkout** (not the worktree):

```bash
git merge --no-ff <branch-name>
```

Check `git status` before removing the worktree.

---

## Appendix: Fix recipes

The violation count is unknown until Task 2 runs, but the *categories* are predictable. These are the actual patterns to apply.

**A1 — `button-name`: icon-only button has no accessible name.** The most likely finding; the Robin port swapped in `hlm` buttons and icon buttons are the usual casualty.

```html
<!-- before -->
<button hlmBtn variant="ghost" (click)="remove()"><ng-icon name="lucideTrash" /></button>
<!-- after -->
<button hlmBtn variant="ghost" (click)="remove()" aria-label="Remove lesson">
  <ng-icon name="lucideTrash" aria-hidden="true" />
</button>
```

**A2 — `image-alt`: image has no alt attribute.** Decorative images get `alt=""`; meaningful ones get real text.

```html
<!-- decorative cover placeholder -->
<img [src]="coverUrl()" alt="" />
<!-- meaningful -->
<img [src]="course.coverImageUrl" [alt]="'Cover image for ' + course.title" />
```

**A3 — `heading-order`: heading levels skip.** A page section rendering `<h3>` under an `<h1>` fails. Fix the *markup* level, and keep the visual size with a class — never change an `<h1>` to look right at the cost of order.

```html
<!-- before: h1 then h3 -->
<h3 class="text-lg">Modules</h3>
<!-- after: correct level, same look -->
<h2 class="text-lg">Modules</h2>
```

**A4 — `label` / `form-field-multiple-labels`: control labelled only by placeholder.** A placeholder is not a label; it vanishes on input.

```html
<!-- before -->
<input hlmInput placeholder="Search courses" [formControl]="query" />
<!-- after -->
<label hlmLabel for="catalog-search">Search courses</label>
<input hlmInput id="catalog-search" placeholder="Search courses" [formControl]="query" />
```

Existing specs use `getByPlaceholder('Search courses')` (`catalog.spec.ts:14`) — keep the placeholder so those selectors keep working. Use a visually-hidden label if the design has no room for a visible one.

**A5 — Error message not announced.** Needed by keyboard journey 1.

```html
<!-- before -->
@if (error()) { <p class="text-destructive">{{ error() }}</p> }
<!-- after -->
@if (error()) { <p role="alert" class="text-destructive">{{ error() }}</p> }
```

**A6 — No visible focus indicator.** Fix at the design-system layer so it lands everywhere at once. In the shared button/input styles:

```css
.lw-focusable:focus-visible {
  outline: 2px solid var(--lw-ring);
  outline-offset: 2px;
}
```

Never `outline: none` without an equivalent replacement ring.

**A7 — Focus resets to `<body>` after client-side navigation.** Add a router-driven focus move in the app shell (`apps/web/src/app/app.ts`), targeting the main landmark:

```ts
this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
  const main = document.querySelector<HTMLElement>('main');
  // tabindex="-1" makes the landmark programmatically focusable without
  // adding it to the tab order.
  main?.focus();
});
```

with `<main tabindex="-1">` in the template. This also fixes `region` / `landmark-one-main` findings if `<main>` is missing.

**A8 — Drag-and-drop not keyboard-operable.** Reuse the existing reorder handler; do not write a second path.

```html
<button hlmBtn variant="ghost" size="sm"
        [attr.aria-label]="'Move ' + module.title + ' up'"
        [disabled]="i === 0"
        (click)="moveModule(i, i - 1)">↑</button>
<button hlmBtn variant="ghost" size="sm"
        [attr.aria-label]="'Move ' + module.title + ' down'"
        [disabled]="i === modules().length - 1"
        (click)="moveModule(i, i + 1)">↓</button>
```

where `moveModule(from, to)` is the same method `cdkDropListDropped` already calls.

**A9 — `color-contrast` on a `--lw-*` token.** **Stop and report before changing the token.** The value is the visual design the Robin port just landed. Per spec §8 the fix is the token, not an exemption — but surface it for review first. `libs/web-design-system` already carries a `contrast-core` module with contrast guards; check whether the token is covered there before editing.
