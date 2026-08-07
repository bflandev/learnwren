import { expect, test } from '@playwright/test';

import { scanA11y } from '../_helpers/a11y-scan';
import { stubAuth } from '../_helpers/route-stubs';
import { GUEST_ROUTES, AUTHED_ROUTES, type RouteFixture } from '../_helpers/route-inventory';

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
      // .first(): some routes' expectText also appears in the header (e.g.
      // /settings/profile's display name duplicates the header's name chip
      // at >=1280px), which would otherwise trip Playwright's strict mode.
      const locator = page.getByText(route.expectText).first();
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
