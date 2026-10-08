/**
 * Hermetic Playwright specs for the admin instructor-applications page.
 *
 * All `/api` calls are intercepted via page.route so NO real backend or
 * Firebase emulators are required.  The webServer in playwright.config.ts
 * starts the web SPA on :4200; these tests only drive that frontend.
 */
import { test, expect } from '@playwright/test';

const ADMIN_ME_STUB = {
  uid: 'test-uid-admin',
  email: 'admin@example.com',
  displayName: 'Admin User',
  role: 'ADMIN' as const,
  emailVerified: true,
};

const STUDENT_ME_STUB = {
  uid: 'test-uid-student',
  email: 'student@example.com',
  displayName: 'Student User',
  role: 'STUDENT' as const,
  emailVerified: true,
};

const PENDING_APPLICATION = {
  uid: 'test-uid-applicant',
  displayName: 'Applicant User',
  email: 'applicant@example.com',
  statement: 'I want to teach mathematics',
  expertise: 'Mathematics',
  status: 'PENDING',
  createdAt: '2026-05-29T10:00:00.000Z',
};

// The list URL carries ?status=…; a glob on the bare path would not match it.
const LIST_URL = (url: URL): boolean => url.pathname === '/api/admin/instructor-applications';

test('admin sees the pending queue and can approve an application', async ({ page }) => {
  // Track which applications remain in the queue.
  let applications = [{ ...PENDING_APPLICATION }];

  // 1. Stub GET /api/auth/me → authenticated ADMIN.
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ADMIN_ME_STUB),
    });
  });

  // 2. Stub GET /api/admin/instructor-applications → return pending queue.
  await page.route(LIST_URL, (route) => {
    if (route.request().method() !== 'GET') {
      void route.continue();
      return;
    }
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ applications }),
    });
  });

  // 3. Stub POST /api/admin/instructor-applications/:uid/approve → remove from queue.
  await page.route('**/api/admin/instructor-applications/**/approve', (route) => {
    applications = applications.filter((a) => a.uid !== PENDING_APPLICATION.uid);
    void route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'APPROVED',
        statement: PENDING_APPLICATION.statement,
        expertise: PENDING_APPLICATION.expertise,
        createdAt: PENDING_APPLICATION.createdAt,
      }),
    });
  });

  // 4. Navigate to the admin queue page.
  await page.goto('/admin/instructor-applications');

  // The application list is visible with the seeded row.
  await expect(page.getByTestId('application-list')).toBeVisible();
  const row = page.getByTestId('application-row').filter({ hasText: PENDING_APPLICATION.displayName });
  await expect(row).toBeVisible();

  // Click the Approve button on that row.
  await row.getByTestId('approve-button').click();

  // The row disappears from the list (component filters it out on success).
  await expect(row).toHaveCount(0);
});

test('admin sees the empty state when the queue is empty', async ({ page }) => {
  // 1. Stub GET /api/auth/me → authenticated ADMIN.
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ADMIN_ME_STUB),
    });
  });

  // 2. Stub GET /api/admin/instructor-applications → empty queue.
  await page.route(LIST_URL, (route) => {
    if (route.request().method() !== 'GET') {
      void route.continue();
      return;
    }
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ applications: [] }),
    });
  });

  await page.goto('/admin/instructor-applications');

  // Empty state message is shown; list is absent.
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await expect(page.getByTestId('application-list')).toHaveCount(0);
});

test('non-admin (STUDENT) navigating to /admin/instructor-applications is redirected to /dashboard', async ({
  page,
}) => {
  // Stub GET /api/auth/me → authenticated STUDENT (non-admin).
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(STUDENT_ME_STUB),
    });
  });

  await page.goto('/admin/instructor-applications');

  // adminRoleGuard redirects non-admins to /dashboard.
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
  await expect(page.getByTestId('application-list')).toHaveCount(0);
});

test('admin declines with a reason, then finds it under Declined', async ({ page }) => {
  let declined: Array<Record<string, string>> = [];
  let declineBody: unknown;

  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_ME_STUB) });
  });
  await page.route(LIST_URL, (route) => {
    const status = new URL(route.request().url()).searchParams.get('status');
    const applications = status === 'DECLINED' ? declined : declined.length ? [] : [PENDING_APPLICATION];
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ applications }) });
  });
  await page.route('**/api/admin/instructor-applications/**/decline', (route) => {
    declineBody = route.request().postDataJSON();
    declined = [
      {
        ...PENDING_APPLICATION,
        status: 'DECLINED',
        resolvedAt: '2026-06-03T10:00:00.000Z',
        declineReason: 'Please add a sample syllabus.',
      },
    ];
    void route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ status: 'DECLINED' }) });
  });

  await page.goto('/admin/instructor-applications');
  const row = page.getByTestId('application-row').filter({ hasText: PENDING_APPLICATION.displayName });
  await row.getByTestId('decline-button').click();
  await row.getByLabel('Reason (optional, sent to the applicant)').fill('Please add a sample syllabus.');
  await row.getByTestId('confirm-decline-button').click();
  await expect(row).toHaveCount(0);
  expect(declineBody).toEqual({ reason: 'Please add a sample syllabus.' });

  await page.getByTestId('filter-DECLINED').click();
  await expect(page.getByTestId('decline-reason')).toContainText('Please add a sample syllabus.');
  await expect(page.getByTestId('approve-button')).toHaveCount(0);
});
