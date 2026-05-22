import { expect, test } from '@playwright/test';

test('the root path redirects to the login page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('input[formControlName="email"]')).toBeVisible();
});
