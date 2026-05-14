import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  API_BASE,
  initAdmin,
  registerAndPromoteInstructor,
  registerStudent,
} from './_helpers/auth';

initAdmin();

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'small-video.mp4');
const FIXTURE_BYTES = fs.readFileSync(FIXTURE_PATH);

async function createCourseModuleLesson(
  request: import('@playwright/test').APIRequestContext,
  hdr: Record<string, string>,
): Promise<{
  course: { id: string };
  mod: { id: string };
  lesson: { id: string };
}> {
  const c = await request.post(`${API_BASE}/courses`, {
    headers: hdr,
    data: { title: 'Vid Course', description: 'desc' },
  });
  const course = (await c.json()) as { id: string };
  const m = await request.post(`${API_BASE}/courses/${course.id}/modules`, {
    headers: hdr,
    data: { title: 'M1' },
  });
  const mod = (await m.json()) as { id: string };
  const l = await request.post(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons`,
    { headers: hdr, data: { title: 'L1' } },
  );
  const lesson = (await l.json()) as { id: string };
  return { course, mod, lesson };
}

test('video upload happy path', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };
  const { course, mod, lesson } = await createCourseModuleLesson(request, hdr);

  // Create upload session
  const sess = await request.post(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/video/upload-session`,
    {
      headers: hdr,
      data: { sizeBytes: FIXTURE_BYTES.length, contentType: 'video/mp4' },
    },
  );
  expect(sess.status()).toBe(201);
  const { videoId, uploadSessionUri } = (await sess.json()) as {
    videoId: string;
    uploadSessionUri: string;
  };

  // PUT the fixture to the session URI
  const put = await request.put(uploadSessionUri, {
    headers: { 'Content-Range': `bytes 0-${FIXTURE_BYTES.length - 1}/${FIXTURE_BYTES.length}` },
    data: FIXTURE_BYTES,
  });
  expect([200, 308]).toContain(put.status());

  // Complete
  const complete = await request.post(`${API_BASE}/videos/${videoId}/upload-complete`, {
    headers: hdr,
  });
  expect(complete.status()).toBe(200);
  const video = (await complete.json()) as { state: string };
  expect(video.state).toBe('UPLOADED');

  // GET reflects state
  const get = await request.get(`${API_BASE}/videos/${videoId}`, { headers: hdr });
  expect(get.status()).toBe(200);
  expect(((await get.json()) as { state: string }).state).toBe('UPLOADED');

  // DELETE cleans up
  const del = await request.delete(`${API_BASE}/videos/${videoId}`, { headers: hdr });
  expect(del.status()).toBe(204);
});

test('401 unauthenticated, 403 wrong-role, 403 wrong-instructor, 409 already-has-video', async ({
  request,
}) => {
  const inst = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: inst.cookieHeader };
  const { course, mod, lesson } = await createCourseModuleLesson(request, hdr);

  // 401 unauthenticated
  const unauth = await request.post(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/video/upload-session`,
    { data: { sizeBytes: 1, contentType: 'video/mp4' } },
  );
  expect(unauth.status()).toBe(401);

  // 403 INSUFFICIENT_ROLE (student)
  const student = await registerStudent(request);
  const studentRes = await request.post(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/video/upload-session`,
    {
      headers: { Cookie: student.cookieHeader },
      data: { sizeBytes: 1, contentType: 'video/mp4' },
    },
  );
  expect(studentRes.status()).toBe(403);
  expect(((await studentRes.json()) as { error: { code: string } }).error.code).toBe('INSUFFICIENT_ROLE');

  // 403 NOT_COURSE_OWNER (different instructor)
  const otherInst = await registerAndPromoteInstructor(request);
  const otherRes = await request.post(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/video/upload-session`,
    {
      headers: { Cookie: otherInst.cookieHeader },
      data: { sizeBytes: 1, contentType: 'video/mp4' },
    },
  );
  expect(otherRes.status()).toBe(403);
  expect(((await otherRes.json()) as { error: { code: string } }).error.code).toBe('NOT_COURSE_OWNER');

  // 409 LESSON_ALREADY_HAS_VIDEO
  const first = await request.post(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/video/upload-session`,
    { headers: hdr, data: { sizeBytes: FIXTURE_BYTES.length, contentType: 'video/mp4' } },
  );
  const { videoId: firstVid, uploadSessionUri: uri1 } = (await first.json()) as {
    videoId: string;
    uploadSessionUri: string;
  };
  await request.put(uri1, {
    headers: { 'Content-Range': `bytes 0-${FIXTURE_BYTES.length - 1}/${FIXTURE_BYTES.length}` },
    data: FIXTURE_BYTES,
  });
  await request.post(`${API_BASE}/videos/${firstVid}/upload-complete`, { headers: hdr });

  const second = await request.post(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/video/upload-session`,
    { headers: hdr, data: { sizeBytes: 1, contentType: 'video/mp4' } },
  );
  expect(second.status()).toBe(409);
  expect(((await second.json()) as { error: { code: string } }).error.code).toBe('LESSON_ALREADY_HAS_VIDEO');
});

test('422 upload-object-missing when complete called before any bytes', async ({ request }) => {
  const inst = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: inst.cookieHeader };
  const { course, mod, lesson } = await createCourseModuleLesson(request, hdr);
  const sess = (await (
    await request.post(
      `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/video/upload-session`,
      { headers: hdr, data: { sizeBytes: 100, contentType: 'video/mp4' } },
    )
  ).json()) as { videoId: string };

  const r = await request.post(`${API_BASE}/videos/${sess.videoId}/upload-complete`, {
    headers: hdr,
  });
  expect(r.status()).toBe(422);
  expect(((await r.json()) as { error: { code: string } }).error.code).toBe('UPLOAD_OBJECT_MISSING');
});

test('lesson delete cascades to video', async ({ request }) => {
  const inst = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: inst.cookieHeader };
  const { course, mod, lesson } = await createCourseModuleLesson(request, hdr);

  // Upload a video
  const sess = (await (
    await request.post(
      `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/video/upload-session`,
      { headers: hdr, data: { sizeBytes: FIXTURE_BYTES.length, contentType: 'video/mp4' } },
    )
  ).json()) as { videoId: string; uploadSessionUri: string };
  await request.put(sess.uploadSessionUri, {
    headers: { 'Content-Range': `bytes 0-${FIXTURE_BYTES.length - 1}/${FIXTURE_BYTES.length}` },
    data: FIXTURE_BYTES,
  });
  await request.post(`${API_BASE}/videos/${sess.videoId}/upload-complete`, { headers: hdr });

  // Delete the lesson
  const del = await request.delete(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}`,
    { headers: hdr },
  );
  expect(del.status()).toBe(204);

  // Video is gone
  const get = await request.get(`${API_BASE}/videos/${sess.videoId}`, { headers: hdr });
  expect(get.status()).toBe(404);
});
