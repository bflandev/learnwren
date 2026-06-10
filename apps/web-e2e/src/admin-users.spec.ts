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
    { id: 'u1', displayName: 'Ada Lovelace', email: 'ada@example.com', role: 'STUDENT', status: 'ACTIVE', createdAt: '2026-06-01T00:00:00.000Z' },
    { id: 'u2', displayName: 'Bob Builder', email: 'bob@example.com', role: 'INSTRUCTOR', status: 'ACTIVE', createdAt: '2026-06-02T00:00:00.000Z' },
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
  status: 'ACTIVE',
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

test('admin promotes a student from the detail page', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_ME_STUB) });
  });
  await page.route('**/api/admin/users**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIST_RESPONSE) });
  });
  await page.route('**/api/admin/users/u1', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...DETAIL_RESPONSE, role: 'STUDENT' }),
    });
  });
  await page.route('**/api/admin/users/u1/promote', (route) => {
    void route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'u1', role: 'INSTRUCTOR' }),
    });
  });

  await page.goto('/admin/users/u1');
  await expect(page.getByTestId('promote-btn')).toBeVisible();
  await page.getByTestId('promote-btn').click();
  await expect(page.getByTestId('demote-btn')).toBeVisible();
  await expect(page.getByTestId('action-success')).toContainText('Promoted to Instructor');
});

test('admin demotes an instructor via the inline confirm', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_ME_STUB) });
  });
  await page.route('**/api/admin/users**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIST_RESPONSE) });
  });
  await page.route('**/api/admin/users/u1', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...DETAIL_RESPONSE, role: 'INSTRUCTOR' }),
    });
  });
  await page.route('**/api/admin/users/u1/demote', (route) => {
    void route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'u1', role: 'STUDENT' }),
    });
  });

  await page.goto('/admin/users/u1');
  await page.getByTestId('demote-btn').click();
  await expect(page.getByTestId('demote-confirm')).toBeVisible();
  await page.getByTestId('demote-confirm-btn').click();
  await expect(page.getByTestId('promote-btn')).toBeVisible();
  await expect(page.getByTestId('action-success')).toContainText('Demoted to Student');
});

test('a stale role change surfaces an inline error', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_ME_STUB) });
  });
  await page.route('**/api/admin/users**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIST_RESPONSE) });
  });
  await page.route('**/api/admin/users/u1', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...DETAIL_RESPONSE, role: 'STUDENT' }),
    });
  });
  await page.route('**/api/admin/users/u1/promote', (route) => {
    void route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'INVALID_ROLE_TRANSITION', message: 'Invalid role transition.' } }),
    });
  });

  await page.goto('/admin/users/u1');
  await page.getByTestId('promote-btn').click();
  await expect(page.getByTestId('action-error')).toContainText('changed elsewhere');
});

// ─── Suspend / Unsuspend ─────────────────────────────────────────────────────

test('admin suspends a user from detail — badge shows SUSPENDED — then unsuspends', async ({ page }) => {
  // Note: Playwright route handlers match in REVERSE registration order,
  // so the broad glob is registered FIRST and the specific action routes LAST.
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_ME_STUB) });
  });
  await page.route('**/api/admin/users**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIST_RESPONSE) });
  });
  await page.route('**/api/admin/users/u1', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...DETAIL_RESPONSE, status: 'ACTIVE' }),
    });
  });
  await page.route('**/api/admin/users/u1/unsuspend', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'u1', status: 'ACTIVE' }),
    });
  });
  await page.route('**/api/admin/users/u1/suspend', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'u1', status: 'SUSPENDED' }),
    });
  });

  await page.goto('/admin/users/u1');

  // Suspend
  await expect(page.getByTestId('suspend-btn')).toBeVisible();
  await page.getByTestId('suspend-btn').click();
  await expect(page.getByTestId('action-success')).toContainText('suspended');
  await expect(page.getByTestId('status-badge')).toContainText('SUSPENDED');
  await expect(page.getByTestId('unsuspend-btn')).toBeVisible();

  // Unsuspend
  await page.getByTestId('unsuspend-btn').click();
  await expect(page.getByTestId('action-success')).toContainText('unsuspended');
  await expect(page.getByTestId('status-badge')).toContainText('ACTIVE');
  await expect(page.getByTestId('suspend-btn')).toBeVisible();
});

