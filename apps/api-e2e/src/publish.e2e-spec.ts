// NOTE: Run `pnpm emulators` and `pnpm start:api` before executing this suite.
import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  API_BASE,
  initAdmin,
  registerAndPromoteInstructor,
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
    data: { title: 'Publish Gate Course', description: 'e2e publish gate test' },
  });
  const course = (await c.json()) as { id: string };
  const m = await request.post(`${API_BASE}/courses/${course.id}/modules`, {
    headers: hdr,
    data: { title: 'Module 1' },
  });
  const mod = (await m.json()) as { id: string };
  const l = await request.post(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons`,
    { headers: hdr, data: { title: 'Lesson 1' } },
  );
  const lesson = (await l.json()) as { id: string };
  return { course, mod, lesson };
}

test(
  'publish gate happy path: round-trips DRAFT → PUBLISHED → DRAFT → ARCHIVED → DRAFT',
  async ({ request }) => {
    // 1. Register + promote instructor
    const instructor = await registerAndPromoteInstructor(request);
    const hdr = { Cookie: instructor.cookieHeader };

    // 2. Create course tree + upload video + drive to READY
    const { course, mod, lesson } = await createCourseModuleLesson(request, hdr);

    const sessRes = await request.post(
      `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/video/upload-session`,
      { headers: hdr, data: { sizeBytes: FIXTURE_BYTES.length, contentType: 'video/mp4' } },
    );
    expect(sessRes.status()).toBe(201);
    const { videoId, uploadSessionUri } = (await sessRes.json()) as {
      videoId: string;
      uploadSessionUri: string;
    };

    const putRes = await request.put(uploadSessionUri, {
      headers: {
        'Content-Range': `bytes 0-${FIXTURE_BYTES.length - 1}/${FIXTURE_BYTES.length}`,
      },
      data: FIXTURE_BYTES,
    });
    expect([200, 308]).toContain(putRes.status());

    const completeRes = await request.post(
      `${API_BASE}/videos/${videoId}/upload-complete`,
      { headers: hdr },
    );
    expect(completeRes.status()).toBe(200);
    expect(((await completeRes.json()) as { state: string }).state).toBe('TRANSCODING');

    const fakeRes = await request.post(
      `${API_BASE}/internal/fake-transcoder/complete/${videoId}`,
    );
    expect(fakeRes.status()).toBe(204);

    // 3. GET publish-eligibility → eligible
    const eligRes = await request.get(
      `${API_BASE}/courses/${course.id}/publish-eligibility`,
      { headers: hdr },
    );
    expect(eligRes.status()).toBe(200);
    const eligBody = (await eligRes.json()) as { eligible: boolean; reasons: string[] };
    expect(eligBody.eligible).toBe(true);
    expect(eligBody.reasons).toEqual([]);

    // 4. POST /publish → PUBLISHED, publishedAt defined
    const publishRes = await request.post(
      `${API_BASE}/courses/${course.id}/publish`,
      { headers: hdr },
    );
    expect(publishRes.status()).toBe(200);
    const published = (await publishRes.json()) as {
      status: string;
      publishedAt: string | undefined;
    };
    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedAt).toBeDefined();
    const firstPublishedAt = published.publishedAt;

    // 5. POST /unpublish → DRAFT, publishedAt preserved
    const unpublishRes = await request.post(
      `${API_BASE}/courses/${course.id}/unpublish`,
      { headers: hdr },
    );
    expect(unpublishRes.status()).toBe(200);
    const unpublished = (await unpublishRes.json()) as {
      status: string;
      publishedAt: string | undefined;
    };
    expect(unpublished.status).toBe('DRAFT');
    expect(unpublished.publishedAt).toBe(firstPublishedAt);

    // 6. POST /archive → ARCHIVED, archivedAt defined
    const archiveRes = await request.post(
      `${API_BASE}/courses/${course.id}/archive`,
      { headers: hdr },
    );
    expect(archiveRes.status()).toBe(200);
    const archived = (await archiveRes.json()) as {
      status: string;
      archivedAt: string | undefined;
    };
    expect(archived.status).toBe('ARCHIVED');
    expect(archived.archivedAt).toBeDefined();

    // 7. POST /restore → DRAFT, archivedAt cleared
    const restoreRes = await request.post(
      `${API_BASE}/courses/${course.id}/restore`,
      { headers: hdr },
    );
    expect(restoreRes.status()).toBe(200);
    const restored = (await restoreRes.json()) as {
      status: string;
      archivedAt: string | undefined;
    };
    expect(restored.status).toBe('DRAFT');
    expect(restored.archivedAt).toBeUndefined();
  },
);

test.describe('Course publish gate — eligibility branches', () => {
  test('COURSE_HAS_NO_MODULES — empty course', async ({ request }) => {
    const instructor = await registerAndPromoteInstructor(request);
    const hdr = { Cookie: instructor.cookieHeader };

    const c = await request.post(`${API_BASE}/courses`, {
      headers: hdr,
      data: { title: 'Empty Course', description: 'no modules' },
    });
    expect(c.status()).toBe(201);
    const course = (await c.json()) as { id: string };

    const eligRes = await request.get(
      `${API_BASE}/courses/${course.id}/publish-eligibility`,
      { headers: hdr },
    );
    expect(eligRes.status()).toBe(200);
    const body = (await eligRes.json()) as {
      eligible: boolean;
      reasons: Array<{ kind: string }>;
    };
    expect(body.eligible).toBe(false);
    expect(body.reasons).toEqual([{ kind: 'COURSE_HAS_NO_MODULES' }]);
  });

  test('MODULE_HAS_NO_LESSONS — module exists but no lessons', async ({ request }) => {
    const instructor = await registerAndPromoteInstructor(request);
    const hdr = { Cookie: instructor.cookieHeader };

    const c = await request.post(`${API_BASE}/courses`, {
      headers: hdr,
      data: { title: 'Course With Module', description: 'module no lessons' },
    });
    expect(c.status()).toBe(201);
    const course = (await c.json()) as { id: string };

    const m = await request.post(`${API_BASE}/courses/${course.id}/modules`, {
      headers: hdr,
      data: { title: 'Empty' },
    });
    expect(m.status()).toBe(201);
    const mod = (await m.json()) as { id: string; title: string; order: number };

    const eligRes = await request.get(
      `${API_BASE}/courses/${course.id}/publish-eligibility`,
      { headers: hdr },
    );
    expect(eligRes.status()).toBe(200);
    const body = (await eligRes.json()) as {
      eligible: boolean;
      reasons: Array<{ kind: string; moduleId: string; moduleTitle: string; moduleOrder: number }>;
    };
    expect(body.eligible).toBe(false);
    expect(body.reasons).toEqual([
      {
        kind: 'MODULE_HAS_NO_LESSONS',
        moduleId: mod.id,
        moduleTitle: 'Empty',
        moduleOrder: 0,
      },
    ]);
  });

  test('LESSON_HAS_NO_VIDEO — lesson without videoId', async ({ request }) => {
    const instructor = await registerAndPromoteInstructor(request);
    const hdr = { Cookie: instructor.cookieHeader };

    const c = await request.post(`${API_BASE}/courses`, {
      headers: hdr,
      data: { title: 'Course With Lesson', description: 'lesson no video' },
    });
    expect(c.status()).toBe(201);
    const course = (await c.json()) as { id: string };

    const m = await request.post(`${API_BASE}/courses/${course.id}/modules`, {
      headers: hdr,
      data: { title: 'M' },
    });
    expect(m.status()).toBe(201);
    const mod = (await m.json()) as { id: string };

    const l = await request.post(
      `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons`,
      { headers: hdr, data: { title: 'L' } },
    );
    expect(l.status()).toBe(201);
    const lesson = (await l.json()) as { id: string };

    const eligRes = await request.get(
      `${API_BASE}/courses/${course.id}/publish-eligibility`,
      { headers: hdr },
    );
    expect(eligRes.status()).toBe(200);
    const body = (await eligRes.json()) as {
      eligible: boolean;
      reasons: Array<{
        kind: string;
        moduleId: string;
        moduleTitle: string;
        moduleOrder: number;
        lessonId: string;
        lessonTitle: string;
        lessonOrder: number;
      }>;
    };
    expect(body.eligible).toBe(false);
    expect(body.reasons).toEqual([
      {
        kind: 'LESSON_HAS_NO_VIDEO',
        moduleId: mod.id,
        moduleTitle: 'M',
        moduleOrder: 0,
        lessonId: lesson.id,
        lessonTitle: 'L',
        lessonOrder: 0,
      },
    ]);
  });

  test('LESSON_VIDEO_NOT_READY — upload completes but transcoder has not finished', async ({
    request,
  }) => {
    const instructor = await registerAndPromoteInstructor(request);
    const hdr = { Cookie: instructor.cookieHeader };

    const { course, mod, lesson } = await createCourseModuleLesson(request, hdr);

    const sessRes = await request.post(
      `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/video/upload-session`,
      { headers: hdr, data: { sizeBytes: FIXTURE_BYTES.length, contentType: 'video/mp4' } },
    );
    expect(sessRes.status()).toBe(201);
    const { videoId, uploadSessionUri } = (await sessRes.json()) as {
      videoId: string;
      uploadSessionUri: string;
    };

    const putRes = await request.put(uploadSessionUri, {
      headers: {
        'Content-Range': `bytes 0-${FIXTURE_BYTES.length - 1}/${FIXTURE_BYTES.length}`,
      },
      data: FIXTURE_BYTES,
    });
    expect([200, 308]).toContain(putRes.status());

    const completeRes = await request.post(
      `${API_BASE}/videos/${videoId}/upload-complete`,
      { headers: hdr },
    );
    expect(completeRes.status()).toBe(200);
    expect(((await completeRes.json()) as { state: string }).state).toBe('TRANSCODING');

    // Deliberately skip fake-transcoder/complete — video stays in TRANSCODING.

    const eligRes = await request.get(
      `${API_BASE}/courses/${course.id}/publish-eligibility`,
      { headers: hdr },
    );
    expect(eligRes.status()).toBe(200);
    const body = (await eligRes.json()) as {
      eligible: boolean;
      reasons: Array<{ kind: string; currentState: string }>;
    };
    expect(body.eligible).toBe(false);
    expect(body.reasons[0]).toMatchObject({
      kind: 'LESSON_VIDEO_NOT_READY',
      currentState: 'TRANSCODING',
    });
  });
});
