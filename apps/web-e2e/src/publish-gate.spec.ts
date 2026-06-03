import * as path from 'path';

import { expect, test, type Page } from '@playwright/test';
import * as admin from 'firebase-admin';

// Shared with apps/web-e2e/src/videos.spec.ts. A future refactor can extract
// these into apps/web-e2e/src/_helpers.ts; intentionally duplicated for now
// so slice D doesn't touch slice-C surface area.
if (admin.apps.length === 0) {
  process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099';
  process.env['FIRESTORE_EMULATOR_HOST'] = '127.0.0.1:8080';
  admin.initializeApp({ projectId: 'demo-learnwren' });
}

const API_BASE = 'http://localhost:3333/api';
const FIXTURE_MP4 = path.join(__dirname, 'fixtures', 'small-video.mp4');

async function registerAndPromoteInstructor(): Promise<{ email: string; password: string }> {
  const email = `pub-e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
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
  await page.getByTestId('title').fill(`Pub E2E ${Date.now()}`);
  await page.getByTestId('description').fill('e2e publish gate course');
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('course-meta')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('add-module').click();
  await page.getByTestId('new-module-title').fill('Publish Module');
  await page.getByTestId('add-module-confirm').click();
  await expect(page.getByTestId('module-title')).toHaveText('Publish Module', { timeout: 5_000 });
  await page.getByTestId('add-lesson').click();
  await page.getByTestId('add-lesson-input').fill('Publish Lesson');
  await page.getByTestId('add-lesson-input').press('Enter');
  await expect(page.getByTestId('lesson-title')).toHaveText('Publish Lesson', { timeout: 5_000 });
}

/** Upload the fixture + drive the fake transcoder to READY. Mirrors the slice-C
 *  upload helper in videos.spec.ts. */
async function uploadAndCompleteVideo(page: Page): Promise<void> {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('upload-video').click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles(FIXTURE_MP4);
  // Wait for the slice-A upload-complete badge:
  await expect(page.getByTestId('video-state-badge')).toBeVisible({ timeout: 30_000 });
  // Trigger the fake transcoder via its dev endpoint:
  await expect(page.getByTestId('video-state-badge')).toHaveAttribute('data-video-id', /.+/);
  const vid = await page.getByTestId('video-state-badge').getAttribute('data-video-id');
  const fakeRes = await fetch(`${API_BASE}/internal/fake-transcoder/complete/${vid}`, { method: 'POST' });
  // 204: TranscoderEventsController.handle returns acted=true → No Content.
  expect(fakeRes.status).toBe(204);
  // Wait for the player swap (slice C):
  await expect(page.getByTestId('video-player')).toBeVisible({ timeout: 15_000 });
}

test.describe('Publish gate', () => {
  test('round-trips DRAFT → PUBLISHED → DRAFT through unpublish', async ({ page }) => {
    const { email, password } = await registerAndPromoteInstructor();
    await setupCourseWithLesson(page, email, password);
    await uploadAndCompleteVideo(page);

    await expect(page.getByTestId('publish-bar-pill')).toHaveText('DRAFT');
    await expect(page.getByTestId('eligibility-panel')).toContainText('Ready to publish');
    await expect(page.getByTestId('publish-bar-primary')).toBeEnabled();

    await page.getByTestId('publish-bar-primary').click();
    await expect(page.getByTestId('publish-bar-pill')).toHaveText('PUBLISHED');
    await expect(page.getByTestId('eligibility-panel')).toHaveCount(0);
    await expect(page.getByTestId('publish-bar-primary')).toContainText('Unpublish');

    await page.getByTestId('publish-bar-primary').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-go').click();
    await expect(page.getByTestId('publish-bar-pill')).toHaveText('DRAFT');
  });

  test('Publish button is disabled when a lesson has no video', async ({ page }) => {
    const { email, password } = await registerAndPromoteInstructor();
    await setupCourseWithLesson(page, email, password);
    // Skip uploadAndCompleteVideo — the lesson has no video.
    await expect(page.getByTestId('publish-bar-pill')).toHaveText('DRAFT');
    await expect(page.getByTestId('eligibility-panel')).toContainText('to fix');
    await expect(page.getByTestId('publish-bar-primary')).toBeDisabled();
  });

  test('Archive + Restore round-trip', async ({ page }) => {
    const { email, password } = await registerAndPromoteInstructor();
    await setupCourseWithLesson(page, email, password);
    // Course is DRAFT (no eligibility needed for archive).
    await expect(page.getByTestId('publish-bar-archive')).toBeEnabled();
    await page.getByTestId('publish-bar-archive').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-go').click();
    await expect(page.getByTestId('publish-bar-pill')).toHaveText('ARCHIVED');
    await expect(page.getByTestId('publish-bar-primary')).toContainText('Restore');
    await page.getByTestId('publish-bar-primary').click();  // confirm-less
    await expect(page.getByTestId('publish-bar-pill')).toHaveText('DRAFT');
  });
});
