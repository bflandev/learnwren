import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

import { ensureEmulatorAdmin } from './_helpers/emulator-admin';

ensureEmulatorAdmin();

const API_BASE = 'http://localhost:3333/api';

/**
 * Register a verified user with display name "Etta Wren" (initials "EW"),
 * which matches the convention in uc-01-03-text-profile.spec.ts and gives a
 * deterministic initials chip to assert against before/after picture upload.
 */
async function registerVerifiedUserWithKnownName(): Promise<{
  email: string;
  password: string;
  displayName: string;
}> {
  const email = `web-e2e-picture-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
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

test('UC-01-03 Slice B — user uploads profile picture, it persists across reload, and can be removed', async ({
  page,
}) => {
  const { email, password, displayName } = await registerVerifiedUserWithKnownName();

  // Log in via the SPA.
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });

  // The header chip is an <a role="img"> wrapping <hlm-avatar>. Initially the
  // avatar has no photoUrl, so it projects the initials span
  // (data-testid="header-avatar-initials").
  const headerChip = page.getByRole('img', {
    name: new RegExp(`Profile settings for ${displayName}`),
  });
  await expect(headerChip).toBeVisible();
  await expect(headerChip.locator('[data-testid="header-avatar-initials"]')).toHaveText('EW');
  await expect(headerChip.locator('hlm-avatar img')).toHaveCount(0);

  // Click the chip to land on /settings/profile.
  await headerChip.click();
  await expect(page).toHaveURL(/\/settings\/profile$/);

  // The uploader hides the file input (`hidden` attribute), so target it by
  // selector rather than role. accept="image/jpeg,image/png".
  const fileInput = page.locator('lib-profile-picture-uploader input[type="file"]');
  const fixturePath = join(__dirname, 'fixtures', 'avatar-512.jpg');
  await fileInput.setInputFiles(fixturePath);

  // After successful upload the header chip switches from initials to <img>.
  await expect(headerChip.locator('hlm-avatar img')).toBeVisible({ timeout: 10_000 });
  await expect(headerChip.locator('[data-testid="header-avatar-initials"]')).toHaveCount(0);

  // Grab the src so we can assert it survives reload. The preceding
  // toHaveAttribute('src', /.+/) guarantees the attribute is a non-empty string.
  await expect(headerChip.locator('hlm-avatar img')).toHaveAttribute('src', /.+/);
  const uploadedSrc = await headerChip.locator('hlm-avatar img').getAttribute('src');

  // The uploader's own preview should also be an image now.
  await expect(
    page.locator('lib-profile-picture-uploader img.lw-avatar-image'),
  ).toBeVisible();

  // Reload — the picture persists (read from Firestore via /me on bootstrap).
  await page.reload();
  await expect(headerChip.locator('hlm-avatar img')).toBeVisible({ timeout: 10_000 });
  await expect(headerChip.locator('hlm-avatar img')).toHaveAttribute(
    'src',
    uploadedSrc!,
  );

  // Remove the picture. The "Remove picture" button only appears when a
  // photo is present (see profile-picture-uploader.component.html).
  await page.getByRole('button', { name: /remove picture/i }).click();

  // Header chip falls back to initials and the <img> is gone.
  await expect(headerChip.locator('[data-testid="header-avatar-initials"]')).toHaveText('EW', {
    timeout: 10_000,
  });
  await expect(headerChip.locator('hlm-avatar img')).toHaveCount(0);
});
