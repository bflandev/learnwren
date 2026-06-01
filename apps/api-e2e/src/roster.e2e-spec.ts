// NOTE: Run `pnpm emulators` and `pnpm start:api` before executing this suite.
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

async function seedPublishedCourse(instructorId: string): Promise<{ cid: string; lessonIds: string[] }> {
  const cid = `roster-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();
  const db = admin.firestore();
  await db.collection('courses').doc(cid).set({
    id: cid,
    title: 'Roster e2e course',
    description: 'course',
    instructorId,
    status: 'PUBLISHED',
    enrollmentCount: 0,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  const mid = `${cid}-m1`;
  await db.collection('courses').doc(cid).collection('modules').doc(mid).set({
    id: mid,
    courseId: cid,
    title: 'Module 1',
    order: 0,
    createdAt: now,
    updatedAt: now,
  });
  const lessonIds = [`${cid}-l1`, `${cid}-l2`];
  for (let i = 0; i < lessonIds.length; i += 1) {
    const lid = lessonIds[i] as string;
    await db
      .collection('courses')
      .doc(cid)
      .collection('modules')
      .doc(mid)
      .collection('lessons')
      .doc(lid)
      .set({
        id: lid,
        moduleId: mid,
        title: `Lesson ${i + 1}`,
        order: i,
        createdAt: now,
        updatedAt: now,
      });
  }
  return { cid, lessonIds };
}

test('owner sees an ACTIVE enrollee with computed progress', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const student = await registerStudent(request);
  const { cid, lessonIds } = await seedPublishedCourse(instructor.uid);

  // Enroll the student via the public API, then complete one of two lessons.
  await request.post(`${API_BASE}/enrollments`, {
    headers: { cookie: student.cookieHeader },
    data: { courseId: cid },
  });
  await request.post(`${API_BASE}/learn/courses/${cid}/lessons/${lessonIds[0]}/complete`, {
    headers: { cookie: student.cookieHeader },
  });

  const res = await request.get(`${API_BASE}/courses/${cid}/students`, {
    headers: { cookie: instructor.cookieHeader },
  });
  expect(res.status()).toBe(200);
  const view = await res.json();
  expect(view.totalLessons).toBe(2);
  expect(view.students).toHaveLength(1);
  expect(view.students[0]).toMatchObject({
    userId: student.uid,
    completedLessons: 1,
    totalLessons: 2,
    progressPercent: 50,
  });
  expect(typeof view.students[0].email).toBe('string');
});

test('a non-owner instructor is forbidden', async ({ request }) => {
  const owner = await registerAndPromoteInstructor(request);
  const stranger = await registerAndPromoteInstructor(request);
  const { cid } = await seedPublishedCourse(owner.uid);

  const res = await request.get(`${API_BASE}/courses/${cid}/students`, {
    headers: { cookie: stranger.cookieHeader },
  });
  expect(res.status()).toBe(403);
});

test('an unauthenticated request is rejected', async ({ request }) => {
  const owner = await registerAndPromoteInstructor(request);
  const { cid } = await seedPublishedCourse(owner.uid);

  await withAnonRequest(async (anon) => {
    const res = await anon.get(`${API_BASE}/courses/${cid}/students`);
    expect(res.status()).toBe(401);
  });
});
