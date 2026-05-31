import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

import {
  API_BASE,
  initAdmin,
  registerAndPromoteInstructor,
  registerStudent,
} from './_helpers/auth';

initAdmin();

// ──────────────────────── Firestore seed helpers ────────────────────────
// These helpers write a READY video straight into Firestore (via the Admin
// SDK) so the access-control tests can seed a fixed state without running the
// full upload/transcode pipeline each time. They mirror the pattern used in
// playback.e2e-spec.ts (which itself mirrors learn.e2e-spec.ts).

/** Seed a course document straight into Firestore. */
async function seedCourse(args: {
  status: 'DRAFT' | 'PUBLISHED';
  instructorId: string;
}): Promise<string> {
  const id = `cap-e2e-${args.status}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();
  await admin
    .firestore()
    .collection('courses')
    .doc(id)
    .set({
      id,
      title: 'Captions e2e course',
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

/**
 * Seed a module + lesson + READY video document straight into Firestore.
 * The video's ownerInstructorId is set to the course's instructorId so the
 * guard correctly routes students via the enrollment branch.
 */
async function seedLessonWithReadyVideo(args: {
  courseId: string;
  instructorId: string;
}): Promise<{ lessonId: string; videoId: string }> {
  const now = new Date().toISOString();

  const mid = `cap-e2e-mod-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await admin
    .firestore()
    .collection('courses')
    .doc(args.courseId)
    .collection('modules')
    .doc(mid)
    .set({ id: mid, courseId: args.courseId, title: 'M1', order: 0, createdAt: now, updatedAt: now });

  const vid = `cap-e2e-vid-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await admin
    .firestore()
    .collection('videos')
    .doc(vid)
    .set({
      id: vid,
      ownerInstructorId: args.instructorId,
      courseId: args.courseId,
      state: 'READY',
      source: { bucket: 'demo-learnwren.appspot.com', path: `videos/${vid}/source.mp4` },
      output: {
        bucket: 'demo-learnwren.appspot.com',
        manifestPath: `videos/${vid}/manifest.m3u8`,
        durationSec: 1,
      },
      createdAt: now,
      updatedAt: now,
    });

  const lid = `cap-e2e-les-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await admin
    .firestore()
    .collection('courses')
    .doc(args.courseId)
    .collection('modules')
    .doc(mid)
    .collection('lessons')
    .doc(lid)
    .set({
      id: lid,
      moduleId: mid,
      videoId: vid,
      title: 'L1',
      order: 0,
      createdAt: now,
      updatedAt: now,
    });

  return { lessonId: lid, videoId: vid };
}
// ──────────────────────────────────────────────────────────────────────────

const VALID_VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello\n';

test('owner can upload captions, fetch meta, and stream delivery', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const { videoId } = await seedLessonWithReadyVideo({ courseId, instructorId: instructor.uid });

  // PUT — upload VTT file
  const put = await request.put(`${API_BASE}/videos/${videoId}/captions`, {
    headers: { Cookie: instructor.cookieHeader },
    multipart: { file: { name: 'captions.vtt', mimeType: 'text/vtt', buffer: Buffer.from(VALID_VTT) } },
  });
  expect(put.status()).toBe(200);
  const putBody = (await put.json()) as { language: string; label: string; updatedAt: string };
  expect(putBody.language).toBe('en');
  expect(putBody.label).toBe('English');
  expect(putBody.updatedAt).toBeTruthy();

  // GET meta — owner reads caption metadata
  const meta = await request.get(`${API_BASE}/videos/${videoId}/captions`, {
    headers: { Cookie: instructor.cookieHeader },
  });
  expect(meta.status()).toBe(200);
  const metaBody = (await meta.json()) as { language: string; label: string; updatedAt: string };
  expect(metaBody.language).toBe('en');
  expect(metaBody.label).toBe('English');
  expect(metaBody.updatedAt).toBeTruthy();

  // GET delivery — owner streams the VTT file via playback endpoint
  const delivery = await request.get(`${API_BASE}/playback/captions/${videoId}`, {
    headers: { Cookie: instructor.cookieHeader },
  });
  expect(delivery.status()).toBe(200);
  expect(delivery.headers()['content-type']).toMatch(/text\/vtt/);
  expect(await delivery.text()).toContain('WEBVTT');
});

