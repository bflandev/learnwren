import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099';
  process.env['FIRESTORE_EMULATOR_HOST'] = '127.0.0.1:8080';
  admin.initializeApp({ projectId: 'demo-learnwren' });
}

const API_BASE = 'http://localhost:3333/api';

/** Register a STUDENT and mark the address verified so they can log in. */
async function registerVerifiedStudent(): Promise<{ email: string; password: string }> {
  const email = `web-e2e-enr-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
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

/** Seed a PUBLISHED course straight into Firestore and return its id. */
async function seedPublishedCourse(): Promise<string> {
  const id = `web-e2e-enr-course-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();
  await admin
    .firestore()
    .collection('courses')
    .doc(id)
    .set({
      id,
      title: 'Enrolment Journey Course',
      description: 'A course to enrol in.',
      instructorId: 'web-e2e-enr-instructor',
      status: 'PUBLISHED',
      enrollmentCount: 0,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  return id;
}

test('a logged-in student can enrol and then leave a course', async ({ page }) => {
  const { email, password } = await registerVerifiedStudent();
  const courseId = await seedPublishedCourse();

  // Log in via the web login page.
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });

  // Open the course and enrol.
  await page.goto(`/catalog/${courseId}`);
  await page.getByRole('button', { name: 'Enrol' }).click();
  await expect(page.getByText('Enrolled', { exact: false })).toBeVisible({ timeout: 10_000 });

  // Leave the course via the confirmation dialog.
  await page.getByRole('button', { name: 'Leave course' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave course' }).click();
  await expect(page.getByRole('button', { name: 'Enrol' })).toBeVisible({ timeout: 10_000 });
});

test('a guest who clicks Enrol is sent to login and auto-enrolled on return', async ({
  page,
}) => {
  const { email, password } = await registerVerifiedStudent();
  const courseId = await seedPublishedCourse();

  // Visit the course as a guest and click Enrol.
  await page.goto(`/catalog/${courseId}`);
  await page.getByRole('button', { name: 'Enrol' }).click();
  await page.waitForURL(/\/login/, { timeout: 10_000 });

  // Log in — the page should return to the course and auto-enrol.
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  await page.waitForURL(new RegExp(`/catalog/${courseId}`), { timeout: 10_000 });
  await expect(page.getByText('Enrolled', { exact: false })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Leave course' })).toBeVisible();
});
