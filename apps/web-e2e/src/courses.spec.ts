import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099';
  process.env['FIRESTORE_EMULATOR_HOST'] = '127.0.0.1:8080';
  admin.initializeApp({ projectId: 'demo-learnwren' });
}

const API_BASE = 'http://localhost:3333/api';

async function registerAndPromoteInstructor(): Promise<{ email: string; password: string }> {
  const email = `web-e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
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

test('instructor can create a course, add a module + lesson, rename, delete', async ({ page }) => {
  const { email, password } = await registerAndPromoteInstructor();

  // Log in via the web login page
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  // Successful login navigates to /dashboard — wait for that before moving on
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });

  // Navigate to courses
  await page.goto('/courses');
  await expect(page.getByTestId('create-course')).toBeVisible({ timeout: 10_000 });

  // Create a course
  await page.getByTestId('create-course').click();
  await page.getByTestId('title').fill('Web-e2e Course');
  await page.getByTestId('description').fill('Short.');
  await page.getByTestId('submit').click();

  // Editor loads
  await expect(page.getByTestId('course-meta')).toBeVisible({ timeout: 10_000 });

  // Add a module via the prompt
  page.once('dialog', async (dialog) => {
    await dialog.accept('Module One');
  });
  await page.getByTestId('add-module').click();

  // Module appears
  await expect(page.getByTestId('module-title')).toHaveText('Module One', { timeout: 5_000 });

  // Add a lesson — commit on blur to avoid the editor's double-fire
  // (keydown.enter + blur both call commitAddLesson on the same input).
  await page.getByTestId('add-lesson').click();
  await page.getByTestId('add-lesson-input').fill('Lesson One');
  await page.getByTestId('add-lesson-input').blur();
  await expect(page.getByTestId('lesson-title')).toHaveText('Lesson One');

  // Delete the lesson
  await page.getByTestId('lesson-delete').click();
  await page.getByTestId('confirm').click();
  await expect(page.getByTestId('lesson-title')).toHaveCount(0);

  // Delete the module
  await page.getByTestId('module-delete').click();
  await page.getByTestId('confirm').click();
  await expect(page.getByTestId('module-item')).toHaveCount(0);

  // Reload and confirm persistence
  await page.reload();
  await expect(page.getByTestId('course-meta')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('module-item')).toHaveCount(0);
});

test('STUDENT is redirected away from /courses', async ({ page, request }) => {
  const email = `student-${Date.now()}@example.com`;
  const password = 'Aa1!aaaaaaaa';
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password, displayName: 'S' },
  });
  expect(reg.status()).toBe(201);
  const { uid } = (await reg.json()) as { uid: string };
  await admin.auth().updateUser(uid, { emailVerified: true });
  // Still STUDENT — no promotion

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });

  await page.goto('/courses');
  // canMatch guard sends non-INSTRUCTOR users to '/' which redirects to '/login'
  await expect(page).not.toHaveURL(/\/courses/);
});
