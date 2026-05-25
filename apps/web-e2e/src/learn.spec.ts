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
  const email = `web-e2e-learn-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
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

/**
 * Seed a PUBLISHED course with one module, one READY-video lesson, and the
 * corresponding video document directly into Firestore.
 */
async function seedPublishedCourseWithReadyLesson(): Promise<{
  courseId: string;
  lessonId: string;
}> {
  const ts = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const courseId = `web-e2e-learn-course-${ts}`;
  const moduleId = `web-e2e-learn-module-${ts}`;
  const lessonId = `web-e2e-learn-lesson-${ts}`;
  const videoId = `web-e2e-learn-video-${ts}`;
  const instructorId = `web-e2e-learn-instructor-${ts}`;
  const now = new Date().toISOString();

  const db = admin.firestore();

  // 1. Seed the course
  await db.collection('courses').doc(courseId).set({
    id: courseId,
    title: 'Learn Wren E2E Course',
    description: 'A course for the lesson player e2e test.',
    instructorId,
    status: 'PUBLISHED',
    enrollmentCount: 0,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  // 2. Seed the module
  await db.doc(`courses/${courseId}/modules/${moduleId}`).set({
    id: moduleId,
    courseId,
    title: 'Module 1',
    order: 0,
    createdAt: now,
    updatedAt: now,
  });

  // 3. Seed the lesson (with videoId pointing at a READY video)
  await db.doc(`courses/${courseId}/modules/${moduleId}/lessons/${lessonId}`).set({
    id: lessonId,
    moduleId,
    title: 'Lesson 1',
    order: 0,
    videoId,
    createdAt: now,
    updatedAt: now,
  });

  // 4. Seed the video document in READY state
  await db.collection('videos').doc(videoId).set({
    id: videoId,
    ownerInstructorId: instructorId,
    courseId,
    lessonId,
    state: 'READY',
    source: {
      bucket: 'fake-source-bucket',
      path: `uploads/${videoId}/original.mp4`,
      sizeBytes: 1024,
    },
    output: {
      bucket: 'fake-output-bucket',
      manifestPath: `videos/${videoId}/manifest.m3u8`,
      durationSec: 30,
    },
    createdAt: now,
    updatedAt: now,
  });

  return { courseId, lessonId };
}

test('enrolled student can Start Learning from the course detail page', async ({ page }) => {
  const { email, password } = await registerVerifiedStudent();
  const { courseId, lessonId } = await seedPublishedCourseWithReadyLesson();

  // Sign in via the web login page.
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });

  // Open the course detail, enroll, then start learning.
  await page.goto(`/catalog/${courseId}`);
  await page.getByRole('button', { name: 'Enroll' }).click();
  await expect(page.getByTestId('start-learning')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('start-learning').click();

  // Lesson page assertions.
  await expect(page).toHaveURL(`/learn/${courseId}/${lessonId}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Lesson 1/);
  await expect(page.locator('lib-video-player video')).toBeVisible();
});

test('unauthenticated visit to /learn/:cid/:lid redirects to /login with redirect param', async ({
  page,
}) => {
  await page.goto('/learn/some-course/some-lesson');
  await page.waitForURL(/\/login(\?|$)/);
  await expect(page.url()).toMatch(/redirect=/);
});
