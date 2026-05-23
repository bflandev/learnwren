// NOTE: Run `pnpm emulators` and `pnpm start:api` before executing this suite.
import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

import {
  API_BASE,
  initAdmin,
  registerAndPromoteInstructor,
  registerStudent,
} from './_helpers/auth';

initAdmin();

/** Seed a course document straight into Firestore. */
async function seedCourse(
  status: 'DRAFT' | 'PUBLISHED',
  instructorId: string,
  enrollmentCount = 0,
): Promise<string> {
  const id = `enr-e2e-${status}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();
  await admin
    .firestore()
    .collection('courses')
    .doc(id)
    .set({
      id,
      title: 'Enrollment e2e course',
      description: 'course',
      instructorId,
      status,
      enrollmentCount,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  return id;
}

/** Seed a READY material straight into Firestore. */
async function seedMaterial(courseId: string, ownerInstructorId: string): Promise<string> {
  const id = `enr-e2e-mat-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();
  await admin
    .firestore()
    .collection('materials')
    .doc(id)
    .set({
      id,
      ownerInstructorId,
      courseId,
      lessonId: 'enr-e2e-lesson',
      displayName: 'Notes',
      originalFilename: 'notes.pdf',
      extension: 'pdf',
      contentType: 'application/pdf',
      sizeBytes: 1024,
      state: 'READY',
      storage: { bucket: 'demo-learnwren.appspot.com', path: `materials/${id}/source.pdf` },
      createdAt: now,
      updatedAt: now,
    });
  return id;
}

test('enroll then read status reflects ACTIVE and increments the course counter', async ({
  request,
}) => {
  const student = await registerStudent(request);
  const courseId = await seedCourse('PUBLISHED', 'some-instructor', 4);

  const post = await request.post(`${API_BASE}/enrollments`, {
    headers: { cookie: student.cookieHeader },
    data: { courseId },
  });
  expect(post.status()).toBe(201);
  expect((await post.json()).status).toBe('ACTIVE');

  const get = await request.get(`${API_BASE}/enrollments/${courseId}`, {
    headers: { cookie: student.cookieHeader },
  });
  expect(get.status()).toBe(200);
  const view = await get.json();
  expect(view.enrollment.status).toBe('ACTIVE');
  expect(view.isOwner).toBe(false);

  const courseSnap = await admin.firestore().collection('courses').doc(courseId).get();
  expect(courseSnap.data()?.['enrollmentCount']).toBe(5);
});

test('unenroll soft-deletes the enrollment and re-enroll restores it', async ({ request }) => {
  const student = await registerStudent(request);
  const courseId = await seedCourse('PUBLISHED', 'some-instructor');

  await request.post(`${API_BASE}/enrollments`, {
    headers: { cookie: student.cookieHeader },
    data: { courseId },
  });

  const del = await request.delete(`${API_BASE}/enrollments/${courseId}`, {
    headers: { cookie: student.cookieHeader },
  });
  expect(del.status()).toBe(204);

  const afterDelete = await request.get(`${API_BASE}/enrollments/${courseId}`, {
    headers: { cookie: student.cookieHeader },
  });
  expect((await afterDelete.json()).enrollment.status).toBe('WITHDRAWN');

  const reEnroll = await request.post(`${API_BASE}/enrollments`, {
    headers: { cookie: student.cookieHeader },
    data: { courseId },
  });
  expect(reEnroll.status()).toBe(201);
  expect((await reEnroll.json()).status).toBe('ACTIVE');
});

test('enroll on an unpublished course is rejected with 409', async ({ request }) => {
  const student = await registerStudent(request);
  const courseId = await seedCourse('DRAFT', 'some-instructor');

  const res = await request.post(`${API_BASE}/enrollments`, {
    headers: { cookie: student.cookieHeader },
    data: { courseId },
  });
  expect(res.status()).toBe(409);
  expect((await res.json()).error.code).toBe('COURSE_NOT_AVAILABLE');
});

test('the course owner cannot enroll in their own course', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const courseId = await seedCourse('PUBLISHED', instructor.uid);

  const res = await request.post(`${API_BASE}/enrollments`, {
    headers: { cookie: instructor.cookieHeader },
    data: { courseId },
  });
  expect(res.status()).toBe(409);
  expect((await res.json()).error.code).toBe('CANNOT_ENROLL_OWN_COURSE');
});

test('unenroll when not enrolled is rejected with 404', async ({ request }) => {
  const student = await registerStudent(request);
  const courseId = await seedCourse('PUBLISHED', 'some-instructor');

  const res = await request.delete(`${API_BASE}/enrollments/${courseId}`, {
    headers: { cookie: student.cookieHeader },
  });
  expect(res.status()).toBe(404);
  expect((await res.json()).error.code).toBe('NOT_ENROLLED');
});

test('all enrollment endpoints reject an unauthenticated caller with 401', async ({
  request,
}) => {
  const courseId = await seedCourse('PUBLISHED', 'some-instructor');

  expect((await request.post(`${API_BASE}/enrollments`, { data: { courseId } })).status()).toBe(
    401,
  );
  expect((await request.get(`${API_BASE}/enrollments/${courseId}`)).status()).toBe(401);
  expect((await request.delete(`${API_BASE}/enrollments/${courseId}`)).status()).toBe(401);
});

test('an enrolled student can reach the material download-url endpoint', async ({
  request,
}) => {
  const student = await registerStudent(request);
  const courseId = await seedCourse('PUBLISHED', 'some-instructor');
  const matId = await seedMaterial(courseId, 'some-instructor');

  await request.post(`${API_BASE}/enrollments`, {
    headers: { cookie: student.cookieHeader },
    data: { courseId },
  });

  const res = await request.get(`${API_BASE}/materials/${matId}/download-url`, {
    headers: { cookie: student.cookieHeader },
  });
  // The guard must let the enrolled student through — never a 403.
  expect(res.status()).not.toBe(403);
});

test('a non-enrolled non-owner is 403 from the material download-url endpoint', async ({
  request,
}) => {
  const student = await registerStudent(request);
  const courseId = await seedCourse('PUBLISHED', 'some-instructor');
  const matId = await seedMaterial(courseId, 'some-instructor');

  const res = await request.get(`${API_BASE}/materials/${matId}/download-url`, {
    headers: { cookie: student.cookieHeader },
  });
  expect(res.status()).toBe(403);
});
