import { expect, test } from '@playwright/test';

import { scanA11y } from '../_helpers/a11y-scan';
import { stubAuth } from '../_helpers/a11y-stubs';
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
      const locator = page.getByText(route.expectText);
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
 * The learn page is scanned twice — the outline drawer is a distinct
 * interactive surface with its own focus-trap obligations, and it is not in
 * the DOM until opened.
 *
 * outlineOpen initialises from `matchMedia('(min-width: 1024px)')`
 * (lesson-player-page.component.ts:114), so at the default Desktop Chrome
 * viewport (1280px) outlineMode is 'sidebar' and the panel starts OPEN —
 * toggleOutline() would then CLOSE it, scanning strictly less DOM than the
 * base "learn page" test and never touching the mobile drawer at all. Force
 * a mobile viewport before goto so the component initialises in drawer mode
 * (closed), then assert the outline is visible AFTER the click — that
 * assertion is load-bearing: if the drawer fails to open, the test fails
 * instead of silently scanning a closed panel.
 */
test('learn page with the outline drawer open has no WCAG 2.1 AA violations', async ({ page }) => {
  const route = AUTHED_ROUTES.find((r) => r.name === 'learn page');
  if (!route) throw new Error('learn page route missing from AUTHED_ROUTES');
  await page.setViewportSize({ width: 390, height: 844 });
  await stubAuth(page, route.role);
  await route.stubs?.(page);
  await page.goto(route.path);
  await expect(page.getByText(route.expectText ?? '')).toBeHidden();
  await page.getByRole('button', { name: /outline|contents|lessons/i }).first().click();
  await expect(page.getByText(route.expectText ?? '')).toBeVisible();
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
