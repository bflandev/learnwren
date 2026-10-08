import { expect, test } from '@playwright/test';

import { scanA11y } from '../_helpers/a11y-scan';
import { stubAuth, stubJson } from '../_helpers/route-stubs';
import {
  GUEST_ROUTES,
  AUTHED_ROUTES,
  CATEGORIES,
  CATALOG_LIST,
  COURSE_CARD,
  COURSE_TREE,
  NOW,
  type RouteFixture,
} from '../_helpers/route-inventory';

function register(route: RouteFixture): void {
  test(`${route.name} (${route.path}) has no WCAG 2.1 AA violations`, async ({ page }) => {
    await stubAuth(page, route.role);
    await route.stubs?.(page);
    await page.goto(route.path);
    // Wait for settled DOM so axe does not scan a loading skeleton.
    await page.waitForSelector(route.readySelector ?? 'h1, h2, [role="heading"]');
    // Prove the route rendered its REAL content, not an error/empty state —
    // a bad fixture shape throws inside the component and the page settles
    // on an error paragraph just as fast as on real data, which would
    // otherwise scan clean and hide the actual composition.
    if (route.expectText) {
      // Scoped to <main>, not the whole page: <app-header> precedes <main>
      // in app.html, and some routes' expectText also appears in the
      // header (e.g. /settings/profile's display name duplicates the
      // header's name chip at >=md), which would otherwise let the header
      // satisfy this guard even if the page body itself errored out.
      // .first() still covers text that legitimately repeats within <main>.
      const locator = page.locator('main').getByText(route.expectText).first();
      if (route.expectAttached) {
        await expect(locator).toBeAttached();
      } else {
        await expect(locator).toBeVisible();
      }
    }
    await scanA11y(page);
  });
}

GUEST_ROUTES.forEach(register);
AUTHED_ROUTES.forEach(register);

/**
 * US-09-05: outlineOpen now starts `true` unconditionally (it's the
 * student's course navigation, so it must be visible on first paint on
 * every viewport, not hidden behind an unlabelled toggle — see the comment
 * on LessonPlayerPageComponent.outlineOpen). The base "learn page" scan
 * above therefore already covers the drawer-open state, including on
 * mobile.
 *
 * What that base scan does NOT cover is the CLOSED state on a narrow
 * viewport, reachable only via the toggle — its own distinct interactive
 * surface with its own focus-trap obligations (mode="drawer" auto-closes on
 * lesson selection and Escape; see CourseOutlinePanelComponent). Force a
 * mobile viewport, confirm the outline starts open, close it via the
 * toggle, and scan that state.
 */
test('learn page with the outline drawer closed has no WCAG 2.1 AA violations', async ({ page }) => {
  const route = AUTHED_ROUTES.find((r) => r.name === 'learn page');
  if (!route) throw new Error('learn page route missing from AUTHED_ROUTES');
  await page.setViewportSize({ width: 390, height: 844 });
  await stubAuth(page, route.role);
  await route.stubs?.(page);
  await page.goto(route.path);
  await expect(page.getByText(route.expectText ?? '')).toBeVisible();
  await page.getByRole('button', { name: /outline|contents|lessons/i }).first().click();
  await expect(page.getByText(route.expectText ?? '')).toBeHidden();
  await scanA11y(page);
});

/**
 * There is no separate lesson-editor route — lesson editing lives inside
 * /courses/:id/edit. Clicking a lesson's title enters its inline rename
 * mode; the video-upload/captions/materials controls for that lesson are
 * already visible on the base editor render (they are not gated behind a
 * click), so the base "course editor" scan above already covers them. This
 * second scan adds the rename-input edit state on top.
 */
/**
 * The base course-editor fixture's lesson has no video, so the captions panel
 * (language picker + per-track Remove buttons) only renders here: the lesson
 * gets a TRANSCODING video (badge, not player — no hls.js) with two tracks.
 */
