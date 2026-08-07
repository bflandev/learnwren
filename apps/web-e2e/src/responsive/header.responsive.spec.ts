import { expect, test } from '@playwright/test';

import { stubAuth } from '../_helpers/route-stubs';

/**
 * US-09-05: "Navigation menus collapse into a hamburger menu on small
 * screens." The one other objectively testable criterion in the story
 * besides horizontal overflow.
 *
 * The admin role is the worst case — seven nav links — so it is the one
 * driven at 320px.
 */
const MOBILE = { width: 320, height: 640 };
const DESKTOP = { width: 1280, height: 800 };

test.describe('header collapse', () => {
  test('below md: hamburger is shown and the inline nav is hidden', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await stubAuth(page, 'admin');
    await page.goto('/catalog');

    await expect(page.getByTestId('header-nav-toggle')).toBeVisible();
    await expect(page.getByTestId('header-nav')).toBeHidden();
  });

  test('at md and above: inline nav is shown and the hamburger is hidden', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await stubAuth(page, 'admin');
    await page.goto('/catalog');

    await expect(page.getByTestId('header-nav')).toBeVisible();
    await expect(page.getByTestId('header-nav-toggle')).toBeHidden();
  });

  test('the sheet exposes every link the desktop nav shows for the role', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await stubAuth(page, 'admin');
    await page.goto('/catalog');

    await page.getByTestId('header-nav-toggle').click();
    const sheet = page.getByTestId('header-nav-sheet');
    await expect(sheet).toBeVisible();

    for (const label of [
      'Browse courses',
      'Dashboard',
      'Admin',
      'Users',
      'Categories',
      'Health',
    ]) {
      await expect(sheet.getByRole('link', { name: label })).toBeVisible();
    }
    // Search moves into the sheet, where it gets full width instead of the
    // ~120px it would be crushed to in a 320px header bar.
    await expect(sheet.locator('lib-course-search-bar')).toBeVisible();
  });

  test('the toggle reports its state and returns focus on close', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await stubAuth(page, 'admin');
    await page.goto('/catalog');

    const toggle = page.getByTestId('header-nav-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('header-nav-sheet')).toBeHidden();
    // WCAG 2.4.3: dismissing an overlay must not strand focus on <body>.
    await expect(toggle).toBeFocused();
  });

  test('a student does not see instructor or admin links in the sheet', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await stubAuth(page, 'student');
    await page.goto('/catalog');

    await page.getByTestId('header-nav-toggle').click();
    const sheet = page.getByTestId('header-nav-sheet');
    await expect(sheet.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'My Courses' })).toBeHidden();
    await expect(sheet.getByRole('link', { name: 'Admin' })).toBeHidden();
  });
});
