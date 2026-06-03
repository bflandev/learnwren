/**
 * Hermetic Playwright specs for the admin user directory.
 *
 * All `/api` calls are intercepted via page.route so NO real backend or
 * Firebase emulators are required. The webServer in playwright.config.ts
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

const LIST_RESPONSE = {
  users: [
    { id: 'u1', displayName: 'Ada Lovelace', email: 'ada@example.com', role: 'STUDENT', createdAt: '2026-06-01T00:00:00.000Z' },
    { id: 'u2', displayName: 'Bob Builder', email: 'bob@example.com', role: 'INSTRUCTOR', createdAt: '2026-06-02T00:00:00.000Z' },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
  capped: false,
};

const DETAIL_RESPONSE = {
  id: 'u1',
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  biography: 'Mathematician',
  role: 'STUDENT',
  createdAt: '2026-06-01T00:00:00.000Z',
  enrollments: [
    { courseId: 'c1', courseTitle: 'Intro to Logic', status: 'ACTIVE', enrolledAt: '2026-06-03T00:00:00.000Z' },
  ],
  authoredCourses: [],
};

test('admin sees the user directory and opens a user detail', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_ME_STUB) });
  });
  // Playwright matches route handlers in REVERSE registration order, so the
  // broad list glob is registered FIRST and the specific detail route LAST —
  // otherwise the glob (which also matches /users/u1) would shadow the detail.
  await page.route('**/api/admin/users**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIST_RESPONSE) });
  });
  await page.route('**/api/admin/users/u1', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DETAIL_RESPONSE) });
  });

  await page.goto('/admin/users');

  await expect(page.getByTestId('user-list')).toBeVisible();
  const row = page.getByTestId('user-row').filter({ hasText: 'Ada Lovelace' });
  await expect(row).toBeVisible();

  await row.click();
  await expect(page).toHaveURL(/\/admin\/users\/u1/);
  await expect(page.getByTestId('enrollments')).toBeVisible();
  await expect(page.getByText('Intro to Logic')).toBeVisible();
});

test('admin sees the empty state when there are no users', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_ME_STUB) });
  });
  await page.route('**/api/admin/users**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ users: [], total: 0, page: 1, pageSize: 20, capped: false }),
    });
  });

  await page.goto('/admin/users');
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await expect(page.getByTestId('user-list')).toHaveCount(0);
});

test('non-admin (STUDENT) navigating to /admin/users is redirected to /dashboard', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STUDENT_ME_STUB) });
  });

  await page.goto('/admin/users');
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
  await expect(page.getByTestId('user-list')).toHaveCount(0);
});
