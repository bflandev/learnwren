import { expect, test } from '@playwright/test';

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
