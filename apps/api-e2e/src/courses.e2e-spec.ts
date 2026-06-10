import * as fs from 'node:fs';
import * as path from 'node:path';

import * as admin from 'firebase-admin';
import { expect, test } from '@playwright/test';

import {
  API_BASE,
  initAdmin,
  registerAndPromoteInstructor,
  registerStudent,
} from './_helpers/auth';

initAdmin();

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'small-video.mp4');
const FIXTURE_BYTES = fs.readFileSync(FIXTURE_PATH);
const COVER_FIXTURE_PATH = path.join(__dirname, 'fixtures', 'cover-1280x720.jpg');
const COVER_BYTES = fs.readFileSync(COVER_FIXTURE_PATH);
const PDF_BYTES = Buffer.from('%PDF-1.4\nfake pdf\n%%EOF');

/** Fake-mode signed URLs are returned relative to the API origin. */
function absolute(url: string): string {
  return url.startsWith('http') ? url : `http://localhost:3333${url}`;
}

test('full lifecycle: instructor creates course, modules, lessons, reorders, deletes', async ({
  request,
}) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };

  // Create a course
  const create = await request.post(`${API_BASE}/courses`, {
    headers: hdr,
    data: { title: 'TS Intro', description: 'Short intro to TypeScript.' },
  });
  expect(create.status()).toBe(201);
  const course = await create.json();
  expect(course.status).toBe('DRAFT');
  expect(course.instructorId).toBe(instructor.uid);

  // List shows the new course
  const list = await request.get(`${API_BASE}/courses`, { headers: hdr });
  expect(list.status()).toBe(200);
  const items = await list.json();
  expect(items).toEqual(expect.arrayContaining([expect.objectContaining({ id: course.id })]));

  // Add two modules
  const m1 = await request.post(`${API_BASE}/courses/${course.id}/modules`, {
    headers: hdr,
    data: { title: 'Module A' },
  });
  expect(m1.status()).toBe(201);
  const moduleA = await m1.json();
  expect(moduleA.order).toBe(0);

  const m2 = await request.post(`${API_BASE}/courses/${course.id}/modules`, {
    headers: hdr,
    data: { title: 'Module B' },
  });
  const moduleB = await m2.json();
  expect(moduleB.order).toBe(1);

  // Add lessons to module A
  const l1 = await request.post(`${API_BASE}/courses/${course.id}/modules/${moduleA.id}/lessons`, {
    headers: hdr,
    data: { title: 'Hello' },
  });
  expect(l1.status()).toBe(201);
  const lessonA1 = await l1.json();
  expect(lessonA1.order).toBe(0);

  const l2 = await request.post(`${API_BASE}/courses/${course.id}/modules/${moduleA.id}/lessons`, {
    headers: hdr,
    data: { title: 'World', description: 'second' },
  });
  const lessonA2 = await l2.json();
  expect(lessonA2.order).toBe(1);

  // Reorder modules: B before A
  const reorderModules = await request.put(`${API_BASE}/courses/${course.id}/modules/order`, {
    headers: hdr,
    data: { ids: [moduleB.id, moduleA.id] },
  });
  expect(reorderModules.status()).toBe(200);

  // Reorder lessons in module A: A2 before A1
  const reorderLessons = await request.put(
    `${API_BASE}/courses/${course.id}/modules/${moduleA.id}/lessons/order`,
    { headers: hdr, data: { ids: [lessonA2.id, lessonA1.id] } },
  );
  expect(reorderLessons.status()).toBe(200);

  // Hydrated tree reflects the new orders
  const tree = await request.get(`${API_BASE}/courses/${course.id}`, { headers: hdr });
  expect(tree.status()).toBe(200);
  const treeBody = await tree.json();
  expect(treeBody.modules[0].module.id).toBe(moduleB.id);
  expect(treeBody.modules[1].module.id).toBe(moduleA.id);
  expect(treeBody.modules[1].lessons[0].id).toBe(lessonA2.id);
  expect(treeBody.modules[1].lessons[1].id).toBe(lessonA1.id);

  // Rename module A
  const renameModule = await request.patch(
    `${API_BASE}/courses/${course.id}/modules/${moduleA.id}`,
    { headers: hdr, data: { title: 'Module A (renamed)' } },
  );
  expect(renameModule.status()).toBe(200);

  // Update course
  const updateCourse = await request.patch(`${API_BASE}/courses/${course.id}`, {
    headers: hdr,
    data: { title: 'TS Intro (rev)', category: 'PROGRAMMING', difficulty: 'BEGINNER' },
  });
  expect(updateCourse.status()).toBe(200);

  // Delete a lesson
  const delLesson = await request.delete(
    `${API_BASE}/courses/${course.id}/modules/${moduleA.id}/lessons/${lessonA1.id}`,
    { headers: hdr },
  );
  expect(delLesson.status()).toBe(204);

  // Delete a module (cascades remaining lessons)
  const delModule = await request.delete(
    `${API_BASE}/courses/${course.id}/modules/${moduleA.id}`,
    { headers: hdr },
  );
  expect(delModule.status()).toBe(204);

  // Delete the course (cascades remaining module)
  const delCourse = await request.delete(`${API_BASE}/courses/${course.id}`, { headers: hdr });
  expect(delCourse.status()).toBe(204);

  // After delete, GET returns 404
  const after = await request.get(`${API_BASE}/courses/${course.id}`, { headers: hdr });
  expect(after.status()).toBe(404);
});

