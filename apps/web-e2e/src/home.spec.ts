import { expect, test } from '@playwright/test';

test('the root path redirects to the course catalogue', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.getByRole('heading', { name: 'Course catalogue' })).toBeVisible();
});