test('invalid VTT is rejected with INVALID_CAPTION_FILE', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const { videoId } = await seedLessonWithReadyVideo({ courseId, instructorId: instructor.uid });

  const r = await request.put(`${API_BASE}/videos/${videoId}/captions`, {
    headers: { Cookie: instructor.cookieHeader },
    multipart: { file: { name: 'bad.vtt', mimeType: 'text/vtt', buffer: Buffer.from('not a vtt file') } },
  });
  expect(r.status()).toBe(400);
  expect(((await r.json()) as { error: { code: string } }).error.code).toBe('INVALID_CAPTION_FILE');
});

test('enrolled student can fetch captions; non-enrolled student gets 403', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const { videoId } = await seedLessonWithReadyVideo({ courseId, instructorId: instructor.uid });

  // Upload captions as instructor
  const put = await request.put(`${API_BASE}/videos/${videoId}/captions`, {
    headers: { Cookie: instructor.cookieHeader },
    multipart: { file: { name: 'captions.vtt', mimeType: 'text/vtt', buffer: Buffer.from(VALID_VTT) } },
  });
  expect(put.status()).toBe(200);

  // Enrol a student
  const student = await registerStudent(request);
  const enrol = await request.post(`${API_BASE}/enrollments`, {
    headers: { Cookie: student.cookieHeader },
    data: { courseId },
  });
  expect(enrol.status()).toBe(201);

  // Enrolled student can stream captions
  const studentDelivery = await request.get(`${API_BASE}/playback/captions/${videoId}`, {
    headers: { Cookie: student.cookieHeader },
  });
  expect(studentDelivery.status()).toBe(200);
  expect(await studentDelivery.text()).toContain('WEBVTT');

  // Non-enrolled student cannot
  const other = await registerStudent(request);
  const otherDelivery = await request.get(`${API_BASE}/playback/captions/${videoId}`, {
    headers: { Cookie: other.cookieHeader },
  });
  expect(otherDelivery.status()).toBe(403);
});

test('delete captions then delivery returns 404 CAPTIONS_NOT_FOUND, meta returns null', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const { videoId } = await seedLessonWithReadyVideo({ courseId, instructorId: instructor.uid });

  // Upload captions
  const put = await request.put(`${API_BASE}/videos/${videoId}/captions`, {
    headers: { Cookie: instructor.cookieHeader },
    multipart: { file: { name: 'captions.vtt', mimeType: 'text/vtt', buffer: Buffer.from(VALID_VTT) } },
  });
  expect(put.status()).toBe(200);

  // DELETE captions
  const del = await request.delete(`${API_BASE}/videos/${videoId}/captions`, {
    headers: { Cookie: instructor.cookieHeader },
  });
  expect(del.status()).toBe(204);

  // Delivery endpoint returns 404 with CAPTIONS_NOT_FOUND
  const delivery = await request.get(`${API_BASE}/playback/captions/${videoId}`, {
    headers: { Cookie: instructor.cookieHeader },
  });
  expect(delivery.status()).toBe(404);
  expect(((await delivery.json()) as { error: { code: string } }).error.code).toBe('CAPTIONS_NOT_FOUND');

  // Meta endpoint returns null (NestJS serialises null as an empty body)
  const meta = await request.get(`${API_BASE}/videos/${videoId}/captions`, {
    headers: { Cookie: instructor.cookieHeader },
  });
  expect(meta.status()).toBe(200);
  const metaText = await meta.text();
  // NestJS renders a null return as either an empty body or the literal "null";
  // either is acceptable — both signal "no captions".
  expect(metaText === '' || metaText === 'null').toBe(true);
});
