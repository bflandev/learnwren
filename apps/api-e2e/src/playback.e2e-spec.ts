import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  API_BASE,
  initAdmin,
  registerAndPromoteInstructor,
  registerStudent,
} from './_helpers/auth';

initAdmin();

// ──────────────────────── Firestore seed helpers ────────────────────────
// These helpers write directly to Firestore (via the Admin SDK) so the tests
// do not depend on the upload/transcode pipeline that is still broken in the
// local emulator environment (TRANSCODING → READY transition not wired up for
// the fake transcoder). They mirror the pattern used in learn.e2e-spec.ts.

/** Seed a course document straight into Firestore. */
async function seedCourse(args: {
  status: 'DRAFT' | 'PUBLISHED';
  instructorId: string;
}): Promise<string> {
  const id = `pb-e2e-${args.status}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();
  await admin
    .firestore()
    .collection('courses')
    .doc(id)
    .set({
      id,
      title: 'Playback e2e course',
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

  const mid = `pb-e2e-mod-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await admin
    .firestore()
    .collection('courses')
    .doc(args.courseId)
    .collection('modules')
    .doc(mid)
    .set({ id: mid, courseId: args.courseId, title: 'M1', order: 0, createdAt: now, updatedAt: now });

  const vid = `pb-e2e-vid-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
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
      // ManifestService reads video.output.{bucket,manifestPath} when serving the
      // master playlist; without it the controller 500s before the auth guard
      // gets a chance to deny non-owners. The path must end in `/manifest.m3u8`
      // so the fake-storage seam recognises it (see VideoStorageAdapter
      // .fakeReadManifest); the bucket is unused in fake mode.
      output: {
        bucket: 'demo-learnwren.appspot.com',
        manifestPath: `videos/${vid}/manifest.m3u8`,
        durationSec: 1,
      },
      createdAt: now,
      updatedAt: now,
    });

  const lid = `pb-e2e-les-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
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

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'small-video.mp4');
const FIXTURE_BYTES = fs.readFileSync(FIXTURE_PATH);

async function uploadAndTranscode(
  request: import('@playwright/test').APIRequestContext,
  hdr: Record<string, string>,
): Promise<{ courseId: string; moduleId: string; lessonId: string; videoId: string }> {
  const c = (await (await request.post(`${API_BASE}/courses`, {
    headers: hdr,
    data: { title: 'Playback Course', description: 'desc' },
  })).json()) as { id: string };
  const m = (await (await request.post(`${API_BASE}/courses/${c.id}/modules`, {
    headers: hdr,
    data: { title: 'M' },
  })).json()) as { id: string };
  const l = (await (await request.post(`${API_BASE}/courses/${c.id}/modules/${m.id}/lessons`, {
    headers: hdr,
    data: { title: 'L' },
  })).json()) as { id: string };

  const sess = (await (await request.post(
    `${API_BASE}/courses/${c.id}/modules/${m.id}/lessons/${l.id}/video/upload-session`,
    { headers: hdr, data: { sizeBytes: FIXTURE_BYTES.length, contentType: 'video/mp4' } },
  )).json()) as { videoId: string; uploadSessionUri: string };

  await request.put(sess.uploadSessionUri, {
    headers: { 'Content-Range': `bytes 0-${FIXTURE_BYTES.length - 1}/${FIXTURE_BYTES.length}` },
    data: FIXTURE_BYTES,
  });
  await request.post(`${API_BASE}/videos/${sess.videoId}/upload-complete`, { headers: hdr });
  const fake = await request.post(
    `${API_BASE}/internal/fake-transcoder/complete/${sess.videoId}`,
  );
  expect(fake.status()).toBe(200);

  return { courseId: c.id, moduleId: m.id, lessonId: l.id, videoId: sess.videoId };
}

