import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

import { ensureEmulatorAdmin } from './_helpers/emulator-admin';

ensureEmulatorAdmin();

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
async function seedPublishedCourse(
  opts: { instructor?: { uid: string; displayName: string; photoUrl?: string } } = {},
): Promise<string> {
  const id = `web-e2e-enr-course-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();
  const instructorId = opts.instructor?.uid ?? 'web-e2e-enr-instructor';

  // If an instructor profile was specified, seed the users/{uid} doc so that
  // the catalog hydration picks up the displayName + photoUrl on the course
  // detail page (the only place the catalog reads outside the courses
  // collection — see InstructorDirectory).
  if (opts.instructor) {
    await admin
      .firestore()
      .collection('users')
      .doc(opts.instructor.uid)
      .set(
        {
          id: opts.instructor.uid,
          displayName: opts.instructor.displayName,
          ...(opts.instructor.photoUrl ? { photoUrl: opts.instructor.photoUrl } : {}),
          updatedAt: now,
        },
        { merge: true },
      );
  }

  await admin
    .firestore()
    .collection('courses')
    .doc(id)
    .set({
      id,
      title: 'Enrollment Journey Course',
      description: 'A course to enroll in.',
      instructorId,
      status: 'PUBLISHED',
      enrollmentCount: 0,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  return id;
}

test('a logged-in student can enroll and then leave a course', async ({ page }) => {
  const { email, password } = await registerVerifiedStudent();
  // Seed an instructor with a photoUrl so the course detail page renders the
  // <img> avatar branch of hlm-avatar. We use a stable data: URL — no upload
  // round-trip needed, and the catalog API echoes the raw photoUrl through.
  const instructorUid = `web-e2e-enr-instructor-${Date.now()}`;
  const photoUrl =
    'data:image/svg+xml;base64,' +
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#0af"/></svg>',
    ).toString('base64');
  const courseId = await seedPublishedCourse({
    instructor: { uid: instructorUid, displayName: 'Ada Lovelace', photoUrl },
  });

  // Log in via the web login page.
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });

  // Open the course and enroll.
  await page.goto(`/catalog/${courseId}`);

  // UC-01-03 Slice B avatar render: the instructor card on the course detail
  // page renders an hlm-avatar. With a photoUrl seeded above, the <img> branch
  // should win over the projected initials span.
  const instructorAvatar = page.locator('[data-test="instructor-card"] hlm-avatar');
  await expect(instructorAvatar).toBeVisible();
  await expect(instructorAvatar.locator('img')).toBeVisible();
  await expect(page.getByTestId('instructor-avatar-initials')).toHaveCount(0);

  await page.getByRole('button', { name: 'Enroll' }).click();
  await expect(page.getByText('Enrolled', { exact: false })).toBeVisible({ timeout: 10_000 });

  // Leave the course via the shared confirm dialog (CDK alertdialog).
  await page.getByRole('button', { name: 'Leave course' }).click();
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  await page.getByTestId('confirm-go').click();
  await expect(page.getByRole('button', { name: 'Enroll' })).toBeVisible({ timeout: 10_000 });
});

test('a guest who clicks Enroll is sent to login and auto-enrolled on return', async ({
  page,
}) => {
  const { email, password } = await registerVerifiedStudent();
  const courseId = await seedPublishedCourse();

  // Visit the course as a guest and click Enroll.
  await page.goto(`/catalog/${courseId}`);

  // UC-01-03 Slice B avatar render — initials fallback path: no users/{uid}
  // doc is seeded for this test's instructorId, so InstructorDirectory falls
  // back to displayName "Instructor" and hlm-avatar projects the initials span.
  const instructorAvatar = page.locator('[data-test="instructor-card"] hlm-avatar');
  await expect(instructorAvatar).toBeVisible();
  await expect(page.getByTestId('instructor-avatar-initials')).toBeVisible();
  await expect(instructorAvatar.locator('img')).toHaveCount(0);

  await page.getByRole('button', { name: 'Enroll' }).click();
  await page.waitForURL(/\/login/, { timeout: 10_000 });

  // Client-side router navigation flips the URL before Angular finishes
  // wiring the reactive form — without this wait, the first fill() can race
  // the formControlName directive and silently fail to bind. Waiting for the
  // Sign in button to be both visible and disabled (its initial empty-form
  // state) is the cleanest "form is mounted" signal.
  const submit = page.getByRole('button', { name: /sign in/i });
  await expect(submit).toBeDisabled();

  // Log in — the page should return to the course and auto-enroll.
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await expect(submit).toBeEnabled();
  await submit.click();

  await page.waitForURL(new RegExp(`/catalog/${courseId}`), { timeout: 10_000 });
  await expect(page.getByText('Enrolled', { exact: false })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Leave course' })).toBeVisible();
});
