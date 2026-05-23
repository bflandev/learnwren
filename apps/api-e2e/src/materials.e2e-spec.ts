import { expect, test, type APIRequestContext } from '@playwright/test';

import {
  API_BASE,
  initAdmin,
  registerAndPromoteInstructor,
  registerStudent,
} from './_helpers/auth';

initAdmin();

const PDF_BYTES = Buffer.from('%PDF-1.4\nfake pdf payload for e2e\n%%EOF');

/** Fake-mode signed URLs are returned relative to the API origin. */
function absolute(url: string): string {
  return url.startsWith('http') ? url : `http://localhost:3333${url}`;
}

async function createCourseModuleLesson(
  request: APIRequestContext,
  hdr: Record<string, string>,
): Promise<{ courseId: string; moduleId: string; lessonId: string }> {
  const c = await request.post(`${API_BASE}/courses`, {
    headers: hdr,
    data: { title: 'Materials Course', description: 'desc' },
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
  return { courseId: course.id, moduleId: mod.id, lessonId: lesson.id };
}

/** Drive upload-url → PUT → complete and return the material id. */
async function uploadMaterial(
  request: APIRequestContext,
  hdr: Record<string, string>,
  loc: { courseId: string; moduleId: string; lessonId: string },
  filename = 'notes.pdf',
): Promise<string> {
  const created = await request.post(
    `${API_BASE}/courses/${loc.courseId}/modules/${loc.moduleId}/lessons/${loc.lessonId}/materials/upload-url`,
    { headers: hdr, data: { filename, sizeBytes: PDF_BYTES.length } },
  );
  expect(created.status()).toBe(201);
  const { materialId, uploadUrl } = (await created.json()) as {
    materialId: string;
    uploadUrl: string;
  };
  const put = await request.put(absolute(uploadUrl), {
    // FakeMaterialsController is session-guarded — forward the instructor's
    // cookie so the dev passthrough mirrors the production GCS signed-URL
    // PUT behaviour (which carries its own short-lived credential).
    headers: { ...hdr, 'Content-Type': 'application/pdf' },
    data: PDF_BYTES,
  });
  expect(put.ok()).toBe(true);
  const done = await request.post(`${API_BASE}/materials/${materialId}/complete`, {
    headers: hdr,
  });
  expect(done.status()).toBe(200);
  expect(((await done.json()) as { state: string }).state).toBe('READY');
  return materialId;
}

test('materials happy path: upload, list, rename, download, remove', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };
  const loc = await createCourseModuleLesson(request, hdr);

  const matId = await uploadMaterial(request, hdr, loc);

  const list = await request.get(
    `${API_BASE}/courses/${loc.courseId}/modules/${loc.moduleId}/lessons/${loc.lessonId}/materials`,
    { headers: hdr },
  );
  expect(list.status()).toBe(200);
  const materials = (await list.json()) as { id: string; displayName: string }[];
  expect(materials).toHaveLength(1);
  expect(materials[0]!.displayName).toBe('notes.pdf');

  const renamed = await request.patch(`${API_BASE}/materials/${matId}`, {
    headers: hdr,
    data: { displayName: 'Course Notes' },
  });
  expect(renamed.status()).toBe(200);
  expect(((await renamed.json()) as { displayName: string }).displayName).toBe('Course Notes');

  const dl = await request.get(`${API_BASE}/materials/${matId}/download-url`, { headers: hdr });
  expect(dl.status()).toBe(200);
  const { downloadUrl } = (await dl.json()) as { downloadUrl: string };
  const file = await request.get(absolute(downloadUrl), { headers: hdr });
  expect(file.status()).toBe(200);
  expect((await file.body()).length).toBe(PDF_BYTES.length);

  const del = await request.delete(`${API_BASE}/materials/${matId}`, { headers: hdr });
  expect(del.status()).toBe(204);
  const after = await request.get(
    `${API_BASE}/courses/${loc.courseId}/modules/${loc.moduleId}/lessons/${loc.lessonId}/materials`,
    { headers: hdr },
  );
  expect((await after.json()) as unknown[]).toHaveLength(0);
});

