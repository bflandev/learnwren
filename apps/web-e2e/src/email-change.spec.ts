/**
 * Hermetic Playwright specs for UC-01-03 Slice C — change-email UI.
 *
 * All `/api` calls are intercepted via page.route so NO real backend or
 * Firebase emulators are required.  The webServer in playwright.config.ts
 * starts the web SPA on :4200; these tests only drive that frontend.
 */
import { test, expect } from '@playwright/test';

const ME_STUB = {
  uid: 'test-uid-email-change',
  email: 'current@example.com',
  displayName: 'Test User',
  role: 'STUDENT' as const,
  emailVerified: true,
};

const PROFILE_STUB = {
  uid: 'test-uid-email-change',
  email: 'current@example.com',
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
  'change-email form shows the verification-sent confirmation',
  async ({ page }) => {
    await stubAuthenticatedSession(page);

    // Stub the email-change request (POST /api/profile/email → 202 empty).
    await page.route('**/api/profile/email', (route) => {
      void route.fulfill({ status: 202, body: '' });
    });

    await page.goto('/settings/profile');

    // Open the email-change form.
    await page.getByTestId('toggle-email-change').click();

    // Fill the form fields.  The template uses <label><span>…</span><input/></label>
    // (implicit label association via nesting), which Playwright's getByLabel
    // resolves correctly.
    await page.getByLabel('New email address').fill('new@example.com');
    await page.getByLabel('Current password').fill('Aa1!aaaaaaaa');

    // Submit.
    await page.getByTestId('submit-email-change').click();

    // Assert the sent-confirmation banner is visible and contains the new email.
    const banner = page.getByTestId('email-change-sent');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('new@example.com');
  },
);

test(
  'email-changed landing redirects to /login?emailChanged=1',
  async ({ page }) => {
    // Stub the confirm endpoint — server says the swap committed.
    await page.route('**/api/profile/email/confirm', (route) => {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ changed: true, email: 'new@example.com' }),
      });
    });

    // AuthService.logout() calls POST /api/auth/logout.
    await page.route('**/api/auth/logout', (route) => {
      void route.fulfill({ status: 204, body: '' });
    });

    // After logout the bootstrap /api/auth/me returns 401 (no session).
    // The EmailChangedComponent navigates to /login before any authGuard fires,
    // so we return 401 here to keep the login page in a logged-out state.
    await page.route('**/api/auth/me', (route) => {
      void route.fulfill({ status: 401, body: '' });
    });

    // Navigate to the email-changed landing page (no authGuard — public route).
    await page.goto('/settings/profile/email-changed');

    // The component calls confirm(), then logout(), then navigates to /login?emailChanged=1.
    await expect(page).toHaveURL(/\/login\?emailChanged=1/, { timeout: 10_000 });

    // The login page renders the "email was changed" notice when the query param is present.
    await expect(page.getByTestId('email-changed-notice')).toBeVisible();
  },
);
