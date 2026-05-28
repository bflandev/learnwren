import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099';
  process.env['FIRESTORE_EMULATOR_HOST'] = '127.0.0.1:8080';
  admin.initializeApp({ projectId: 'demo-learnwren' });
}

const API_BASE = 'http://localhost:3333/api';

/**
 * Register a STUDENT with a known display name, mark them verified, and
 * return credentials.  The display name "Etta Wren" gives initials "EW" so
 * after editing to "Etta Updated" the chip should show "EU" — a change we
 * can assert without ambiguity.
 */
async function registerVerifiedStudentWithKnownName(): Promise<{
  email: string;
  password: string;
  displayName: string;
}> {
  const email = `web-e2e-profile-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
  const password = 'Aa1!aaaaaaaa';
  const displayName = 'Etta Wren';

  const reg = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName }),
  });
  expect(reg.status).toBe(201);
  const { uid } = (await reg.json()) as { uid: string };
  await admin.auth().updateUser(uid, { emailVerified: true });

  return { email, password, displayName };
}

test('UC-01-03 — user edits displayName and biography; header updates without reload', async ({
  page,
}) => {
  const { email, password, displayName } = await registerVerifiedStudentWithKnownName();

  // Log in via the web login page.
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });

  // Initials chip ("EW") is the entry point — click it to reach /settings/profile.
  const chip = page.getByRole('img', {
    name: new RegExp(`Profile settings for ${displayName}`),
  });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText('EW');
  await chip.click();
  await expect(page).toHaveURL(/\/settings\/profile$/);

  // Form pre-fills from GET.
  await expect(page.getByLabel('Display name')).toHaveValue(displayName);
  await expect(page.getByLabel('Biography')).toHaveValue('');

  // Edit and save.
  await page.getByLabel('Display name').fill('Etta Updated');
  await page.getByLabel('Biography').fill('I teach botany.');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Profile updated.')).toBeVisible();

  // Header chip reflects the new display name immediately (no reload).
  const updatedChip = page.getByRole('img', { name: /Profile settings for Etta Updated/ });
  await expect(updatedChip).toBeVisible();
  await expect(updatedChip).toHaveText('EU');

  // Persistence: reload the page and confirm the form values stuck.
  await page.reload();
  await expect(page.getByLabel('Display name')).toHaveValue('Etta Updated');
  await expect(page.getByLabel('Biography')).toHaveValue('I teach botany.');
});