// FOLLOWUP(fake-transcoder-ready-chain): the 2026-05-23 fake source-probe
// seam fixed the upload-complete probe (videos can now reach TRANSCODING in
// emulator mode), but the fake-transcoder/complete chain does NOT then
// transition TRANSCODING -> READY in this env. The playback tests below all
// require a READY video, so they still fail (the access guards return 409
// VIDEO_NOT_READY). Needs a separate look at TranscoderEventsController ->
// VideoService.applyTranscoderResult under the fake transcoder envelope.
test.fixme('owner can fetch master, rendition, and key', async ({ request }) => {
  const inst = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: inst.cookieHeader };
  const { videoId } = await uploadAndTranscode(request, hdr);

  const master = await request.get(`${API_BASE}/playback/manifest/${videoId}`, { headers: hdr });
  expect(master.status()).toBe(200);
  expect(master.headers()['content-type']).toMatch(/application\/vnd\.apple\.mpegurl/);
  expect(master.headers()['cache-control']).toBe('no-store');
  const masterBody = await master.text();
  expect(masterBody.startsWith('#EXTM3U')).toBe(true);
  for (const r of ['1080p', '720p', '480p', '360p']) {
    expect(masterBody).toContain(`/api/playback/manifest/${videoId}/rendition/${r}`);
  }

  const r720 = await request.get(
    `${API_BASE}/playback/manifest/${videoId}/rendition/720p`,
    { headers: hdr },
  );
  expect(r720.status()).toBe(200);
  expect(r720.headers()['content-type']).toMatch(/application\/vnd\.apple\.mpegurl/);
  const r720Body = await r720.text();
  expect(r720Body).toContain(`URI="/api/playback/keys/${videoId}"`);
  expect(r720Body).toContain('IV=0xABCDEF0123456789ABCDEF0123456789');
  expect(r720Body).toMatch(/gs-stub:\/\/.+\/720p\/segment_001\.ts/);
  expect(r720Body).toMatch(/gs-stub:\/\/.+\/720p\/segment_002\.ts/);

  const keyRes = await request.get(`${API_BASE}/playback/keys/${videoId}`, { headers: hdr });
  expect(keyRes.status()).toBe(200);
  expect(keyRes.headers()['content-type']).toBe('application/octet-stream');
  expect(keyRes.headers()['content-length']).toBe('16');
  const keyBody = await keyRes.body();
  expect(keyBody.length).toBe(16);
});

test.fixme('401 unauthenticated for every playback endpoint', async ({ request }) => {
  const inst = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: inst.cookieHeader };
  const { videoId } = await uploadAndTranscode(request, hdr);

  for (const url of [
    `${API_BASE}/playback/manifest/${videoId}`,
    `${API_BASE}/playback/manifest/${videoId}/rendition/720p`,
    `${API_BASE}/playback/keys/${videoId}`,
  ]) {
    const r = await request.get(url);
    expect(r.status()).toBe(401);
  }
});

test.fixme('403 NOT_VIDEO_OWNER for a different instructor', async ({ request }) => {
  const owner = await registerAndPromoteInstructor(request);
  const ownerHdr = { Cookie: owner.cookieHeader };
  const { videoId } = await uploadAndTranscode(request, ownerHdr);

  const other = await registerAndPromoteInstructor(request);
  const otherHdr = { Cookie: other.cookieHeader };

  for (const url of [
    `${API_BASE}/playback/manifest/${videoId}`,
    `${API_BASE}/playback/manifest/${videoId}/rendition/720p`,
    `${API_BASE}/playback/keys/${videoId}`,
  ]) {
    const r = await request.get(url, { headers: otherHdr });
    expect(r.status()).toBe(403);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe('NOT_VIDEO_OWNER');
  }
});

test('200 OK for an enrolled student on a PUBLISHED course', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const { videoId } = await seedLessonWithReadyVideo({ courseId, instructorId: instructor.uid });
  const student = await registerStudent(request);

  const enrol = await request.post(`${API_BASE}/enrollments`, {
    headers: { Cookie: student.cookieHeader },
    data: { courseId },
  });
  expect(enrol.status()).toBe(201);

  const res = await request.get(`${API_BASE}/playback/manifest/${videoId}`, {
    headers: { Cookie: student.cookieHeader },
  });
  expect(res.status()).toBe(200);
});

