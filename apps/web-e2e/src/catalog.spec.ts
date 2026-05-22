import { expect, test } from '@playwright/test';

test('a guest sees the catalogue with a header and search bar', async ({ page }) => {
  await page.goto('/catalog');
  await expect(page.getByRole('heading', { name: 'Course catalogue' })).toBeVisible();
  await expect(page.locator('header').first()).toBeVisible();
  await expect(page.getByPlaceholder('Search courses')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
});

test('a guest can search from the header and reach a results page', async ({ page }) => {
  await page.goto('/catalog');
  await page.getByPlaceholder('Search courses').fill('zzzznomatch');
  await page.getByPlaceholder('Search courses').press('Enter');
  await expect(page).toHaveURL(/\/search\?q=zzzznomatch/);
  await expect(page.getByText('No courses found for your search')).toBeVisible();
});

test('an unknown course id renders the not-found page', async ({ page }) => {
  await page.goto('/catalog/does-not-exist');
  await expect(page.getByRole('heading', { name: 'Course not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Browse the catalogue' })).toBeVisible();
});
