/**
 * Hermetic Playwright specs for the self-hosted email-action page
 * (/auth/action, US-09-04 Slice D3): verify-email, change-email and
 * reset-password links, plus a rejected token.
 *
 * POST /api/auth/email-action is stubbed with page.route, so no backend or
 * emulator is involved; only the SPA on :4200 runs.
 */
import { expect, test, type Page } from '@playwright/test';

import { stubAuth } from './_helpers/route-stubs';

const NEW_PASSWORD = 'Brand-new-passw0rd!';

/** Stub the email-action endpoint; resolves with the request bodies it saw. */
async function stubEmailAction(
  page: Page,
  response: { status: number; body?: unknown },
): Promise<Record<string, unknown>[]> {
  const seen: Record<string, unknown>[] = [];
  await page.route('**/api/auth/email-action', async (route) => {
    seen.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: response.status,
      contentType: 'application/json',
      body: response.body === undefined ? '' : JSON.stringify(response.body),
    });
  });
  return seen;
}

test.describe('/auth/action', () => {
  test('verify-email link verifies the account', async ({ page }) => {
    await stubAuth(page, 'guest');
    const seen = await stubEmailAction(page, { status: 204 });

    await page.goto('/auth/action?mode=verify-email&token=tok-verify');

    await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();
    expect(seen).toEqual([{ mode: 'verify-email', token: 'tok-verify' }]);
  });

  test('change-email link lands on the email-changed page', async ({ page }) => {
    await stubAuth(page, 'student');
    const seen = await stubEmailAction(page, { status: 204 });
    // Hold the confirm call open so the page stays on email-changed.
    await page.route('**/api/profile/email/confirm', () => undefined);

    await page.goto('/auth/action?mode=change-email&token=tok-change');

    await expect(page).toHaveURL(/\/settings\/profile\/email-changed$/);
    await expect(page.getByText('Finishing your email change')).toBeVisible();
    expect(seen).toEqual([{ mode: 'change-email', token: 'tok-change' }]);
  });

  test('reset-password link shows the form and sends the new password', async ({ page }) => {
    await stubAuth(page, 'guest');
    const seen = await stubEmailAction(page, { status: 204 });

    await page.goto('/auth/action?mode=reset-password&token=tok-reset');
    await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible();
    // Nothing is redeemed until the form is submitted.
    expect(seen).toEqual([]);

    await page.getByLabel('New password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Set new password' }).click();

    await expect(page).toHaveURL(/\/login\?reset=ok$/);
    expect(seen).toEqual([
      { mode: 'reset-password', token: 'tok-reset', newPassword: NEW_PASSWORD },
    ]);
  });

  test('a rejected token shows the invalid-link state', async ({ page }) => {
    await stubAuth(page, 'guest');
    await stubEmailAction(page, {
      status: 400,
      body: { error: { code: 'TOKEN_INVALID_OR_EXPIRED', message: 'invalid' } },
    });

    await page.goto('/auth/action?mode=verify-email&token=tok-stale');

    await expect(
      page.getByRole('heading', { name: 'This link is invalid or has expired' }),
    ).toBeVisible();
  });

  test('a link without a token is invalid without calling the api', async ({ page }) => {
    await stubAuth(page, 'guest');
    const seen = await stubEmailAction(page, { status: 204 });

    await page.goto('/auth/action?mode=verify-email');

    await expect(
      page.getByRole('heading', { name: 'This link is invalid or has expired' }),
    ).toBeVisible();
    expect(seen).toEqual([]);
  });
});