test('403 NOT_VIDEO_OWNER for an enrolled student after the course is unpublished', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const { videoId } = await seedLessonWithReadyVideo({ courseId, instructorId: instructor.uid });
  const student = await registerStudent(request);

  await request.post(`${API_BASE}/enrollments`, {
    headers: { Cookie: student.cookieHeader },
    data: { courseId },
  });

  const unpublish = await request.post(`${API_BASE}/courses/${courseId}/unpublish`, {
    headers: { Cookie: instructor.cookieHeader },
  });
  expect(unpublish.status()).toBe(200);

  const res = await request.get(`${API_BASE}/playback/manifest/${videoId}`, {
    headers: { Cookie: student.cookieHeader },
  });
  expect(res.status()).toBe(403);
});

test('403 NOT_VIDEO_OWNER for a student after they unenrol', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const { videoId } = await seedLessonWithReadyVideo({ courseId, instructorId: instructor.uid });
  const student = await registerStudent(request);

  await request.post(`${API_BASE}/enrollments`, {
    headers: { Cookie: student.cookieHeader },
    data: { courseId },
  });

  const unenrol = await request.delete(`${API_BASE}/enrollments/${courseId}`, {
    headers: { Cookie: student.cookieHeader },
  });
  expect(unenrol.status()).toBe(204);

  const res = await request.get(`${API_BASE}/playback/manifest/${videoId}`, {
    headers: { Cookie: student.cookieHeader },
  });
  expect(res.status()).toBe(403);
});

test('404 VIDEO_NOT_FOUND for a missing :vid', async ({ request }) => {
  const inst = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: inst.cookieHeader };
  const r = await request.get(`${API_BASE}/playback/manifest/does-not-exist`, { headers: hdr });
  expect(r.status()).toBe(404);
  expect(((await r.json()) as { error: { code: string } }).error.code).toBe('VIDEO_NOT_FOUND');
});

test.fixme('404 RENDITION_NOT_FOUND for an unknown rendition', async ({ request }) => {
  const inst = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: inst.cookieHeader };
  const { videoId } = await uploadAndTranscode(request, hdr);
  const r = await request.get(
    `${API_BASE}/playback/manifest/${videoId}/rendition/xyz`,
    { headers: hdr },
  );
  expect(r.status()).toBe(404);
  expect(((await r.json()) as { error: { code: string } }).error.code).toBe('RENDITION_NOT_FOUND');
});

test('409 VIDEO_NOT_READY when state is TRANSCODING', async ({ request }) => {
  const inst = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: inst.cookieHeader };

  // Run the full setup but SKIP the fake-completer — leave state in TRANSCODING.
  const c = (await (await request.post(`${API_BASE}/courses`, {
    headers: hdr, data: { title: 'C', description: 'd' },
  })).json()) as { id: string };
  const m = (await (await request.post(`${API_BASE}/courses/${c.id}/modules`, {
    headers: hdr, data: { title: 'M' },
  })).json()) as { id: string };
  const l = (await (await request.post(`${API_BASE}/courses/${c.id}/modules/${m.id}/lessons`, {
    headers: hdr, data: { title: 'L' },
  })).json()) as { id: string };
  const sess = (await (await request.post(
    `${API_BASE}/courses/${c.id}/modules/${m.id}/lessons/${l.id}/video/upload-session`,
    { headers: hdr, data: { sizeBytes: FIXTURE_BYTES.length, contentType: 'video/mp4' } },
  )).json()) as { videoId: string; uploadSessionUri: string };
  await request.put(sess.uploadSessionUri, {
    headers: { 'Content-Range': `bytes 0-${FIXTURE_BYTES.length - 1}/${FIXTURE_BYTES.length}` },
    data: FIXTURE_BYTES,
  });
  await request.post(`${API_BASE}/videos/${sess.videoId}/upload-complete`, { headers: hdr });
  // (NO fake-completer call — state remains TRANSCODING)

  for (const url of [
    `${API_BASE}/playback/manifest/${sess.videoId}`,
    `${API_BASE}/playback/manifest/${sess.videoId}/rendition/720p`,
    `${API_BASE}/playback/keys/${sess.videoId}`,
  ]) {
    const r = await request.get(url, { headers: hdr });
    expect(r.status()).toBe(409);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe('VIDEO_NOT_READY');
  }
});