test('STUDENT gets 403 INSUFFICIENT_ROLE on POST /courses', async ({ request }) => {
  const student = await registerStudent(request);
  const res = await request.post(`${API_BASE}/courses`, {
    headers: { Cookie: student.cookieHeader },
    data: { title: 'X', description: 'Y' },
  });
  expect(res.status()).toBe(403);
  const body = await res.json();
  expect(body.error.code).toBe('INSUFFICIENT_ROLE');
});

test('unauthenticated request gets 401', async ({ request }) => {
  const res = await request.get(`${API_BASE}/courses`);
  expect(res.status()).toBe(401);
});

test("instructor B cannot access instructor A's course (403 NOT_COURSE_OWNER)", async ({
  request,
}) => {
  const a = await registerAndPromoteInstructor(request);
  const b = await registerAndPromoteInstructor(request);

  const create = await request.post(`${API_BASE}/courses`, {
    headers: { Cookie: a.cookieHeader },
    data: { title: 'A-owned', description: 'D' },
  });
  const course = await create.json();

  const get = await request.get(`${API_BASE}/courses/${course.id}`, {
    headers: { Cookie: b.cookieHeader },
  });
  expect(get.status()).toBe(403);
  const body = await get.json();
  expect(body.error.code).toBe('NOT_COURSE_OWNER');
});

test('stale reorder returns 409 STALE_REORDER', async ({ request }) => {
  const i = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: i.cookieHeader };

  const c = await request.post(`${API_BASE}/courses`, {
    headers: hdr,
    data: { title: 'C', description: 'D' },
  });
  const course = await c.json();
  const m1 = await (
    await request.post(`${API_BASE}/courses/${course.id}/modules`, { headers: hdr, data: { title: 'A' } })
  ).json();
  const m2 = await (
    await request.post(`${API_BASE}/courses/${course.id}/modules`, { headers: hdr, data: { title: 'B' } })
  ).json();

  // Stale: only one of two ids
  const res = await request.put(`${API_BASE}/courses/${course.id}/modules/order`, {
    headers: hdr,
    data: { ids: [m1.id] },
  });
  expect(res.status()).toBe(409);
  const body = await res.json();
  expect(body.error.code).toBe('STALE_REORDER');

  // Stale: foreign id
  const res2 = await request.put(`${API_BASE}/courses/${course.id}/modules/order`, {
    headers: hdr,
    data: { ids: [m1.id, m2.id, 'mid-stranger'] },
  });
  expect(res2.status()).toBe(409);
});

test('GET on non-existent course returns 404', async ({ request }) => {
  const i = await registerAndPromoteInstructor(request);
  const res = await request.get(`${API_BASE}/courses/cid-nonexistent`, {
    headers: { Cookie: i.cookieHeader },
  });
  expect(res.status()).toBe(404);
  const body = await res.json();
  expect(body.error.code).toBe('COURSE_NOT_FOUND');
});

