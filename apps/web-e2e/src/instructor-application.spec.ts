/**
 * Hermetic Playwright specs for UC-01-04 — instructor application UI.
 *
 * All `/api` calls are intercepted via page.route so NO real backend or
 * Firebase emulators are required.  The webServer in playwright.config.ts
 * starts the web SPA on :4200; these tests only drive that frontend.
 */
import { test, expect } from '@playwright/test';

const ME_STUB = {
  uid: 'test-uid-instructor-app',
  email: 'student@example.com',
  displayName: 'Student User',
  role: 'STUDENT' as const,
  emailVerified: true,
};

const PROFILE_STUB = {
  uid: 'test-uid-instructor-app',
  email: 'student@example.com',
  displayName: 'Student User',
  biography: '',
  role: 'STUDENT' as const,
  emailVerified: true,
};

test(
  'instructor application submission happy path (UC-01-04)',
  async ({ page }) => {
    // Mutable application state — shared between GET and POST handlers.
    let appState: Record<string, unknown> = { status: 'NONE' };

    // 1. Stub bootstrap + authGuard: GET /api/auth/me → authenticated STUDENT.
    await page.route('**/api/auth/me', (route) => {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ME_STUB),
      });
    });

    // 2. Stub GET /api/profile → profile page loads.
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

    // 3. Stub GET + POST /api/profile/instructor-application.
    await page.route('**/api/profile/instructor-application', (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as {
          statement: string;
          expertise: string;
        };
        appState = {
          status: 'PENDING',
          statement: body.statement,
          expertise: body.expertise,
          createdAt: '2026-05-29T10:00:00.000Z',
        };
        void route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(appState),
        });
      } else {
        // GET — return current state (NONE initially, PENDING after submit).
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(appState),
        });
      }
    });

    // 4. Navigate to the profile settings page.
    await page.goto('/settings/profile');

    // The instructor-application section is visible to students.
    // Click "Become an Instructor" to open the form.
    await page.getByRole('button', { name: 'Become an Instructor' }).click();

    // 5. Fill the form fields.
    //    The template uses <label><span>…</span><textarea …></label>, so the
    //    span text is the accessible name for the textarea within the label.
    await page
      .locator('label:has-text("Statement of intent") textarea')
      .fill('I have taught Rust for five years.');

    await page
      .locator('label:has-text("Areas of expertise") textarea')
      .fill('Rust, systems programming');

    // 6. Submit the application.
    await page.getByRole('button', { name: 'Submit application' }).click();

    // 7. The under-review card must appear.
    await expect(page.getByTestId('application-pending')).toContainText(
      'under review',
    );

    // 8. Persistence across reload: GET stub now returns PENDING state.
    await page.reload();
    await expect(page.getByTestId('application-pending')).toContainText(
      'under review',
    );
  },
);