test('list page shows SUSPENDED badge on a suspended user row', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_ME_STUB) });
  });
  await page.route('**/api/admin/users**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        users: [
          { id: 'u1', displayName: 'Ada Lovelace', email: 'ada@example.com', role: 'STUDENT', status: 'SUSPENDED', createdAt: '2026-06-01T00:00:00.000Z' },
          { id: 'u2', displayName: 'Bob Builder', email: 'bob@example.com', role: 'INSTRUCTOR', status: 'ACTIVE', createdAt: '2026-06-02T00:00:00.000Z' },
        ],
        total: 2,
        page: 1,
        pageSize: 20,
        capped: false,
      }),
    });
  });

  await page.goto('/admin/users');
  await expect(page.getByTestId('user-list')).toBeVisible();
  await expect(page.getByTestId('status-badge')).toContainText('SUSPENDED');
});

// ─── Delete ──────────────────────────────────────────────────────────────────

test('admin deletes a student — redirected to list, user gone', async ({ page }) => {
  // Broad glob registered FIRST; specific action routes registered LAST
  // (Playwright matches in reverse registration order).
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_ME_STUB) });
  });
  await page.route('**/api/admin/users**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...LIST_RESPONSE, users: LIST_RESPONSE.users.filter((u) => u.id !== 'u1') }),
    });
  });
  // page.route patterns match URLs only — method branching must happen in
  // the handler (a 'DELETE <glob>' pattern never matches anything).
  await page.route('**/api/admin/users/u1', (route) => {
    if (route.request().method() === 'DELETE') {
      void route.fulfill({ status: 204 });
      return;
    }
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...DETAIL_RESPONSE, role: 'STUDENT', status: 'ACTIVE' }),
    });
  });

  await page.goto('/admin/users/u1');
  await expect(page.getByTestId('delete-btn')).toBeVisible();
  await page.getByTestId('delete-btn').click();
  await expect(page.getByTestId('delete-confirm')).toBeVisible();
  await page.getByTestId('delete-confirm-btn').click();

  // Should redirect back to the user list.
  await page.waitForURL(/\/admin\/users$/, { timeout: 10_000 });
  // u1 (Ada Lovelace) is gone from the stubbed list response.
  await expect(page.getByText('Ada Lovelace')).toHaveCount(0);
});

test('deleting an instructor with courses shows USER_HAS_COURSES error copy', async ({ page }) => {
  // Broad glob first, specific action route last (reverse match order).
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_ME_STUB) });
  });
  await page.route('**/api/admin/users**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIST_RESPONSE) });
  });
  // Method branching in the handler — see the note in the delete-success test.
  await page.route('**/api/admin/users/u2', (route) => {
    if (route.request().method() === 'DELETE') {
      void route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'USER_HAS_COURSES', message: 'User owns courses.', details: { courseCount: 1, courseIds: ['c1'] } } }),
      });
      return;
    }
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'u2',
        displayName: 'Bob Builder',
        email: 'bob@example.com',
        biography: '',
        role: 'INSTRUCTOR',
        status: 'ACTIVE',
        createdAt: '2026-06-02T00:00:00.000Z',
        enrollments: [],
        authoredCourses: [{ courseId: 'c1', title: 'Build a House', status: 'PUBLISHED' }],
      }),
    });
  });

  await page.goto('/admin/users/u2');
  await page.getByTestId('delete-btn').click();
  await expect(page.getByTestId('delete-confirm')).toBeVisible();
  await page.getByTestId('delete-confirm-btn').click();
  await expect(page.getByTestId('action-error')).toContainText('course');
  await expect(page.getByTestId('action-error')).toContainText('1');
});
