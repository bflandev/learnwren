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

// ──────────────────────── Seed helpers ────────────────────────

/** Seed a course document straight into Firestore. */
async function seedCourse(args: {
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  instructorId: string;
}): Promise<string> {
  const id = `learn-e2e-${args.status}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();
  await admin
    .firestore()
    .collection('courses')
    .doc(id)
    .set({
      id,
      title: 'Learn e2e course',
      description: 'course',
      instructorId: args.instructorId,
      status: args.status,
      enrollmentCount: 0,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  return id;
}

/** Seed a module document under a course. */
async function seedModule(courseId: string): Promise<string> {
  const mid = `learn-e2e-mod-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();
  await admin
    .firestore()
    .collection('courses')
    .doc(courseId)
    .collection('modules')
    .doc(mid)
    .set({
      id: mid,
      courseId,
      title: 'M1',
      order: 0,
      createdAt: now,
      updatedAt: now,
    });
  return mid;
}

/** Seed a lesson document under a course/module. Optionally seeds a video and links it. */
async function seedLesson(args: {
  courseId: string;
  moduleId: string;
  videoState?: 'READY' | 'TRANSCODING';
}): Promise<{ lessonId: string; videoId: string | null }> {
  const lid = `learn-e2e-les-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();

  let videoId: string | null = null;
  if (args.videoState) {
    const vid = `learn-e2e-vid-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await admin
      .firestore()
      .collection('videos')
      .doc(vid)
      .set({
        id: vid,
        ownerInstructorId: 'learn-e2e-instructor',
        courseId: args.courseId,
        lessonId: lid,
        state: args.videoState,
        source: { bucket: 'demo-learnwren.appspot.com', path: `videos/${vid}/source.mp4` },
        createdAt: now,
        updatedAt: now,
      });
    videoId = vid;
  }

  await admin
    .firestore()
    .collection('courses')
    .doc(args.courseId)
    .collection('modules')
    .doc(args.moduleId)
    .collection('lessons')
    .doc(lid)
    .set({
      id: lid,
      moduleId: args.moduleId,
      title: 'L1',
      order: 0,
      ...(videoId ? { videoId } : {}),
      createdAt: now,
      updatedAt: now,
    });

  return { lessonId: lid, videoId };
}

/** Seed an enrollment document (composite ID `${userId}__${courseId}`). */
async function seedEnrollment(args: {
  userId: string;
  courseId: string;
  status: 'ACTIVE' | 'WITHDRAWN';
}): Promise<void> {
  const enrollmentId = `${args.userId}__${args.courseId}`;
  const now = new Date().toISOString();
  await admin
    .firestore()
    .collection('enrollments')
    .doc(enrollmentId)
    .set({
      id: enrollmentId,
      userId: args.userId,
      courseId: args.courseId,
      status: args.status,
      progress: [],
      withdrawnAt: null,
      createdAt: now,
      updatedAt: now,
    });
}

// ──────────────────────── Tests ────────────────────────

