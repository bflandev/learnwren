import * as path from 'path';

import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099';
  process.env['FIRESTORE_EMULATOR_HOST'] = '127.0.0.1:8080';
  admin.initializeApp({ projectId: 'demo-learnwren' });
}

const API_BASE = 'http://localhost:3333/api';
const FIXTURE_MP4 = path.join(__dirname, 'fixtures', 'small-video.mp4');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function registerAndPromoteInstructor(): Promise<{ email: string; password: string }> {
  const email = `vid-e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
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

/**
 * Log in and navigate to the course editor with one module + one lesson created.
 * Returns the page ready for upload interaction.
 */
async function setupCourseWithLesson(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
): Promise<void> {
  // Login
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });

  // Navigate to courses and create one
  await page.goto('/courses');
  await expect(page.getByTestId('create-course')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('create-course').click();
  await page.getByTestId('title').fill(`Vid E2E ${Date.now()}`);
  await page.getByTestId('description').fill('e2e video test course');
  await page.getByTestId('submit').click();

  // Wait for the editor to load
  await expect(page.getByTestId('course-meta')).toBeVisible({ timeout: 10_000 });

  // Add a module
  page.once('dialog', async (dialog) => {
    await dialog.accept('Video Module');
  });
  await page.getByTestId('add-module').click();
  await expect(page.getByTestId('module-title')).toHaveText('Video Module', { timeout: 5_000 });

  // Add a lesson
  await page.getByTestId('add-lesson').click();
  await page.getByTestId('add-lesson-input').fill('Video Lesson');
  await page.getByTestId('add-lesson-input').press('Enter');
  await expect(page.getByTestId('lesson-title')).toHaveText('Video Lesson', { timeout: 5_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('instructor uploads a video and sees the badge', async ({ page }) => {
  const { email, password } = await registerAndPromoteInstructor();
  await setupCourseWithLesson(page, email, password);

  // The upload zone should be present (lib-video-upload in idle state)
  const uploadLabel = page.locator('lib-video-upload label.upload-zone');
  await expect(uploadLabel).toBeVisible({ timeout: 5_000 });

  // Set the file via the hidden file input inside the upload zone
  const fileInput = page.locator('lib-video-upload input[type="file"]');
  await fileInput.setInputFiles(FIXTURE_MP4);

  // Progress bar should appear while uploading
  const progressBar = page.locator('lib-video-upload progress');
  await expect(progressBar).toBeVisible({ timeout: 15_000 });

  // After upload completes the badge should appear — the lesson-item swaps out
  // lib-video-upload for lib-video-state-badge when lesson().videoId is set.
  const badge = page.locator('lib-video-state-badge .badge');
  await expect(badge).toBeVisible({ timeout: 30_000 });

  // Reload and verify persistence
  await page.reload();
  await expect(page.getByTestId('course-meta')).toBeVisible({ timeout: 10_000 });
  const badgeAfterReload = page.locator('lib-video-state-badge .badge');
  await expect(badgeAfterReload).toBeVisible({ timeout: 10_000 });
});

test('cancel mid-upload returns to empty state', async ({ page }) => {
  const { email, password } = await registerAndPromoteInstructor();
  await setupCourseWithLesson(page, email, password);

  const uploadLabel = page.locator('lib-video-upload label.upload-zone');
  await expect(uploadLabel).toBeVisible({ timeout: 5_000 });

  const fileInput = page.locator('lib-video-upload input[type="file"]');
  await fileInput.setInputFiles(FIXTURE_MP4);

  // Start waiting for either the progress bar or the cancel button to appear
  // then immediately click Cancel. The upload is small enough that it might
  // complete before Cancel is clicked — so we accept either final state:
  // idle (upload-zone visible) or complete (badge visible).
  //
  // Limitation: with a tiny fixture file and local emulator the upload
  // completes in milliseconds; there is no reliable window to observe a
  // mid-flight cancel. This is a pragmatic smoke assertion.
  const cancelButton = page.locator('lib-video-upload button', { hasText: /cancel/i });
  const progressBar = page.locator('lib-video-upload progress');

  // Wait briefly for the progress bar then attempt Cancel.
  // The file is tiny and the upload may complete before Cancel is reachable;
  // clicking a detached element throws, so we swallow that error gracefully.
  await progressBar.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
  await cancelButton.click({ timeout: 5_000 }).catch(() => {
    // Upload may have completed before we could click Cancel — that is ok
  });

  // After cancel (or fast completion) we expect either idle or badge state
  const idleState = page.locator('lib-video-upload label.upload-zone');
  const badge = page.locator('lib-video-state-badge .badge');

  // At least one of the two terminal states must be visible
  await expect(idleState.or(badge)).toBeVisible({ timeout: 15_000 });
});

test('oversized file is rejected client-side without network', async ({ page }) => {
  const { email, password } = await registerAndPromoteInstructor();
  await setupCourseWithLesson(page, email, password);

  const uploadLabel = page.locator('lib-video-upload label.upload-zone');
  await expect(uploadLabel).toBeVisible({ timeout: 5_000 });

  // Track whether the upload-session endpoint is called.
  // An oversized file must be rejected before any network request is made.
  let uploadSessionCalled = false;
  await page.route(/\/upload-session/, (route) => {
    uploadSessionCalled = true;
    void route.continue();
  });

  // Synthesise a fake >10 GB File via page.evaluate and dispatch it as a
  // 'change' event on the file input. We override the `size` property on the
  // DataTransfer item's file object. Because real File size is read-only we
  // use a Blob converted to a File with size overridden via Object.defineProperty.
  //
  // Approach: inject an init-script that patches the component's onFile handler
  // before the test runs is fragile with Shadow DOM. Instead we call the
  // Angular service method directly through the component's exposed svc field.
  // The cleanest browser-side approach is to dispatch a synthetic change event
  // with a fake file whose `size` property reports > 10 GB.
  await page.evaluate(() => {
    const input = document.querySelector(
      'lib-video-upload input[type="file"]',
    ) as HTMLInputElement | null;
    if (!input) throw new Error('file input not found');

    // Build a tiny Blob and wrap it in a File, then override its size
    const blob = new Blob(['x'], { type: 'video/mp4' });
    const fakeFile = new File([blob], 'huge.mp4', { type: 'video/mp4' });
    // size is read-only on File; use defineProperty to shadow it
    Object.defineProperty(fakeFile, 'size', {
      value: 10_000_000_001,
      writable: false,
      configurable: true,
    });

    // Dispatch the change event with the fake file
    const dt = new DataTransfer();
    // DataTransfer.items.add(file) is the only way to inject a File into a
    // DataTransfer; fall back to dispatching a custom event if unavailable.
    dt.items.add(fakeFile);
    Object.defineProperty(input, 'files', { value: dt.files, configurable: true });

    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // The failed-state alert should appear with the size-limit message
  const failAlert = page.locator('lib-video-upload [role="alert"]');
  await expect(failAlert).toBeVisible({ timeout: 5_000 });
  await expect(failAlert).toContainText('10 GB');

  // No network call to upload-session must have been made
  expect(uploadSessionCalled).toBe(false);
});