test('rejects unauthenticated, wrong-role, and wrong-instructor requests', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };
  const loc = await createCourseModuleLesson(request, hdr);
  const uploadUrlPath = `${API_BASE}/courses/${loc.courseId}/modules/${loc.moduleId}/lessons/${loc.lessonId}/materials/upload-url`;

  // Override the cookie jar so this request is truly unauthenticated.
  // Playwright stores Set-Cookie from earlier requests; passing Cookie: ''
  // forces no session cookie on the wire.
  const unauth = await request.post(uploadUrlPath, {
    headers: { Cookie: '' },
    data: { filename: 'a.pdf', sizeBytes: 10 },
  });
  expect(unauth.status()).toBe(401);

  const student = await registerStudent(request);
  const asStudent = await request.post(uploadUrlPath, {
    headers: { Cookie: student.cookieHeader },
    data: { filename: 'a.pdf', sizeBytes: 10 },
  });
  expect(asStudent.status()).toBe(403);
  expect(((await asStudent.json()) as { error: { code: string } }).error.code).toBe(
    'INSUFFICIENT_ROLE',
  );

  const other = await registerAndPromoteInstructor(request);
  const asOther = await request.post(uploadUrlPath, {
    headers: { Cookie: other.cookieHeader },
    data: { filename: 'a.pdf', sizeBytes: 10 },
  });
  expect(asOther.status()).toBe(403);
  expect(((await asOther.json()) as { error: { code: string } }).error.code).toBe(
    'NOT_COURSE_OWNER',
  );

  const matId = await uploadMaterial(request, hdr, loc);
  const otherDownload = await request.get(`${API_BASE}/materials/${matId}/download-url`, {
    headers: { Cookie: other.cookieHeader },
  });
  expect(otherDownload.status()).toBe(403);
  expect(((await otherDownload.json()) as { error: { code: string } }).error.code).toBe(
    'NOT_MATERIAL_OWNER',
  );

  const otherRename = await request.patch(`${API_BASE}/materials/${matId}`, {
    headers: { Cookie: other.cookieHeader },
    data: { displayName: 'hijack' },
  });
  expect(otherRename.status()).toBe(403);
  expect(((await otherRename.json()) as { error: { code: string } }).error.code).toBe(
    'NOT_MATERIAL_OWNER',
  );

  const otherDelete = await request.delete(`${API_BASE}/materials/${matId}`, {
    headers: { Cookie: other.cookieHeader },
  });
  expect(otherDelete.status()).toBe(403);
  expect(((await otherDelete.json()) as { error: { code: string } }).error.code).toBe(
    'NOT_MATERIAL_OWNER',
  );
});

test('rejects an unsupported file type at upload-url', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };
  const loc = await createCourseModuleLesson(request, hdr);
  const res = await request.post(
    `${API_BASE}/courses/${loc.courseId}/modules/${loc.moduleId}/lessons/${loc.lessonId}/materials/upload-url`,
    { headers: hdr, data: { filename: 'malware.exe', sizeBytes: 10 } },
  );
  expect(res.status()).toBe(400);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
    'UNSUPPORTED_MATERIAL_TYPE',
  );
});

test('complete is rejected when the object was never uploaded, and on a second call', async ({
  request,
}) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };
  const loc = await createCourseModuleLesson(request, hdr);

  const created = await request.post(
    `${API_BASE}/courses/${loc.courseId}/modules/${loc.moduleId}/lessons/${loc.lessonId}/materials/upload-url`,
    { headers: hdr, data: { filename: 'notes.pdf', sizeBytes: PDF_BYTES.length } },
  );
  const { materialId } = (await created.json()) as { materialId: string };
  const noObject = await request.post(`${API_BASE}/materials/${materialId}/complete`, {
    headers: hdr,
  });
  expect(noObject.status()).toBe(422);
  expect(((await noObject.json()) as { error: { code: string } }).error.code).toBe(
    'UPLOAD_OBJECT_MISSING',
  );

  const matId = await uploadMaterial(request, hdr, loc);
  const again = await request.post(`${API_BASE}/materials/${matId}/complete`, { headers: hdr });
  expect(again.status()).toBe(409);
  expect(((await again.json()) as { error: { code: string } }).error.code).toBe(
    'INVALID_MATERIAL_STATE',
  );
});

test('deleting the lesson cascades to its materials', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };
  const loc = await createCourseModuleLesson(request, hdr);
  const matId = await uploadMaterial(request, hdr, loc);

  const del = await request.delete(
    `${API_BASE}/courses/${loc.courseId}/modules/${loc.moduleId}/lessons/${loc.lessonId}`,
    { headers: hdr },
  );
  expect(del.status()).toBe(204);

  const dl = await request.get(`${API_BASE}/materials/${matId}/download-url`, { headers: hdr });
  expect(dl.status()).toBe(404);
  expect(((await dl.json()) as { error: { code: string } }).error.code).toBe('MATERIAL_NOT_FOUND');
});
