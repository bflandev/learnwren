import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

import { ensureEmulatorAdmin } from './_helpers/emulator-admin';

ensureEmulatorAdmin();

const API_BASE = 'http://localhost:3333/api';

/** Register a STUDENT and mark them verified so they can log in. */
async function registerVerifiedStudent(): Promise<{ email: string; password: string }> {
  const email = `web-e2e-landing-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
  const password = 'Aa1!aaaaaaaa';
  const reg = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName: 'S' }),
  });
  expect(reg.status).toBe(201);
  const { uid } = (await reg.json()) as { uid: string };
  await admin.auth().updateUser(uid, { emailVerified: true });
  return { email, password };
}

test('a logged-out visitor sees the landing page at /', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /Slow lessons, made for small communities/i,
    }),
  ).toBeVisible();
});

test('the hero "Start for free" CTA navigates to /register', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Start for free' }).first().click();
  await expect(page).toHaveURL(/\/register$/);
});

test('the hero "Browse the shelf" CTA navigates to /catalog', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Browse the shelf' }).click();
  await expect(page).toHaveURL(/\/catalog$/);
});

test('an authenticated user is redirected from / to /dashboard', async ({ page }) => {
  const { email, password } = await registerVerifiedStudent();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard$/);

  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard$/);
});
