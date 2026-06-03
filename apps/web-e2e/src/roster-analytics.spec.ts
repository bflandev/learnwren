import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099';
  process.env['FIRESTORE_EMULATOR_HOST'] = '127.0.0.1:8080';
  admin.initializeApp({ projectId: 'demo-learnwren' });
}

const API_BASE = 'http://localhost:3333/api';

async function registerAndPromoteInstructor(): Promise<{ email: string; password: string }> {
  const email = `web-e2e-ra-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
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

// Covers the two owner-guarded instructor-dashboard surfaces (US-07-01 students
// roster, US-07-02 analytics): the guarded routes load and render their empty
// state for a brand-new course with no enrollments.
test('instructor can open the students roster and analytics for their course', async ({ page }) => {
  const { email, password } = await registerAndPromoteInstructor();

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });

  // Create a course.
  await page.goto('/courses');
  await page.getByTestId('create-course').click();
  await page.getByTestId('title').fill('Roster/Analytics Course');
  await page.getByTestId('description').fill('Short.');
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('course-meta')).toBeVisible({ timeout: 10_000 });

  const cid = page.url().match(/\/courses\/([^/]+)\/edit/)?.[1];
  expect(cid).toBeTruthy();

  // Students roster: owner-guarded route renders the empty state.
  await page.goto(`/courses/${cid}/students`);
  await expect(page.getByRole('heading', { name: 'Enrolled students' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('No students enrolled yet.')).toBeVisible({ timeout: 10_000 });

  // Analytics: owner-guarded route renders the enrolled-total card at zero.
  await page.goto(`/courses/${cid}/analytics`);
  await expect(page.getByRole('heading', { name: 'Course analytics' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('enrolled-total')).toHaveText('0', { timeout: 10_000 });
});
