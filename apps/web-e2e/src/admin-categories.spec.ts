/**
 * Hermetic Playwright specs for admin course-category management (US-08-02).
 *
 * All `/api` calls are intercepted via page.route so NO real backend or
 * Firebase emulators are required. The webServer in playwright.config.ts
 * starts the web SPA on :4200; these tests only drive that frontend.
 */
import { test, expect, type Page } from '@playwright/test';

const ADMIN_ME_STUB = {
  uid: 'test-uid-admin',
  email: 'admin@example.com',
  displayName: 'Admin User',
  role: 'ADMIN' as const,
  emailVerified: true,
};

interface CategoryStub {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

function cat(id: string, name: string): CategoryStub {
  return { id, name, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' };
}

/**
 * Wires a mutable in-memory category store behind the public list endpoint and
 * the admin mutation endpoints, so the page's reload-after-mutate flow sees
 * its own writes. Returns the store for assertions.
 */
async function routeCategoryApi(page: Page, initial: CategoryStub[]): Promise<CategoryStub[]> {
  const store = [...initial];
  await page.route('**/api/auth/me', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_ME_STUB) });
  });
  await page.route('**/api/categories', (route) => {
    const sorted = [...store].sort((a, b) => a.name.localeCompare(b.name));
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sorted) });
  });
  await page.route('**/api/admin/categories**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const id = url.pathname.split('/').pop() ?? '';
    if (req.method() === 'POST') {
      const { name } = req.postDataJSON() as { name: string };
      const created = cat(name.toUpperCase().replace(/[^A-Z0-9]+/g, '_'), name);
      store.push(created);
      void route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
      return;
    }
    if (req.method() === 'PATCH') {
      const { name } = req.postDataJSON() as { name: string };
      const target = store.find((c) => c.id === id);
      if (target) target.name = name;
      void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(target) });
      return;
    }
    if (req.method() === 'DELETE') {
      const idx = store.findIndex((c) => c.id === id);
      if (idx >= 0) store.splice(idx, 1);
      void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reassignedCourses: 1 }) });
      return;
    }
    void route.fallback();
  });
  return store;
}

test('admin creates a category from /admin/categories', async ({ page }) => {
  await routeCategoryApi(page, [cat('DESIGN', 'Design'), cat('OTHER', 'Other')]);

  await page.goto('/admin/categories');
  await expect(page.getByTestId('category-list')).toBeVisible();
  await expect(page.getByTestId('category-row')).toHaveCount(2);

  await page.getByTestId('create-input').fill('Data Science');
  await page.getByTestId('create-button').click();

  const row = page.getByTestId('category-row').filter({ hasText: 'Data Science' });
  await expect(row).toBeVisible();
  await expect(page.getByTestId('category-row')).toHaveCount(3);
});

test('admin renames a category inline', async ({ page }) => {
  await routeCategoryApi(page, [cat('DESIGN', 'Design'), cat('OTHER', 'Other')]);

  await page.goto('/admin/categories');
  const row = page.getByTestId('category-row').filter({ hasText: 'Design' });
  await row.getByTestId('rename-button').click();
  await page.getByTestId('rename-input').fill('Design & UX');
  await page.getByTestId('rename-save-button').click();

  await expect(page.getByTestId('category-row').filter({ hasText: 'Design & UX' })).toBeVisible();
});

test('deleting a category prompts for reassignment and sends the chosen target', async ({ page }) => {
  await routeCategoryApi(page, [cat('BUSINESS', 'Business'), cat('DESIGN', 'Design'), cat('OTHER', 'Other')]);

  await page.goto('/admin/categories');
  const row = page.getByTestId('category-row').filter({ hasText: 'Business' });
  await row.getByTestId('delete-button').click();

  // The AC's reassignment prompt: a select of the OTHER categories.
  const select = page.getByTestId('reassign-select');
  await expect(select).toBeVisible();
  await select.selectOption('OTHER');

  const deleteRequest = page.waitForRequest(
    (r) => r.method() === 'DELETE' && r.url().includes('/api/admin/categories/BUSINESS'),
  );
  await page.getByTestId('delete-confirm-button').click();
  const sent = await deleteRequest;
  expect(new URL(sent.url()).searchParams.get('reassignTo')).toBe('OTHER');

  await expect(page.getByTestId('category-row')).toHaveCount(2);
  await expect(page.getByTestId('category-row').filter({ hasText: 'Business' })).toHaveCount(0);
});

test('the catalogue filter lists the fetched category names', async ({ page }) => {
  await page.route('**/api/categories', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([cat('DESIGN', 'Design'), cat('WREN_CARE', 'Wren Care')]),
    });
  });
  await page.route('**/api/catalog**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }),
    });
  });

  await page.goto('/catalog');
  const categorySelect = page.locator('select').first();
  await expect(categorySelect.locator('option')).toHaveText(['All', 'Design', 'Wren Care']);
});
