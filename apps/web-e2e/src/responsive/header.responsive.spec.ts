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
// Global Constraint of this slice: the collapse boundary is Tailwind `md`
// (768px), a min-width query, so 767px is the last collapsed pixel and
// 768px is the first inline one. MOBILE (320) and DESKTOP (1280) alone
// cannot prove the boundary sits at `md` specifically -- both assertions
// below would pass identically whether the real breakpoint were `md` (768)
// or `xl` (1280), since 320 is below either and neither viewport tests ever
// visits 768-1279. Probing both sides of 768 is what makes the test able to
// go red if the breakpoint moves again (verified manually: temporarily
// changed `md:` to `xl:` in app-header.component.html and re-ran just this
// spec -- BELOW_BOUNDARY passed but AT_BOUNDARY failed, "header-nav" stayed
// hidden at 768px; reverted immediately after confirming red).
const BELOW_BOUNDARY = { width: 767, height: 640 };
const AT_BOUNDARY = { width: 768, height: 640 };

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

  test('767px (one pixel below md): still collapsed', async ({ page }) => {
    await page.setViewportSize(BELOW_BOUNDARY);
    await stubAuth(page, 'admin');
    await page.goto('/catalog');

    await expect(page.getByTestId('header-nav-toggle')).toBeVisible();
    await expect(page.getByTestId('header-nav')).toBeHidden();
  });

  test('768px (exactly md): already inline', async ({ page }) => {
    await page.setViewportSize(AT_BOUNDARY);
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

  test('at md and above, the admin links are grouped behind a keyboard-reachable dropdown', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await stubAuth(page, 'admin');
    await page.goto('/catalog');

    const trigger = page.getByTestId('header-admin-menu-trigger');
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAccessibleName('Admin menu');

    // Reach and open it by keyboard, not a mouse click -- proves the four
    // admin-only links didn't just move, they stayed reachable.
    await trigger.focus();
    await page.keyboard.press('Enter');

    const menu = page.getByTestId('header-admin-menu');
    await expect(menu).toBeVisible();
    for (const label of ['Admin', 'Users', 'Categories', 'Health']) {
      await expect(menu.getByRole('menuitem', { name: label })).toBeVisible();
    }
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
