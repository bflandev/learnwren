import { expect, test } from '@playwright/test';

test('home page renders the Learn Wren placeholder hero', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('hero')).toBeVisible();
  await expect(page.getByTestId('hero')).toHaveText('Learn Wren');
});
