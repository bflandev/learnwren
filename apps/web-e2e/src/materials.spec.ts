import { expect, test, type Page } from '@playwright/test';
import * as admin from 'firebase-admin';

// Mirrors the auth + course setup helpers in publish-gate.spec.ts. Intentionally
// duplicated (see the note in publish-gate.spec.ts) to avoid touching that file.
if (admin.apps.length === 0) {
  process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099';
  process.env['FIRESTORE_EMULATOR_HOST'] = '127.0.0.1:8080';
  admin.initializeApp({ projectId: 'demo-learnwren' });
}

const API_BASE = 'http://localhost:3333/api';

async function registerAndPromoteInstructor(): Promise<{ email: string; password: string }> {
  const email = `mat-e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
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

async function setupCourseWithLesson(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
  await page.goto('/courses');
  await expect(page.getByTestId('create-course')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('create-course').click();
  await page.getByTestId('title').fill(`Materials E2E ${Date.now()}`);
  await page.getByTestId('description').fill('e2e materials course');
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('course-meta')).toBeVisible({ timeout: 10_000 });
  page.once('dialog', async (d) => { await d.accept('Materials Module'); });
  await page.getByTestId('add-module').click();
  await expect(page.getByTestId('module-title')).toHaveText('Materials Module', { timeout: 5_000 });
  await page.getByTestId('add-lesson').click();
  await page.getByTestId('add-lesson-input').fill('Materials Lesson');
  await page.getByTestId('add-lesson-input').press('Enter');
  await expect(page.getByTestId('lesson-title')).toHaveText('Materials Lesson', { timeout: 5_000 });
}

test('instructor uploads, downloads, and removes a lesson material', async ({ page }) => {
  const { email, password } = await registerAndPromoteInstructor();
  await setupCourseWithLesson(page, email, password);

  await expect(page.getByTestId('materials-list')).toBeVisible();
  await expect(page.getByTestId('materials-empty')).toBeVisible();

  await page
    .getByTestId('material-add')
    .locator('input[type=file]')
    .setInputFiles({
      name: 'study-guide.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\nweb e2e fixture\n%%EOF'),
    });

  await expect(page.getByTestId('material-name')).toHaveText('study-guide.pdf', {
    timeout: 15_000,
  });

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('material-download').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('study-guide.pdf');

  await page.getByTestId('material-remove').click();
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  await page.getByTestId('confirm-go').click();
  await expect(page.getByTestId('materials-empty')).toBeVisible({ timeout: 10_000 });
});

test('an unsupported file type is rejected with an inline message', async ({ page }) => {
  const { email, password } = await registerAndPromoteInstructor();
  await setupCourseWithLesson(page, email, password);

  await page
    .getByTestId('material-add')
    .locator('input[type=file]')
    .setInputFiles({
      name: 'malware.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('MZ fake executable'),
    });

  await expect(page.getByTestId('material-upload-error')).toContainText(/unsupported/i, {
    timeout: 10_000,
  });
  await expect(page.getByTestId('materials-empty')).toBeVisible();
});
