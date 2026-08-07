import { expect, test } from '@playwright/test';

import { scanA11y } from '../_helpers/a11y-scan';
import { stubAuth, stubJson } from '../_helpers/a11y-stubs';
import { GUEST_ROUTES, AUTHED_ROUTES, type A11yRoute } from '../_helpers/a11y-routes';

function register(route: A11yRoute): void {
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
      await expect(page.getByText(route.expectText)).toBeVisible();
    }
    await scanA11y(page);
  });
}

GUEST_ROUTES.forEach(register);
AUTHED_ROUTES.forEach(register);

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
  await expect(page.getByText(route.expectText ?? '')).toBeVisible();
  await page.getByRole('button', { name: /outline|contents|lessons/i }).first().click();
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
  await route.stubs?.(page);
  await stubJson(page, '**/api/courses/c-1/modules/m-1/lessons/l-1/materials', []);
  await page.goto(route.path);
  await expect(page.getByText('Getting started')).toBeVisible();
  await page.getByTestId('lesson-title').first().click();
  await scanA11y(page);
});
