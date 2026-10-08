import { expect, test } from '@playwright/test';

import {
  API_BASE,
  registerAndPromoteInstructor,
  registerStudent,
  withAnonRequest,
} from './_helpers/auth';
import { seam } from './_helpers/seam';

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
  await seam.setDoc(`courses/${id}`, {
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
  await seam.setDoc(`courses/${args.courseId}/modules/${mid}`, { id: mid, courseId: args.courseId, title: 'M1', order: 0, createdAt: now, updatedAt: now });

  const vid = `cap-e2e-vid-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await seam.setDoc(`videos/${vid}`, {
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
  await seam.setDoc(`courses/${args.courseId}/modules/${mid}/lessons/${lid}`, {
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

type TrackMeta = { language: string; label: string; updatedAt: string };
type Session = { cookieHeader: string };
type Request = import('@playwright/test').APIRequestContext;

function putTrack(request: Request, who: Session, videoId: string, lang: string, body = VALID_VTT) {
  return request.put(`${API_BASE}/videos/${videoId}/captions/${lang}`, {
    headers: { Cookie: who.cookieHeader },
    multipart: { file: { name: 'captions.vtt', mimeType: 'text/vtt', buffer: Buffer.from(body) } },
  });
}

function listTracks(request: Request, who: Session, videoId: string) {
  return request.get(`${API_BASE}/videos/${videoId}/captions`, { headers: { Cookie: who.cookieHeader } });
}

function deliver(request: Request, who: Session, videoId: string, lang: string) {
  return request.get(`${API_BASE}/playback/captions/${videoId}/${lang}`, { headers: { Cookie: who.cookieHeader } });
}

test('owner uploads two languages, lists both, and streams each', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const { videoId } = await seedLessonWithReadyVideo({ courseId, instructorId: instructor.uid });

  const en = await putTrack(request, instructor, videoId, 'en');
  expect(en.status()).toBe(200);
  const enBody = (await en.json()) as TrackMeta;
  expect(enBody).toMatchObject({ language: 'en', label: 'English' });
  expect(enBody.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

  // Tag is canonicalised server-side.
  const pt = await putTrack(request, instructor, videoId, 'pt-br', VALID_VTT.replace('Hello', 'Olá'));
  expect(pt.status()).toBe(200);
  expect((await pt.json()) as TrackMeta).toMatchObject({ language: 'pt-BR', label: 'Brazilian Portuguese' });

  const list = await listTracks(request, instructor, videoId);
  expect(list.status()).toBe(200);
  expect(((await list.json()) as TrackMeta[]).map((t) => t.language)).toEqual(['pt-BR', 'en']);

  const ptDelivery = await deliver(request, instructor, videoId, 'pt-BR');
  expect(ptDelivery.status()).toBe(200);
  expect(ptDelivery.headers()['content-type']).toMatch(/text\/vtt/);
  expect(await ptDelivery.text()).toContain('Olá');
  expect(await (await deliver(request, instructor, videoId, 'en')).text()).toContain('Hello');
});

test('a legacy single-track doc (id === videoId) is listed and replaced in place', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const { videoId } = await seedLessonWithReadyVideo({ courseId, instructorId: instructor.uid });
  const now = new Date().toISOString();
  await seam.setDoc(`videoCaptions/${videoId}`, {
    videoId, language: 'en', label: 'English', format: 'vtt', content: 'WEBVTT\n\nlegacy', createdAt: now, updatedAt: now,
  });

  expect(await (await deliver(request, instructor, videoId, 'en')).text()).toContain('legacy');
  expect((await putTrack(request, instructor, videoId, 'en')).status()).toBe(200);

  const list = (await (await listTracks(request, instructor, videoId)).json()) as TrackMeta[];
  expect(list).toHaveLength(1);
  expect(await (await deliver(request, instructor, videoId, 'en')).text()).toContain('Hello');
});

test('invalid VTT and unknown language are rejected with typed codes', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const { videoId } = await seedLessonWithReadyVideo({ courseId, instructorId: instructor.uid });

  const badFile = await putTrack(request, instructor, videoId, 'en', 'not a vtt file');
  expect(badFile.status()).toBe(400);
  expect(((await badFile.json()) as { error: { code: string } }).error.code).toBe('INVALID_CAPTION_FILE');

  const badLang = await putTrack(request, instructor, videoId, 'xx');
  expect(badLang.status()).toBe(400);
  expect(((await badLang.json()) as { error: { code: string } }).error.code).toBe('INVALID_CAPTION_LANGUAGE');
});

test('enrolled student can fetch captions; non-enrolled student gets 403', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const { videoId } = await seedLessonWithReadyVideo({ courseId, instructorId: instructor.uid });
  expect((await putTrack(request, instructor, videoId, 'fr')).status()).toBe(200);

  const student = await registerStudent(request);
  const enrol = await request.post(`${API_BASE}/enrollments`, {
    headers: { Cookie: student.cookieHeader },
    data: { courseId },
  });
  expect(enrol.status()).toBe(201);

  const studentDelivery = await deliver(request, student, videoId, 'fr');
  expect(studentDelivery.status()).toBe(200);
  expect(await studentDelivery.text()).toContain('WEBVTT');

  const other = await registerStudent(request);
  const otherDelivery = await deliver(request, other, videoId, 'fr');
  expect(otherDelivery.status()).toBe(403);
  expect(((await otherDelivery.json()) as { error: { code: string } }).error.code).toBe('NOT_VIDEO_OWNER');
});

test('deleting one language leaves the others; its delivery returns 404 CAPTIONS_NOT_FOUND', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const { videoId } = await seedLessonWithReadyVideo({ courseId, instructorId: instructor.uid });
  expect((await putTrack(request, instructor, videoId, 'en')).status()).toBe(200);
  expect((await putTrack(request, instructor, videoId, 'fr')).status()).toBe(200);

  const del = await request.delete(`${API_BASE}/videos/${videoId}/captions/en`, {
    headers: { Cookie: instructor.cookieHeader },
  });
  expect(del.status()).toBe(204);

  const delivery = await deliver(request, instructor, videoId, 'en');
  expect(delivery.status()).toBe(404);
  expect(((await delivery.json()) as { error: { code: string } }).error.code).toBe('CAPTIONS_NOT_FOUND');

  const list = (await (await listTracks(request, instructor, videoId)).json()) as TrackMeta[];
  expect(list.map((t) => t.language)).toEqual(['fr']);
});

test('401 unauthenticated for captions endpoints', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const courseId = await seedCourse({ status: 'PUBLISHED', instructorId: instructor.uid });
  const { videoId } = await seedLessonWithReadyVideo({ courseId, instructorId: instructor.uid });

  await withAnonRequest(async (anon) => {
    const delivery = await anon.get(`${API_BASE}/playback/captions/${videoId}/en`);
    expect(delivery.status()).toBe(401);

    const metaAnon = await anon.get(`${API_BASE}/videos/${videoId}/captions`);
    expect(metaAnon.status()).toBe(401);
  });
});
