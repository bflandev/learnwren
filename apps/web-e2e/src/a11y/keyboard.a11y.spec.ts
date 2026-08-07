import { expect, test, type Page } from '@playwright/test';

import { stubAuth, stubJson } from '../_helpers/a11y-stubs';
import {
  CATALOG_LIST,
  CATEGORIES,
  COURSE_CARD,
  COURSE_DETAIL,
  ENROLLMENT_STATUS_NONE,
  NOW,
} from '../_helpers/a11y-routes';

/**
 * Assert the focused element is a real control AND paints a visible focus
 * indicator. The Robin design-system port touched focus rings, and a control
 * that is focusable but shows no focus state passes every automated axe check
 * while failing WCAG SC 2.4.7.
 */
async function expectVisibleFocus(page: Page): Promise<void> {
  const active = page.locator(':focus-visible');
  await expect(active).toHaveCount(1);
  const hasIndicator = await active.evaluate((el) => {
    const s = getComputedStyle(el);
    const ring =
      (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) ||
      s.boxShadow !== 'none';
    return ring;
  });
  expect(hasIndicator, 'focused element paints no visible focus indicator').toBe(true);
}

/**
 * Press Tab until the predicate matches the focused element, or fail.
 *
 * Accessible-name lookup covers `aria-label`, `aria-labelledby`, and — the
 * case the brief's original `el.textContent` fallback missed entirely —
 * `<label for>`/wrapping-`<label>` association via the DOM `labels`
 * property. Without it, every `<input>` in this app (login email/password,
 * search) is unreachable by name: inputs have no text content of their own,
 * so `el.textContent?.trim()` is always `''` and the loop exhausts its
 * budget even though the field is one Tab away. That's a test-helper gap,
 * not an app defect — the inputs already have real `<label for>` markup
 * (see login-page.component.html:5,9 and :18,22).
 */
async function tabTo(page: Page, accessibleName: RegExp, max = 40): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const name = await page
      .locator(':focus')
      .evaluate((el) => {
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel;
        const labelledBy = el.getAttribute('aria-labelledby');
        if (labelledBy) {
          const text = labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
            .join(' ')
            .trim();
          if (text) return text;
        }
        const labels = (el as HTMLInputElement).labels;
        if (labels && labels.length > 0) {
          return Array.from(labels)
            .map((label) => label.textContent?.trim() ?? '')
            .join(' ')
            .trim();
        }
        return el.textContent?.trim() ?? el.getAttribute('placeholder') ?? '';
      })
      .catch(() => '');
    if (accessibleName.test(name)) return;
  }
  throw new Error(`never reached a control matching ${accessibleName} within ${max} tabs`);
}

test('journey 1: a user can sign in using only the keyboard', async ({ page }) => {
  await stubAuth(page, 'guest');
  // Wire shape verified against ApiErrorBody, libs/shared-data-models/src/lib/api-error.ts:8-13
  // — every API exception filter nests the code under `error`, not at the
  // top level. Auth.service.ts:~130 reads `err.error?.error?.code`; a flat
  // `{ code, message }` body (as the brief originally had it) silently falls
  // through to the generic INTERNAL branch instead of the INVALID branch.
  await page.route('**/api/auth/login', (route) =>
    void route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
      }),
    }),
  );

  await page.goto('/login');
  // Wait for the real route content before tabbing. This is a lazy-loaded
  // Angular route: `page.goto` resolves on the browser "load" event, which
  // fires once the initial shell script loads — not once the route chunk has
  // been fetched and the component has rendered. Pressing Tab before then
  // lands on nothing focusable (the DOM has no focusable content yet), and
  // since the loop only presses Tab once per iteration and never retries the
  // *first* press, it hangs waiting for a focus target that will never
  // appear. The other a11y specs avoid this via `readySelector`/`expectText`
  // on `A11yRoute` (a11y-routes.ts); this file has no such route table, so
  // the wait is inline here instead.
  await expect(page.getByLabel('Email')).toBeVisible();

  // Reach the email field by keyboard alone and type into it.
  await tabTo(page, /email/i);
  await expectVisibleFocus(page);
  await page.keyboard.type('student@example.com');

  await page.keyboard.press('Tab');
  await expectVisibleFocus(page);
  await page.keyboard.type('Aa1!aaaaaaaa');

  // Submit with Enter from within the form.
  await page.keyboard.press('Enter');

  // The failure must be ANNOUNCED, not merely rendered: it needs a live
  // region (or focus moved to it), or a screen-reader user never learns the
  // submission failed.
  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(/invalid/i);
});

test('journey 2: a student can go from catalogue to enrolled using only the keyboard', async ({ page }) => {
  await stubAuth(page, 'student');
  await stubJson(page, '**/api/categories', CATEGORIES);
  await stubJson(page, '**/api/catalog**', CATALOG_LIST);
  await stubJson(page, '**/api/catalog/c-1', COURSE_DETAIL);
  await stubJson(page, '**/api/enrollments/c-1', ENROLLMENT_STATUS_NONE);
  await page.route('**/api/enrollments', (route) =>
    void route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ courseId: COURSE_CARD.id, status: 'ACTIVE', enrolledAt: NOW }),
    }),
  );

  await page.goto('/catalog');
  // See journey 1's comment: wait for the lazy route's real content before
  // the first Tab press, or the loop can hang waiting on a focus target that
  // doesn't exist yet.
  await expect(page.getByText(COURSE_CARD.title)).toBeVisible();

  // Reach the course link and activate it with Enter.
  await tabTo(page, new RegExp(COURSE_CARD.title, 'i'));
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/catalog\/c-1/);

  // Focus must not be lost to <body> after client-side navigation — assert
  // it directly. tabTo alone would not catch a regression here: Tab from
  // <body> reaches the same first control as Tab from anywhere earlier in
  // the DOM, so a "focus reset to body" bug would still let tabTo succeed.
  await expect(page.locator('#main-content')).toBeFocused();
  // Course detail is also lazy-loaded — same wait-before-tabbing rationale
  // as journey 1, this time for the client-side (not full-page) navigation.
  await expect(page.getByRole('button', { name: /enrol|enroll/i })).toBeVisible();

  await tabTo(page, /enrol|enroll/i);
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');

  await expect(page.getByRole('button', { name: /leave|start learning/i }).first()).toBeVisible();
});
