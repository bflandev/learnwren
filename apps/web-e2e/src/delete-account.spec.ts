/**
 * Hermetic Playwright specs for self-service account deletion. All `/api`
 * calls are intercepted via page.route; no backend or emulators required.
 */
import { test, expect, type Page } from '@playwright/test';

import { stubUnhandledApi } from './_helpers/route-stubs';

const ME_STUB = {
  uid: 'test-uid-delete-account',
  email: 'user@example.com',
  displayName: 'Test User',
  role: 'STUDENT' as const,
  emailVerified: true,
};

const PROFILE_STUB = { ...ME_STUB, biography: '' };

async function stubAuthenticatedSession(page: Page): Promise<void> {
  await stubUnhandledApi(page);
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME_STUB) });
  });
  await page.route('**/api/profile', (route) => {
    if (route.request().method() !== 'GET') {
      void route.continue();
      return;
    }
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PROFILE_STUB) });
  });
}

/** Opens the delete form and fills both fields; returns the form locator. */
async function fillDeleteForm(page: Page) {
  await page.getByTestId('toggle-delete-account').click();
  const form = page.getByTestId('delete-account-form');
  await form.getByLabel('Current password').fill('Aa1!aaaaaaaa');
  await form.getByLabel('Type DELETE to confirm').fill('DELETE');
  return form;
}

test('successful deletion lands on /login?accountDeleted=1 with a notice', async ({ page }) => {
  await stubAuthenticatedSession(page);
  // Route patterns cannot carry a method; branch inside the handler.
  await page.route('**/api/profile/account', (route) => {
    if (route.request().method() !== 'DELETE') {
      void route.continue();
      return;
    }
    void route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/api/auth/logout', (route) => {
    void route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/settings/profile');
  // After the delete the session is gone; the login page must render logged out.
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({ status: 401, body: '' });
  });

  await fillDeleteForm(page);
  await page.getByTestId('submit-delete-account').click();

  await expect(page).toHaveURL(/\/login\?accountDeleted=1/);
  await expect(page.getByTestId('account-deleted-notice')).toBeVisible();
});

test('an instructor who owns courses sees why the deletion was refused', async ({ page }) => {
  await stubAuthenticatedSession(page);
  await page.route('**/api/profile/account', (route) => {
    void route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'USER_HAS_COURSES', message: 'x', details: { courseCount: 1, courseIds: ['c1'] } } }),
    });
  });

  await page.goto('/settings/profile');
  await fillDeleteForm(page);
  await page.getByTestId('submit-delete-account').click();

  await expect(page.getByTestId('delete-account-error')).toContainText('You still own courses');
  await expect(page).toHaveURL(/\/settings\/profile/);
});
