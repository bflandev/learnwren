/**
 * Hermetic Playwright specs for UC-01-03 Slice D — change-password UI.
 *
 * All `/api` calls are intercepted via page.route so NO real backend or
 * Firebase emulators are required.  The webServer in playwright.config.ts
 * starts the web SPA on :4200; these tests only drive that frontend.
 */
import { test, expect } from '@playwright/test';

const ME_STUB = {
  uid: 'test-uid-password-change',
  email: 'user@example.com',
  displayName: 'Test User',
  role: 'STUDENT' as const,
  emailVerified: true,
};

const PROFILE_STUB = {
  uid: 'test-uid-password-change',
  email: 'user@example.com',
  displayName: 'Test User',
  biography: '',
  role: 'STUDENT' as const,
  emailVerified: true,
};

/**
 * Establish an authenticated session by stubbing the bootstrap /api/auth/me
 * request that provideAppInitializer fires before any guard runs.  Must be
 * called before page.goto so the route handler is registered in time.
 */
async function stubAuthenticatedSession(
  page: import('@playwright/test').Page,
): Promise<void> {
  // Bootstrap + authGuard both call GET /api/auth/me.
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ME_STUB),
    });
  });

  // ProfilePageComponent.ngOnInit calls GET /api/profile.
  await page.route('**/api/profile', (route) => {
    if (route.request().method() !== 'GET') {
      void route.continue();
      return;
    }
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(PROFILE_STUB),
    });
  });
}

test(
  'change-password form blocks submit on confirm mismatch',
  async ({ page }) => {
    await stubAuthenticatedSession(page);
    await page.goto('/settings/profile');

    // Open the password-change form.
    await page.getByTestId('toggle-password-change').click();

    // Scope all field lookups to the password <form> to avoid collisions with
    // the email-change form's "Current password" field; the new/confirm fields
    // are targeted by their stable ids (hlm-form-field wires label[for]/id).
    const pwForm = page.locator('form').filter({
      has: page.getByTestId('submit-password-change'),
    });

    await pwForm.getByLabel('Current password').fill('Aa1!aaaaaaaa');
    await pwForm.locator('#password-change-new').fill('Bb2@bbbbbbbb');
    await pwForm.locator('#password-change-confirm').fill('different');

    await page.getByTestId('submit-password-change').click();

    // Error message must be visible and the URL must not have changed.
    await expect(page.getByText('Passwords do not match.')).toBeVisible();
    await expect(page).toHaveURL(/\/settings\/profile/);
  },
);

test(
  'successful change redirects to /login?passwordChanged=1 with a notice',
  async ({ page }) => {
    // 1. Register the authenticated session stubs FIRST so page.goto succeeds.
    await stubAuthenticatedSession(page);

    // 2. Stub the password-change endpoint.
    await page.route('**/api/profile/password', (route) => {
      void route.fulfill({ status: 204, body: '' });
    });

    // 3. Stub AuthService.logout() (POST /api/auth/logout).
    await page.route('**/api/auth/logout', (route) => {
      void route.fulfill({ status: 204, body: '' });
    });

    await page.goto('/settings/profile');

    // 4. The profile page is now loaded with an authenticated session.
    //    Before submitting, override /api/auth/me to return 401 so that
    //    after logout the login page renders in a logged-out state.
    //    page.route prepends the new handler, which takes priority.
    await page.route('**/api/auth/me', (route) => {
      void route.fulfill({ status: 401, body: '' });
    });

    // Open the password-change form.
    await page.getByTestId('toggle-password-change').click();

    // Scope all field lookups to the password <form> (same disambiguation
    // strategy as the mismatch test above).
    const pwForm = page.locator('form').filter({
      has: page.getByTestId('submit-password-change'),
    });

    // Fill with matching passwords that satisfy the policy (12+ chars, upper,
    // lower, digit, special).
    await pwForm.getByLabel('Current password').fill('Aa1!aaaaaaaa');
    await pwForm.locator('#password-change-new').fill('Bb2@bbbbbbbb');
    await pwForm.locator('#password-change-confirm').fill('Bb2@bbbbbbbb');

    await page.getByTestId('submit-password-change').click();

    // Component calls logout() then navigates to /login?passwordChanged=1.
    await expect(page).toHaveURL(/\/login\?passwordChanged=1/, {
      timeout: 10_000,
    });

    // The login page renders the "password was changed" notice when the query
    // param is present.
    await expect(page.getByTestId('password-changed-notice')).toBeVisible();
  },
);
