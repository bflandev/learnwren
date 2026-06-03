import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

import {
  API_BASE,
  initAdmin,
  registerAndPromoteInstructor,
  registerStudent,
  withAnonRequest,
} from './_helpers/auth';

initAdmin();

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function seedCourseWithModule(
  instructorId: string,
  opts: { status?: 'PUBLISHED' | 'DRAFT'; withLesson?: boolean } = {},
): Promise<{ cid: string; mid: string }> {
  const status = opts.status ?? 'PUBLISHED';
  const withLesson = opts.withLesson ?? true;
  const cid = uniqueId('notify-e2e');
  const mid = `${cid}-m1`;
  const now = new Date().toISOString();
  const db = admin.firestore();
  await db.collection('courses').doc(cid).set({
    id: cid, title: 'Notify e2e course', description: 'course', instructorId,
    status, enrollmentCount: 0, ...(status === 'PUBLISHED' ? { publishedAt: now } : {}),
    createdAt: now, updatedAt: now,
  });
  await db.collection('courses').doc(cid).collection('modules').doc(mid).set({
    id: mid, courseId: cid, title: 'New Module', order: 0, createdAt: now, updatedAt: now,
  });
  if (withLesson) {
    const lid = `${mid}-l1`;
    await db.collection('courses').doc(cid).collection('modules').doc(mid).collection('lessons').doc(lid).set({
      id: lid, moduleId: mid, title: 'Lesson 1', order: 0, createdAt: now, updatedAt: now,
    });
  }
  return { cid, mid };
}

test('owner notifies enrolled students; the module is stamped and the student is emailed', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const student = await registerStudent(request);
  const { cid, mid } = await seedCourseWithModule(instructor.uid);
  await request.post(`${API_BASE}/enrollments`, {
    headers: { cookie: student.cookieHeader },
    data: { courseId: cid },
  });

  const res = await request.post(`${API_BASE}/courses/${cid}/modules/${mid}/notify`, {
    headers: { cookie: instructor.cookieHeader },
  });
  expect(res.status()).toBe(200);
  expect((await res.json()).notifiedCount).toBe(1);

  const moduleSnap = await admin
    .firestore().collection('courses').doc(cid).collection('modules').doc(mid).get();
  expect(moduleSnap.data()?.['studentsNotifiedAt']).toBeTruthy();

  const studentEmail = (await admin.firestore().collection('users').doc(student.uid).get()).data()?.['email'] as string;
  const outbox = await request.get(
    `${API_BASE}/auth/_test/last-email?to=${encodeURIComponent(studentEmail)}&kind=new-module`,
  );
  expect(outbox.status()).toBe(200);
});

test('a non-owner instructor is forbidden', async ({ request }) => {
  const owner = await registerAndPromoteInstructor(request);
  const stranger = await registerAndPromoteInstructor(request);
  const { cid, mid } = await seedCourseWithModule(owner.uid);
  const res = await request.post(`${API_BASE}/courses/${cid}/modules/${mid}/notify`, {
    headers: { cookie: stranger.cookieHeader },
  });
  expect(res.status()).toBe(403);
});

test('an unauthenticated request is rejected', async ({ request }) => {
  const owner = await registerAndPromoteInstructor(request);
  const { cid, mid } = await seedCourseWithModule(owner.uid);
  await withAnonRequest(async (anon) => {
    const res = await anon.post(`${API_BASE}/courses/${cid}/modules/${mid}/notify`);
    expect(res.status()).toBe(401);
  });
});

test('notifying a module with no lessons is rejected', async ({ request }) => {
  const owner = await registerAndPromoteInstructor(request);
  const { cid, mid } = await seedCourseWithModule(owner.uid, { withLesson: false });
  const res = await request.post(`${API_BASE}/courses/${cid}/modules/${mid}/notify`, {
    headers: { cookie: owner.cookieHeader },
  });
  expect(res.status()).toBe(409);
  expect((await res.json()).error.code).toBe('MODULE_HAS_NO_LESSONS');
});

test('notifying a draft course is rejected', async ({ request }) => {
  const owner = await registerAndPromoteInstructor(request);
  const { cid, mid } = await seedCourseWithModule(owner.uid, { status: 'DRAFT' });
  const res = await request.post(`${API_BASE}/courses/${cid}/modules/${mid}/notify`, {
    headers: { cookie: owner.cookieHeader },
  });
  expect(res.status()).toBe(409);
  expect((await res.json()).error.code).toBe('COURSE_NOT_PUBLISHED_FOR_NOTIFY');
});

test('notifying twice is rejected as already-notified', async ({ request }) => {
  const owner = await registerAndPromoteInstructor(request);
  const { cid, mid } = await seedCourseWithModule(owner.uid);
  const first = await request.post(`${API_BASE}/courses/${cid}/modules/${mid}/notify`, {
    headers: { cookie: owner.cookieHeader },
  });
  expect(first.status()).toBe(200);
  const second = await request.post(`${API_BASE}/courses/${cid}/modules/${mid}/notify`, {
    headers: { cookie: owner.cookieHeader },
  });
  expect(second.status()).toBe(409);
  expect((await second.json()).error.code).toBe('MODULE_ALREADY_NOTIFIED');
});