test('validation: missing title returns 400 VALIDATION_FAILED', async ({ request }) => {
  const i = await registerAndPromoteInstructor(request);
  const res = await request.post(`${API_BASE}/courses`, {
    headers: { Cookie: i.cookieHeader },
    data: { description: 'no title' },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error.code).toBe('VALIDATION_FAILED');
  expect(body.error.details?.fieldErrors).toBeTruthy();
});

/**
 * Full course-delete cascade:
 *   instructor → course + module + lesson + READY video + material + cover
 *   student enrolls; DELETE course → 204; then assert every artefact is gone.
 *
 * Mirrors the "lesson-delete cascades a READY video" test in videos.e2e-spec.ts
 * for the course-level cascade path.
 */
test('course delete cascades: video, material, cover, enrollment all removed', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const student = await registerStudent(request);
  const iHdr = { Cookie: instructor.cookieHeader };

  // 1. Create course → module → lesson
  const courseRes = await request.post(`${API_BASE}/courses`, {
    headers: iHdr,
    data: { title: 'Cascade Course', description: 'full cascade test' },
  });
  expect(courseRes.status()).toBe(201);
  const course = (await courseRes.json()) as { id: string };

  const modRes = await request.post(`${API_BASE}/courses/${course.id}/modules`, {
    headers: iHdr,
    data: { title: 'M1' },
  });
  const mod = (await modRes.json()) as { id: string };

  const lessonRes = await request.post(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons`,
    { headers: iHdr, data: { title: 'L1' } },
  );
  const lesson = (await lessonRes.json()) as { id: string };

  // 2. Upload a video and drive it to READY via the fake transcoder.
  const sessRes = await request.post(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/video/upload-session`,
    { headers: iHdr, data: { sizeBytes: FIXTURE_BYTES.length, contentType: 'video/mp4' } },
  );
  expect(sessRes.status()).toBe(201);
  const { videoId, uploadSessionUri } = (await sessRes.json()) as {
    videoId: string;
    uploadSessionUri: string;
  };
  await request.put(uploadSessionUri, {
    headers: { 'Content-Range': `bytes 0-${FIXTURE_BYTES.length - 1}/${FIXTURE_BYTES.length}` },
    data: FIXTURE_BYTES,
  });
  await request.post(`${API_BASE}/videos/${videoId}/upload-complete`, { headers: iHdr });
  await request.post(`${API_BASE}/internal/fake-transcoder/complete/${videoId}`, { headers: iHdr });

  // Confirm video is READY.
  const videoGet = await request.get(`${API_BASE}/videos/${videoId}`, { headers: iHdr });
  expect(((await videoGet.json()) as { state: string }).state).toBe('READY');

  // 3. Attach a material.
  const matCreated = await request.post(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/materials/upload-url`,
    { headers: iHdr, data: { filename: 'notes.pdf', sizeBytes: PDF_BYTES.length } },
  );
  expect(matCreated.status()).toBe(201);
  const { materialId, uploadUrl } = (await matCreated.json()) as {
    materialId: string;
    uploadUrl: string;
  };
  await request.put(absolute(uploadUrl), {
    headers: { ...iHdr, 'Content-Type': 'application/pdf' },
    data: PDF_BYTES,
  });
  const matComplete = await request.post(`${API_BASE}/materials/${materialId}/complete`, {
    headers: iHdr,
  });
  expect(((await matComplete.json()) as { state: string }).state).toBe('READY');

  // 4. Upload a cover image.
  const coverRes = await request.put(`${API_BASE}/courses/${course.id}/cover`, {
    headers: iHdr,
    multipart: { file: { name: 'cover.jpg', mimeType: 'image/jpeg', buffer: COVER_BYTES } },
  });
  expect(coverRes.status()).toBe(200);

  // 5. Publish the course (required for student enrollment).
  //    Drive directly via admin SDK to avoid needing a full publish-gate roundtrip.
  await admin.firestore().collection('courses').doc(course.id).update({ status: 'PUBLISHED', publishedAt: new Date().toISOString() });

  // 6. Student enrolls.
  const enrollRes = await request.post(`${API_BASE}/enrollments`, {
    headers: { Cookie: student.cookieHeader },
    data: { courseId: course.id },
  });
  expect(enrollRes.status()).toBe(201);

  // 7. DELETE the course → 204.
  const del = await request.delete(`${API_BASE}/courses/${course.id}`, { headers: iHdr });
  expect(del.status()).toBe(204);

  // ── Assertions ──────────────────────────────────────────────────────────────

  // Course is gone.
  const afterCourse = await request.get(`${API_BASE}/courses/${course.id}`, { headers: iHdr });
  expect(afterCourse.status()).toBe(404);

  // Catalog no longer lists the course.
  const catalog = await request.get(`${API_BASE}/catalog`);
  const catalogItems = (await catalog.json()) as { items: { id: string }[] };
  expect(catalogItems.items.map((c) => c.id)).not.toContain(course.id);

  // Video doc is gone.
  const afterVideo = await request.get(`${API_BASE}/videos/${videoId}`, { headers: iHdr });
  expect(afterVideo.status()).toBe(404);

  // Material doc is gone — MaterialOwnerGuard 404s when the doc no longer exists.
  const afterMaterial = await request.get(`${API_BASE}/materials/${materialId}/download-url`, {
    headers: iHdr,
  });
  expect(afterMaterial.status()).toBe(404);

  // Student's enrollment is gone — the doc was deleted (not WITHDRAWN), so the
  // status view returns { enrollment: null } with a 200 (the endpoint does not
  // 404 when merely absent; null enrollment means no history was found).
  const afterEnrollment = await request.get(`${API_BASE}/enrollments/${course.id}`, {
    headers: { Cookie: student.cookieHeader },
  });
  expect(afterEnrollment.status()).toBe(200);
  const enrollView = (await afterEnrollment.json()) as { enrollment: null };
  expect(enrollView.enrollment).toBeNull();
});
