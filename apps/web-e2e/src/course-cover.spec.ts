import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

import { ensureEmulatorAdmin } from './_helpers/emulator-admin';

ensureEmulatorAdmin();

const API_BASE = 'http://localhost:3333/api';

async function registerAndPromoteInstructor(): Promise<{ email: string; password: string }> {
  const email = `web-e2e-cover-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
  const password = 'Aa1!aaaaaaaa';
  const reg = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName: 'I' }),
  });
  expect(reg.status).toBe(201);
  const { uid } = (await reg.json()) as { uid: string };
  await admin.auth().updateUser(uid, { emailVerified: true });
  await admin.auth().setCustomUserClaims(uid, { role: 'INSTRUCTOR' });
  await admin.firestore().collection('users').doc(uid).update({ role: 'INSTRUCTOR' });
  return { email, password };
}

test('instructor uploads a cover and sees it persist across reload', async ({ page }) => {
  const creds = await registerAndPromoteInstructor();

  // Sign in via the SPA
  await page.goto('/login');
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Password').fill(creds.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });

  // Create a course via the UI
  await page.goto('/courses/new');
  await page.getByTestId('title').fill('Cover E2E');
  await page.getByTestId('description').fill('Short.');
  await page.getByTestId('submit').click();
  await page.waitForURL(/\/courses\/.+\/edit/, { timeout: 10_000 });

  await expect(page.getByText('Cover image')).toBeVisible();

  const fixturePath = join(__dirname, 'fixtures', 'cover-1280x720.jpg');
  await page.setInputFiles('[data-testid="cover-file-input"]', fixturePath);

  const img = page.locator('lib-course-cover-uploader lw-cover img.lw-cover-image');
  await expect(img).toBeVisible({ timeout: 10_000 });
  const src = await img.getAttribute('src');
  expect(src).toMatch(/course-covers%2F.+%2Fcover\.jpg\?alt=media&v=/);

  await page.reload();
  await expect(page.locator('lib-course-cover-uploader lw-cover img.lw-cover-image')).toHaveAttribute(
    'src',
    src!,
  );
});
