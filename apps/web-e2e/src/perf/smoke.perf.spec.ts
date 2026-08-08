import { expect, test } from '@playwright/test';

/**
 * Temporary: proves the static server serves the PRODUCTION bundle before
 * the real perf specs land. Deleted in Task 5.
 */
test('serves the production build, not the dev server', async ({ page }) => {
  await page.goto('/');
  const html = await page.content();
  // Production output uses hashed bundle filenames (outputHashing: "all" in
  // apps/web/project.json). The dev server serves unhashed ones.
  expect(html).toMatch(/main-[A-Z0-9]{8,}\.js/i);
  // And the dev server (Angular 21's @angular/build:dev-server, Vite-based)
  // injects a Vite client script the static server cannot. Verified by
  // curling `nx serve web` locally: the dev HTML head contains
  // `<script type="module" src="/@vite/client"></script>`.
  expect(html).not.toContain('/@vite/client');
});
