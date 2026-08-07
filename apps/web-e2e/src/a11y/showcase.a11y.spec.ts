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