test('200 for an enrolled student on a PUBLISHED course with a READY video', async ({
  request,
}) => {
  const instructor = await registerAndPromoteInstructor(request);
  const student = await registerStudent(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const moduleId = await seedModule(courseId);
  const { lessonId } = await seedLesson({ courseId, moduleId, videoState: 'READY' });
  await seedEnrollment({ userId: student.uid, courseId, status: 'ACTIVE' });

  const res = await request.get(`${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}`, {
    headers: { cookie: student.cookieHeader },
  });
  expect(res.status()).toBe(200);

  const body = (await res.json()) as {
    course: { id: string; status: string };
    lesson: { id: string; videoState: string };
  };
  expect(body.course.id).toBe(courseId);
  expect(body.course.status).toBe('PUBLISHED');
  expect(body.lesson.id).toBe(lessonId);
  expect(body.lesson.videoState).toBe('READY');
});

test('403 NOT_LESSON_OWNER for an authenticated but unenrolled student', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const student = await registerStudent(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const moduleId = await seedModule(courseId);
  const { lessonId } = await seedLesson({ courseId, moduleId });
  // Intentionally NOT seeding an enrollment.

  const res = await request.get(`${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}`, {
    headers: { cookie: student.cookieHeader },
  });
  expect(res.status()).toBe(403);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe('NOT_LESSON_OWNER');
});

test('200 for the course owner (instructor) on a DRAFT course', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const courseId = await seedCourse({ status: 'DRAFT', instructorId: instructor.uid });
  const moduleId = await seedModule(courseId);
  const { lessonId } = await seedLesson({ courseId, moduleId });

  const res = await request.get(`${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}`, {
    headers: { cookie: instructor.cookieHeader },
  });
  expect(res.status()).toBe(200);

  const body = (await res.json()) as { course: { status: string }; lesson: { id: string } };
  expect(body.course.status).toBe('DRAFT');
  expect(body.lesson.id).toBe(lessonId);
});

test('403 for an enrolled student on a DRAFT course', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const student = await registerStudent(request);
  const courseId = await seedCourse({ status: 'DRAFT', instructorId: instructor.uid });
  const moduleId = await seedModule(courseId);
  const { lessonId } = await seedLesson({ courseId, moduleId });
  await seedEnrollment({ userId: student.uid, courseId, status: 'ACTIVE' });

  const res = await request.get(`${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}`, {
    headers: { cookie: student.cookieHeader },
  });
  expect(res.status()).toBe(403);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe('NOT_LESSON_OWNER');
});

test('401 unauthenticated request is rejected', async ({ request }) => {
  const res = await request.get(`${API_BASE}/learn/courses/c/lessons/l`);
  expect(res.status()).toBe(401);
});

test('404 LESSON_NOT_FOUND when the lesson belongs to a different course', async ({ request }) => {
  const instructorA = await registerAndPromoteInstructor(request);
  const instructorB = await registerAndPromoteInstructor(request);
  const student = await registerStudent(request);

  // Course A — student is enrolled here.
  const courseIdA = await seedCourse({ status: 'PUBLISHED', instructorId: instructorA.uid });
  const moduleIdA = await seedModule(courseIdA);
  await seedLesson({ courseId: courseIdA, moduleId: moduleIdA });
  await seedEnrollment({ userId: student.uid, courseId: courseIdA, status: 'ACTIVE' });

  // Course B — the lesson actually lives here; student is NOT enrolled.
  const courseIdB = await seedCourse({ status: 'PUBLISHED', instructorId: instructorB.uid });
  const moduleIdB = await seedModule(courseIdB);
  const { lessonId: lessonIdB } = await seedLesson({ courseId: courseIdB, moduleId: moduleIdB });

  // Ask for courseA/lessonB — courseA exists but the lesson is not in any of its modules.
  const res = await request.get(
    `${API_BASE}/learn/courses/${courseIdA}/lessons/${lessonIdB}`,
    { headers: { cookie: student.cookieHeader } },
  );
  expect(res.status()).toBe(404);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe('LESSON_NOT_FOUND');
});

test('404 LESSON_NOT_FOUND for a missing lesson id', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const student = await registerStudent(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  await seedModule(courseId);
  await seedEnrollment({ userId: student.uid, courseId, status: 'ACTIVE' });

  const res = await request.get(
    `${API_BASE}/learn/courses/${courseId}/lessons/does-not-exist`,
    { headers: { cookie: student.cookieHeader } },
  );
  expect(res.status()).toBe(404);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe('LESSON_NOT_FOUND');
});

test('404 LESSON_NOT_FOUND for a missing course id', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);

  const res = await request.get(
    `${API_BASE}/learn/courses/course-does-not-exist/lessons/lesson-does-not-exist`,
    { headers: { cookie: instructor.cookieHeader } },
  );
  expect(res.status()).toBe(404);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe('LESSON_NOT_FOUND');
});
