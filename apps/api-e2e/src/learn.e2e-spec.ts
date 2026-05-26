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

test('404 LESSON_NOT_FOUND for an authenticated but unenrolled student (kills the cross-course membership oracle)', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const student = await registerStudent(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const moduleId = await seedModule(courseId);
  const { lessonId } = await seedLesson({ courseId, moduleId });
  // Intentionally NOT seeding an enrollment.

  // Probe-style access (no prior relationship) returns 404 so an attacker
  // cannot distinguish "lesson exists, I'm not enrolled" from "lesson does
  // not exist". A 403 is reserved for users with an existing relationship
  // (WITHDRAWN, or ACTIVE on a now-unpublished course) — see the
  // revocation tests below.
  const res = await request.get(`${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}`, {
    headers: { cookie: student.cookieHeader },
  });
  expect(res.status()).toBe(404);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe('LESSON_NOT_FOUND');
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

// ─────────────────────── Revocation regression tests ────────────────────────
// Mirror the playback-side siblings in playback.e2e-spec.ts. These confirm
// that an ACTIVE enrolment on a now-unpublished course, and a WITHDRAWN
// enrolment on a still-PUBLISHED course, both surface 403 NOT_LESSON_OWNER
// on the NEW /learn endpoint — i.e. revocation actually reaches the
// student-playback path, not just /playback/manifest.

test('403 NOT_LESSON_OWNER for an enrolled student after the instructor unpublishes the course', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const student = await registerStudent(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const moduleId = await seedModule(courseId);
  const { lessonId } = await seedLesson({ courseId, moduleId });
  await seedEnrollment({ userId: student.uid, courseId, status: 'ACTIVE' });

  // Sanity: student has access while the course is PUBLISHED.
  const ok = await request.get(`${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}`, {
    headers: { cookie: student.cookieHeader },
  });
  expect(ok.status()).toBe(200);

  // Instructor unpublishes (PUBLISHED → DRAFT).
  const unpublish = await request.post(`${API_BASE}/courses/${courseId}/unpublish`, {
    headers: { cookie: instructor.cookieHeader },
  });
  expect(unpublish.status()).toBe(200);

  // The student's enrolment record still exists (ACTIVE), so they get the
  // honest 403 "you lost access" signal rather than the 404 we'd hand to a
  // probe-style attacker.
  const res = await request.get(`${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}`, {
    headers: { cookie: student.cookieHeader },
  });
  expect(res.status()).toBe(403);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe('NOT_LESSON_OWNER');
});

test('403 NOT_LESSON_OWNER for a student after they withdraw from the course', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const student = await registerStudent(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const moduleId = await seedModule(courseId);
  const { lessonId } = await seedLesson({ courseId, moduleId });
  await seedEnrollment({ userId: student.uid, courseId, status: 'ACTIVE' });

  // Sanity: access works while enrolment is ACTIVE.
  const ok = await request.get(`${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}`, {
    headers: { cookie: student.cookieHeader },
  });
  expect(ok.status()).toBe(200);

  // Student withdraws (ACTIVE → WITHDRAWN; the record is soft-deleted, not removed).
  const unenrol = await request.delete(`${API_BASE}/enrollments/${courseId}`, {
    headers: { cookie: student.cookieHeader },
  });
  expect(unenrol.status()).toBe(204);

  // Their WITHDRAWN record is still there, so they get 403 — not the 404
  // an unenrolled probe-style attacker would see.
  const res = await request.get(`${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}`, {
    headers: { cookie: student.cookieHeader },
  });
  expect(res.status()).toBe(403);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe('NOT_LESSON_OWNER');
});

// ──────────────────────── POST /complete tests ────────────────────────

test('POST /complete is idempotent and reflected in subsequent GET', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const student = await registerStudent(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const moduleId = await seedModule(courseId);
  const { lessonId } = await seedLesson({ courseId, moduleId, videoState: 'READY' });
  await seedEnrollment({ userId: student.uid, courseId, status: 'ACTIVE' });

  // First POST /complete — expect 200 with a completedAt timestamp.
  const res1 = await request.post(
    `${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}/complete`,
    { headers: { cookie: student.cookieHeader } },
  );
  expect(res1.status()).toBe(200);
  const body1 = (await res1.json()) as { completedAt: string };
  expect(typeof body1.completedAt).toBe('string');
  const firstCompletedAt = body1.completedAt;

  // Second POST /complete — idempotent; must return the same completedAt.
  const res2 = await request.post(
    `${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}/complete`,
    { headers: { cookie: student.cookieHeader } },
  );
  expect(res2.status()).toBe(200);
  const body2 = (await res2.json()) as { completedAt: string };
  expect(body2.completedAt).toBe(firstCompletedAt);

  // GET the lesson — progress.completedAt must match.
  const getRes = await request.get(
    `${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}`,
    { headers: { cookie: student.cookieHeader } },
  );
  expect(getRes.status()).toBe(200);
  const getBody = (await getRes.json()) as { progress: { completedAt: string } };
  expect(getBody.progress.completedAt).toBe(firstCompletedAt);
});

test('POST /complete returns 403 NOT_ENROLLED_LESSON for the course owner', async ({
  request,
}) => {
  const instructor = await registerAndPromoteInstructor(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const moduleId = await seedModule(courseId);
  const { lessonId } = await seedLesson({ courseId, moduleId, videoState: 'READY' });

  const res = await request.post(
    `${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}/complete`,
    { headers: { cookie: instructor.cookieHeader } },
  );
  expect(res.status()).toBe(403);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
    'NOT_ENROLLED_LESSON',
  );
});

test('POST /complete returns 403 NOT_ENROLLED_LESSON after the student withdraws', async ({
  request,
}) => {
  const instructor = await registerAndPromoteInstructor(request);
  const student = await registerStudent(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const moduleId = await seedModule(courseId);
  const { lessonId } = await seedLesson({ courseId, moduleId, videoState: 'READY' });

  // Seed ACTIVE then overwrite with WITHDRAWN.
  await seedEnrollment({ userId: student.uid, courseId, status: 'ACTIVE' });
  await seedEnrollment({ userId: student.uid, courseId, status: 'WITHDRAWN' });

  const res = await request.post(
    `${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}/complete`,
    { headers: { cookie: student.cookieHeader } },
  );
  expect(res.status()).toBe(403);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
    'NOT_ENROLLED_LESSON',
  );
});

test('completion persists across WITHDRAWN → ACTIVE re-enrolment', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const student = await registerStudent(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const moduleId = await seedModule(courseId);
  const { lessonId } = await seedLesson({ courseId, moduleId, videoState: 'READY' });

  // Enrol via the real API so enrollmentCount is correct (required for the
  // withdraw endpoint to work correctly when it decrements the counter).
  const enrollRes = await request.post(`${API_BASE}/enrollments`, {
    headers: { cookie: student.cookieHeader },
    data: { courseId },
  });
  expect(enrollRes.status()).toBe(201);

  // Mark the lesson complete and capture the timestamp.
  const completeRes = await request.post(
    `${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}/complete`,
    { headers: { cookie: student.cookieHeader } },
  );
  expect(completeRes.status()).toBe(200);
  const { completedAt: firstCompletedAt } = (await completeRes.json()) as {
    completedAt: string;
  };

  // Withdraw.
  const withdrawRes = await request.delete(`${API_BASE}/enrollments/${courseId}`, {
    headers: { cookie: student.cookieHeader },
  });
  expect(withdrawRes.status()).toBe(204);

  // Re-enrol.
  const reEnrolRes = await request.post(`${API_BASE}/enrollments`, {
    headers: { cookie: student.cookieHeader },
    data: { courseId },
  });
  expect(reEnrolRes.status()).toBe(201);

  // GET the lesson — completion must have survived the round-trip.
  const getRes = await request.get(
    `${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}`,
    { headers: { cookie: student.cookieHeader } },
  );
  expect(getRes.status()).toBe(200);
  const getBody = (await getRes.json()) as { progress: { completedAt: string } };
  expect(getBody.progress.completedAt).toBe(firstCompletedAt);
});

test('POST /complete returns 401 without a session cookie', async ({ request }) => {
  const res = await request.post(
    `${API_BASE}/learn/courses/any-course/lessons/any-lesson/complete`,
  );
  expect(res.status()).toBe(401);
});

// ──────────────────────── outline tests (Slice D) ────────────────────────

test('outline.completedAt reflects mark-complete for the enrolled caller', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const student = await registerStudent(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const moduleId = await seedModule(courseId);

  // Seed two lessons — lessonA will be marked complete, lessonB will remain incomplete.
  const { lessonId: lessonAId } = await seedLesson({ courseId, moduleId, videoState: 'READY' });
  const { lessonId: lessonBId } = await seedLesson({ courseId, moduleId, videoState: 'READY' });
  await seedEnrollment({ userId: student.uid, courseId, status: 'ACTIVE' });

  // Mark lesson A complete.
  const completeRes = await request.post(
    `${API_BASE}/learn/courses/${courseId}/lessons/${lessonAId}/complete`,
    { headers: { cookie: student.cookieHeader } },
  );
  expect(completeRes.status()).toBe(200);

  // Fetch lesson B's view — the outline must include both lessons with correct completedAt.
  const viewRes = await request.get(
    `${API_BASE}/learn/courses/${courseId}/lessons/${lessonBId}`,
    { headers: { cookie: student.cookieHeader } },
  );
  expect(viewRes.status()).toBe(200);
  const view = (await viewRes.json()) as {
    outline: { modules: Array<{ lessons: Array<{ id: string; completedAt: string | null }> }> };
  };

  expect(view.outline).toBeDefined();
  const rows = view.outline.modules.flatMap((m) => m.lessons);
  const rowA = rows.find((r) => r.id === lessonAId);
  const rowB = rows.find((r) => r.id === lessonBId);

  // Lesson A was marked complete — completedAt must be a date string in 2026 or later.
  expect(rowA?.completedAt).toMatch(/2026|2027/);
  // Lesson B was never marked complete — completedAt must be null.
  expect(rowB?.completedAt).toBeNull();
});

// ──────────────────────── POST /position tests (Slice C) ────────────────────────

test.describe('POST /api/learn/courses/:cid/lessons/:lid/position', () => {
  test('200 with returned lastWatchedSeconds; idempotent on equal repeat', async ({ request }) => {
    const instructor = await registerAndPromoteInstructor(request);
    const student = await registerStudent(request);
    const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
    const moduleId = await seedModule(courseId);
    const { lessonId } = await seedLesson({ courseId, moduleId, videoState: 'READY' });
    await seedEnrollment({ userId: student.uid, courseId, status: 'ACTIVE' });

    const r1 = await request.post(
      `${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}/position`,
      { data: { seconds: 30 }, headers: { cookie: student.cookieHeader } },
    );
    expect(r1.status()).toBe(200);
    expect(await r1.json()).toEqual({ lastWatchedSeconds: 30 });

    const r2 = await request.post(
      `${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}/position`,
      { data: { seconds: 30 }, headers: { cookie: student.cookieHeader } },
    );
    expect(r2.status()).toBe(200);
    expect(await r2.json()).toEqual({ lastWatchedSeconds: 30 });
  });

  test('monotonic regression: smaller seconds returns the stored larger value and does not overwrite', async ({
    request,
  }) => {
    const instructor = await registerAndPromoteInstructor(request);
    const student = await registerStudent(request);
    const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
    const moduleId = await seedModule(courseId);
    const { lessonId } = await seedLesson({ courseId, moduleId, videoState: 'READY' });
    await seedEnrollment({ userId: student.uid, courseId, status: 'ACTIVE' });

    await request.post(
      `${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}/position`,
      { data: { seconds: 100 }, headers: { cookie: student.cookieHeader } },
    );
    const r = await request.post(
      `${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}/position`,
      { data: { seconds: 50 }, headers: { cookie: student.cookieHeader } },
    );
    expect(r.status()).toBe(200);
    expect(await r.json()).toEqual({ lastWatchedSeconds: 100 });
  });

  test('400 INVALID_POSITION on negative seconds', async ({ request }) => {
    const instructor = await registerAndPromoteInstructor(request);
    const student = await registerStudent(request);
    const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
    const moduleId = await seedModule(courseId);
    const { lessonId } = await seedLesson({ courseId, moduleId, videoState: 'READY' });
    await seedEnrollment({ userId: student.uid, courseId, status: 'ACTIVE' });

    const r = await request.post(
      `${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}/position`,
      { data: { seconds: -1 }, headers: { cookie: student.cookieHeader } },
    );
    expect(r.status()).toBe(400);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe('INVALID_POSITION');
  });

  test('400 INVALID_POSITION on missing body', async ({ request }) => {
    const instructor = await registerAndPromoteInstructor(request);
    const student = await registerStudent(request);
    const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
    const moduleId = await seedModule(courseId);
    const { lessonId } = await seedLesson({ courseId, moduleId, videoState: 'READY' });
    await seedEnrollment({ userId: student.uid, courseId, status: 'ACTIVE' });

    const r = await request.post(
      `${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}/position`,
      { data: {}, headers: { cookie: student.cookieHeader } },
    );
    expect(r.status()).toBe(400);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe('INVALID_POSITION');
  });

  test('403 NOT_ENROLLED_LESSON for a withdrawn enrolment', async ({ request }) => {
    const instructor = await registerAndPromoteInstructor(request);
    const student = await registerStudent(request);
    const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
    const moduleId = await seedModule(courseId);
    const { lessonId } = await seedLesson({ courseId, moduleId, videoState: 'READY' });
    // Seed ACTIVE then overwrite with WITHDRAWN (mirrors the /complete sibling test above).
    await seedEnrollment({ userId: student.uid, courseId, status: 'ACTIVE' });
    await seedEnrollment({ userId: student.uid, courseId, status: 'WITHDRAWN' });

    const r = await request.post(
      `${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}/position`,
      { data: { seconds: 5 }, headers: { cookie: student.cookieHeader } },
    );
    expect(r.status()).toBe(403);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe('NOT_ENROLLED_LESSON');
  });
});

// ──────────────────── GET /learn side-effect (Slice C) ────────────────────

test('GET /learn/.../lessons/:lid bumps lastAccessedLessonId as a side effect', async ({
  request,
}) => {
  const instructor = await registerAndPromoteInstructor(request);
  const student = await registerStudent(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const moduleId = await seedModule(courseId);
  const { lessonId } = await seedLesson({ courseId, moduleId, videoState: 'READY' });
  await seedEnrollment({ userId: student.uid, courseId, status: 'ACTIVE' });

  // Touch the lesson via the student-playback GET — this is the side effect under test.
  const view = await request.get(
    `${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}`,
    { headers: { cookie: student.cookieHeader } },
  );
  expect(view.status()).toBe(200);

  // Read the enrolment back via the public status endpoint and confirm the touch landed.
  const status = await request.get(`${API_BASE}/enrollments/${courseId}`, {
    headers: { cookie: student.cookieHeader },
  });
  expect(status.status()).toBe(200);
  const body = (await status.json()) as {
    enrollment: { lastAccessedLessonId: string | null } | null;
  };
  expect(body.enrollment?.lastAccessedLessonId).toBe(lessonId);
});

// ──────────────────────── UC-04-02 — materials in LessonView ────────────────────────
// Confirms the LearnService projection wires through MaterialsService.listForLesson:
//   - READY materials appear in the body's `materials` array
//   - PENDING_UPLOAD materials are filtered out
//   - the empty case returns `materials: []`
// The owner-side authoring tests live in materials.e2e-spec.ts; this block is
// strictly about the student-facing projection.

const PDF_BYTES = Buffer.from('%PDF-1.4\nfake pdf payload for learn e2e\n%%EOF');

/** Fake-mode signed URLs are returned relative to the API origin. */
function absoluteUrl(url: string): string {
  return url.startsWith('http') ? url : `http://localhost:3333${url}`;
}

/**
 * Start a materials upload via the real API and return both the new materialId
 * and the issued (relative) uploadUrl. Caller decides whether to PUT + complete
 * (READY) or leave dangling (PENDING_UPLOAD).
 */
async function startMaterialUpload(
  request: import('@playwright/test').APIRequestContext,
  hdr: Record<string, string>,
  loc: { courseId: string; moduleId: string; lessonId: string },
  filename: string,
): Promise<{ materialId: string; uploadUrl: string }> {
  const res = await request.post(
    `${API_BASE}/courses/${loc.courseId}/modules/${loc.moduleId}/lessons/${loc.lessonId}/materials/upload-url`,
    { headers: hdr, data: { filename, sizeBytes: PDF_BYTES.length } },
  );
  expect(res.status()).toBe(201);
  return (await res.json()) as { materialId: string; uploadUrl: string };
}

/** Drive a material to READY: PUT bytes + POST /complete. */
async function attachReadyMaterial(
  request: import('@playwright/test').APIRequestContext,
  hdr: Record<string, string>,
  loc: { courseId: string; moduleId: string; lessonId: string },
  filename: string,
): Promise<string> {
  const { materialId, uploadUrl } = await startMaterialUpload(request, hdr, loc, filename);
  const put = await request.put(absoluteUrl(uploadUrl), {
    headers: { ...hdr, 'Content-Type': 'application/pdf' },
    data: PDF_BYTES,
  });
  expect(put.ok()).toBe(true);
  const done = await request.post(`${API_BASE}/materials/${materialId}/complete`, {
    headers: hdr,
  });
  expect(done.status()).toBe(200);
  return materialId;
}

test.describe('UC-04-02 — materials in LessonView', () => {
  test('projects READY-only materials, drops PENDING_UPLOAD', async ({ request }) => {
    const instructor = await registerAndPromoteInstructor(request);
    const instructorHdr = { Cookie: instructor.cookieHeader };
    const student = await registerStudent(request);

    const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
    const moduleId = await seedModule(courseId);
    const { lessonId } = await seedLesson({ courseId, moduleId, videoState: 'READY' });
    await seedEnrollment({ userId: student.uid, courseId, status: 'ACTIVE' });

    // One material driven all the way to READY.
    await attachReadyMaterial(request, instructorHdr, { courseId, moduleId, lessonId }, 'ready.pdf');
    // One material left in PENDING_UPLOAD — upload-url issued but never PUT/completed.
    await startMaterialUpload(request, instructorHdr, { courseId, moduleId, lessonId }, 'pending.pdf');

    const res = await request.get(`${API_BASE}/learn/courses/${courseId}/lessons/${lessonId}`, {
      headers: { cookie: student.cookieHeader },
    });
    expect(res.status()).toBe(200);

    const body = (await res.json()) as {
      materials: Array<{ id: string; displayName: string; extension: string; sizeBytes: number }>;
    };
    expect(body.materials).toHaveLength(1);
    expect(body.materials[0]!.displayName).toBe('ready.pdf');
    expect(body.materials[0]!.extension).toBe('pdf');
  });

  test('returns materials: [] when the lesson has none', async ({ request }) => {
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
    const body = (await res.json()) as { materials: unknown[] };
    expect(body.materials).toEqual([]);
  });
});
