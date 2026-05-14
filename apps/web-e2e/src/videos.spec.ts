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

  // Delay the upload-session response so there is a guaranteed mid-flight
  // window in which the Cancel button is clickable, even with a tiny fixture.
  let releaseUploadSession: (() => void) | undefined;
  const uploadSessionPause = new Promise<void>((resolve) => {
    releaseUploadSession = resolve;
  });
  await page.route('**/upload-session', async (route) => {
    // Hold the request open until the test releases it.
    await uploadSessionPause;
    await route.continue();
  });

  const fileInput = page.locator('lib-video-upload input[type="file"]');
  await fileInput.setInputFiles(FIXTURE_MP4);

  // Wait for the component to enter its in-progress state.
  await expect(page.locator('lib-video-upload')).toContainText(/Preparing|Uploading/, {
    timeout: 10_000,
  });

  // Click Cancel while the upload-session call is still held open.
  await page.getByRole('button', { name: /cancel/i }).click();

  // Release the paused route (the request will be discarded anyway, but
  // resolving here lets Playwright's route machinery clean up cleanly).
  releaseUploadSession?.();

  // Component must return to idle (upload zone visible again).
  await expect(page.locator('lib-video-upload label.upload-zone')).toBeVisible({
    timeout: 10_000,
  });

  // No badge must appear — cancel must not complete the upload.
  await expect(page.locator('lib-video-state-badge')).toHaveCount(0);
});

test('badge transitions from Processing to Ready after fake-completer', async ({ page }) => {
  const { email, password } = await registerAndPromoteInstructor();
  await setupCourseWithLesson(page, email, password);

  const sessionResponse = page.waitForResponse(
    (r) => r.url().includes('/video/upload-session') && r.request().method() === 'POST',
  );
  await page.locator('lib-video-upload input[type="file"]').setInputFiles(FIXTURE_MP4);
  const sessionBody = (await (await sessionResponse).json()) as { videoId: string };
  const videoId = sessionBody.videoId;

  await expect(page.locator('lib-video-state-badge .badge')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('lib-video-state-badge .badge')).toContainText('Processing video', {
    timeout: 15_000,
  });

  const res = await page.request.post(`${API_BASE}/internal/fake-transcoder/complete/${videoId}`);
  expect(res.status()).toBe(204);

  await expect(page.locator('lib-video-state-badge .badge')).toContainText('Ready to publish', {
    timeout: 8_000,
  });
});

test('badge transitions to Failed copy after fake-fail', async ({ page }) => {
  const { email, password } = await registerAndPromoteInstructor();
  await setupCourseWithLesson(page, email, password);

  const sessionResponse = page.waitForResponse(
    (r) => r.url().includes('/video/upload-session') && r.request().method() === 'POST',
  );
  await page.locator('lib-video-upload input[type="file"]').setInputFiles(FIXTURE_MP4);
  const { videoId } = (await (await sessionResponse).json()) as { videoId: string };

  await expect(page.locator('lib-video-state-badge .badge')).toBeVisible({ timeout: 30_000 });
  await page.request.post(`${API_BASE}/internal/fake-transcoder/fail/${videoId}`, {
    data: { reason: 'codec unsupported' },
  });
  await expect(page.locator('lib-video-state-badge .badge')).toContainText('Transcoding failed', {
    timeout: 8_000,
  });
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

test('badge swaps to player when fake-completer flips state to READY', async ({ page }) => {
  const { email, password } = await registerAndPromoteInstructor();
  await setupCourseWithLesson(page, email, password);

  // Capture console errors so we can assert there are none during the swap.
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  const sessionResponse = page.waitForResponse(
    (r) => r.url().includes('/video/upload-session') && r.request().method() === 'POST',
  );
  await page.locator('lib-video-upload input[type="file"]').setInputFiles(FIXTURE_MP4);
  const { videoId } = (await (await sessionResponse).json()) as { videoId: string };

  // Wait for the TRANSCODING badge first
  await expect(page.locator('lib-video-state-badge .badge')).toBeVisible({ timeout: 30_000 });

  // Flip the video to READY via the fake completer
  const res = await page.request.post(
    `${API_BASE}/internal/fake-transcoder/complete/${videoId}`,
  );
  expect(res.status()).toBe(204);

  // The player must mount; the badge must unmount.
  const player = page.getByTestId('video-player');
  await expect(player).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('lib-video-state-badge')).toHaveCount(0);

  // No console errors during the swap.
  expect(consoleErrors).toEqual([]);
});

test('second instructor cannot access another instructor’s manifest', async ({ page, browser }) => {
  // Owner uploads + transcodes the video in context A.
  const owner = await registerAndPromoteInstructor();
  await setupCourseWithLesson(page, owner.email, owner.password);
  const sessionResponse = page.waitForResponse(
    (r) => r.url().includes('/video/upload-session') && r.request().method() === 'POST',
  );
  await page.locator('lib-video-upload input[type="file"]').setInputFiles(FIXTURE_MP4);
  const { videoId } = (await (await sessionResponse).json()) as { videoId: string };
  await page.request.post(`${API_BASE}/internal/fake-transcoder/complete/${videoId}`);
  await expect(page.getByTestId('video-player')).toBeVisible({ timeout: 10_000 });

  // The non-owner has no UI route to this lesson today, so verify the guard
  // directly via the API in a fresh browser context with a different session.
  const otherContext = await browser.newContext();
  const other = await registerAndPromoteInstructor();
  const loginRes = await otherContext.request.post(`${API_BASE}/auth/login`, {
    headers: { 'Content-Type': 'application/json' },
    data: { email: other.email, password: other.password },
  });
  expect(loginRes.status()).toBe(200);
  const probe = await otherContext.request.get(`${API_BASE}/playback/manifest/${videoId}`);
  expect(probe.status()).toBe(403);
  await otherContext.close();
});
