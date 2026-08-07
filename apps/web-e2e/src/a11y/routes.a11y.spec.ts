import { test } from '@playwright/test';

import { scanA11y } from '../_helpers/a11y-scan';
import { stubAuth } from '../_helpers/a11y-stubs';

test('/login has no WCAG 2.1 AA violations', async ({ page }) => {
  await stubAuth(page, 'guest');
  await page.goto('/login');
  await page.getByRole('heading').first().waitFor();
  await scanA11y(page);
});