test('course editor with a video and two caption tracks has no WCAG 2.1 AA violations', async ({ page }) => {
  const route = AUTHED_ROUTES.find((r) => r.name === 'course editor');
  if (!route) throw new Error('course editor route missing from AUTHED_ROUTES');
  await stubAuth(page, route.role);
  await route.stubs?.(page);
  // Registered after the base stubs so they win (Playwright matches in reverse order).
  const [mod] = COURSE_TREE.modules;
  await stubJson(page, '**/api/courses/c-1', {
    ...COURSE_TREE,
    modules: [{ ...mod, lessons: mod!.lessons.map((l) => ({ ...l, videoId: 'v-1' })) }],
  });
  await stubJson(page, '**/api/videos/v-1', {
    id: 'v-1', ownerInstructorId: 'a11y-instructor', courseId: 'c-1', lessonId: 'l-1',
    state: 'TRANSCODING', source: { bucket: 'b', path: 'p' }, createdAt: NOW, updatedAt: NOW,
  });
  await stubJson(page, '**/api/videos/v-1/captions', [
    { language: 'en', label: 'English', updatedAt: NOW },
    { language: 'fr', label: 'French', updatedAt: NOW },
  ]);
  await page.goto(route.path);
  await expect(page.getByRole('button', { name: 'Remove French captions' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Language' })).toBeVisible();
  await scanA11y(page);
});

test('course editor with a lesson renamed has no WCAG 2.1 AA violations', async ({ page }) => {
  const route = AUTHED_ROUTES.find((r) => r.name === 'course editor');
  if (!route) throw new Error('course editor route missing from AUTHED_ROUTES');
  await stubAuth(page, route.role);
  await route.stubs?.(page); // materials endpoint is stubbed as part of the base route now
  await page.goto(route.path);
  await expect(page.getByText('Getting started')).toBeVisible();
  await page.getByTestId('lesson-title').first().click();
  await expect(page.getByTestId('lesson-rename-input')).toBeVisible();
  await scanA11y(page);
});

/**
 * US-09-05 added two interactive surfaces to the header — the below-`md`
 * nav sheet and the `md`-to-`xl` search popover — and both are structural
 * directives (`*brnSheetContent` / `*brnPopoverContent`): their DOM does not
 * exist until opened, so the base per-route scans above (run at 1280px, plus
 * one at 390px for the learn-page drawer) never see either one. Mirrors the
 * "learn page with the outline drawer closed" pattern above: force the
 * viewport that makes the surface reachable, open it, scan.
 *
 * Admin is the richest nav (adds the four admin-only links, grouped behind
 * `hlm-menu` at md+ but flat inside the sheet), so it is the role driven
 * here, matching header.responsive.spec.ts's choice for the same reason.
 */
test('header nav sheet has no WCAG 2.1 AA violations', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await stubAuth(page, 'admin');
  await stubJson(page, '**/api/categories', CATEGORIES);
  await stubJson(page, '**/api/catalog**', CATALOG_LIST);
  await page.goto('/catalog');
  await expect(page.getByText(COURSE_CARD.title)).toBeVisible();

  await page.getByTestId('header-nav-toggle').click();
  await expect(page.getByTestId('header-nav-sheet')).toBeVisible();
  await scanA11y(page);
});

test('header search popover has no WCAG 2.1 AA violations', async ({ page }) => {
  // Between `md` (768) and `xl` (1280) — the one band where the popover
  // trigger is visible (below md it's the sheet; at xl+ it's the inline bar).
  await page.setViewportSize({ width: 900, height: 700 });
  await stubAuth(page, 'admin');
  await stubJson(page, '**/api/categories', CATEGORIES);
  await stubJson(page, '**/api/catalog**', CATALOG_LIST);
  await page.goto('/catalog');
  await expect(page.getByText(COURSE_CARD.title)).toBeVisible();

  await page.getByTestId('header-search-trigger').click();
  await expect(page.getByTestId('header-search-popover')).toBeVisible();
  await scanA11y(page);
});
