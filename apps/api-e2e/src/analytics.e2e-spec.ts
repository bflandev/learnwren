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

async function seedCourseWithReadyVideo(
  instructorId: string,
): Promise<{ cid: string; lessonIds: string[] }> {
  const cid = `analytics-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();
  const db = admin.firestore();
  await db.collection('courses').doc(cid).set({
    id: cid,
    title: 'Analytics e2e course',
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
      .set({ id: lid, moduleId: mid, title: `Lesson ${i + 1}`, order: i, createdAt: now, updatedAt: now });
  }
  // A READY video for l1 with a known duration; l2 has no video.
  const vid = `${cid}-v1`;
  await db.collection('videos').doc(vid).set({
    id: vid,
    ownerInstructorId: instructorId,
    courseId: cid,
    lessonId: lessonIds[0],
    state: 'READY',
    source: { bucket: 'demo-learnwren.appspot.com', path: `videos/${vid}/source.mp4` },
    output: { bucket: 'demo-learnwren.appspot.com', manifestPath: `videos/${vid}/master.m3u8`, durationSec: 200 },
    createdAt: now,
    updatedAt: now,
  });
  return { cid, lessonIds };
}

test('owner sees computed course + per-lesson analytics', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const student = await registerStudent(request);
  const { cid, lessonIds } = await seedCourseWithReadyVideo(instructor.uid);

  await request.post(`${API_BASE}/enrollments`, {
    headers: { cookie: student.cookieHeader },
    data: { courseId: cid },
  });
  // Complete l1 and save a position of 100s on it.
  await request.post(`${API_BASE}/learn/courses/${cid}/lessons/${lessonIds[0]}/complete`, {
    headers: { cookie: student.cookieHeader },
  });
  await request.post(`${API_BASE}/learn/courses/${cid}/lessons/${lessonIds[0]}/position`, {
    headers: { cookie: student.cookieHeader },
    data: { seconds: 100 },
  });

  const res = await request.get(`${API_BASE}/courses/${cid}/analytics`, {
    headers: { cookie: instructor.cookieHeader },
  });
  expect(res.status()).toBe(200);
  const view = await res.json();
  expect(view.enrolledTotal).toBe(1);
  expect(view.totalLessons).toBe(2);
  expect(view.averageCompletionPercent).toBe(50);
  expect(view.newEnrollments.last7Days).toBeGreaterThanOrEqual(1);

  const l1 = view.lessons.find((l: { lessonId: string }) => l.lessonId === lessonIds[0]);
  expect(l1.completionRatePercent).toBe(100);
  expect(l1.durationSec).toBe(200);
  expect(l1.averageWatchedSeconds).toBe(100);
  expect(l1.averageWatchedPercent).toBe(50);

  const l2 = view.lessons.find((l: { lessonId: string }) => l.lessonId === lessonIds[1]);
  expect(l2.durationSec).toBeNull();
  expect(l2.completionRatePercent).toBe(0);
});

test('a non-owner instructor is forbidden', async ({ request }) => {
  const owner = await registerAndPromoteInstructor(request);
  const stranger = await registerAndPromoteInstructor(request);
  const { cid } = await seedCourseWithReadyVideo(owner.uid);

  const res = await request.get(`${API_BASE}/courses/${cid}/analytics`, {
    headers: { cookie: stranger.cookieHeader },
  });
  expect(res.status()).toBe(403);
});

test('an unauthenticated request is rejected', async ({ request }) => {
  const owner = await registerAndPromoteInstructor(request);
  const { cid } = await seedCourseWithReadyVideo(owner.uid);

  await withAnonRequest(async (anon) => {
    const res = await anon.get(`${API_BASE}/courses/${cid}/analytics`);
    expect(res.status()).toBe(401);
  });
});

test('a demoted instructor (now STUDENT) is forbidden even on their own course', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const { cid } = await seedCourseWithReadyVideo(instructor.uid);

  await admin.auth().setCustomUserClaims(instructor.uid, { role: 'STUDENT' });
  await admin.firestore().collection('users').doc(instructor.uid).update({ role: 'STUDENT' });
  const email = (await admin.auth().getUser(instructor.uid)).email!;
  const relogin = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password: 'Aa1!aaaaaaaa' },
  });
  expect(relogin.status()).toBe(200);
  const demotedCookie = `__session=${relogin.headers()['set-cookie']!.match(/__session=([^;]+)/)![1]}`;

  const res = await request.get(`${API_BASE}/courses/${cid}/analytics`, {
    headers: { cookie: demotedCookie },
  });
  expect(res.status()).toBe(403);
});
