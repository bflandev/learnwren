import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { API_BASE, initAdmin, registerAndPromoteInstructor } from './_helpers/auth';

initAdmin();

test('instructor uploads, replaces, then removes a cover image', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };

  const create = await request.post(`${API_BASE}/courses`, {
    headers: hdr,
    data: { title: 'Cover Test', description: 'd' },
  });
  expect(create.status()).toBe(201);
  const course = await create.json();

  const fixturePath = join(__dirname, 'fixtures', 'cover-1280x720.jpg');
  const bytes = readFileSync(fixturePath);
  const upload = await request.put(`${API_BASE}/courses/${course.id}/cover`, {
    headers: hdr,
    multipart: {
      file: { name: 'cover.jpg', mimeType: 'image/jpeg', buffer: bytes },
    },
  });
  expect(upload.status()).toBe(200);
  const uploadBody = await upload.json();
  expect(uploadBody.coverImageUrl).toMatch(
    new RegExp(`course-covers/${course.id}/cover\\.jpg\\?v=`),
  );
  expect(uploadBody.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

  const get = await request.get(`${API_BASE}/courses/${course.id}`, { headers: hdr });
  expect(get.status()).toBe(200);
  const tree = await get.json();
  expect(tree.course.coverImageUrl).toBe(uploadBody.coverImageUrl);

  // Wait at least 1ms so the ISO-string updatedAt (and therefore the cache-
  // busting ?v= query) differs from the first upload.
  await new Promise((r) => setTimeout(r, 5));

  const replace = await request.put(`${API_BASE}/courses/${course.id}/cover`, {
    headers: hdr,
    multipart: { file: { name: 'cover.jpg', mimeType: 'image/jpeg', buffer: bytes } },
  });
  expect(replace.status()).toBe(200);
  const replaceBody = await replace.json();
  expect(replaceBody.coverImageUrl).not.toBe(uploadBody.coverImageUrl);

  const del = await request.delete(`${API_BASE}/courses/${course.id}/cover`, { headers: hdr });
  expect(del.status()).toBe(204);
  const get2 = await request.get(`${API_BASE}/courses/${course.id}`, { headers: hdr });
  const tree2 = await get2.json();
  expect(tree2.course.coverImageUrl).toBeUndefined();
});

test('non-JPEG/PNG file is rejected with UNSUPPORTED_COVER_FORMAT', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };
  const create = await request.post(`${API_BASE}/courses`, {
    headers: hdr,
    data: { title: 'Cover Test', description: 'd' },
  });
  const course = await create.json();
  const r = await request.put(`${API_BASE}/courses/${course.id}/cover`, {
    headers: hdr,
    multipart: {
      file: { name: 'cover.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') },
    },
  });
  expect(r.status()).toBe(415);
  const body = await r.json();
  expect(body.error.code).toBe('UNSUPPORTED_COVER_FORMAT');
});

test('too-small image is rejected with COVER_DIMENSIONS_TOO_SMALL', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };
  const create = await request.post(`${API_BASE}/courses`, {
    headers: hdr,
    data: { title: 'Cover Test', description: 'd' },
  });
  const course = await create.json();
  const tinyPath = join(__dirname, 'fixtures', 'cover-640x480.jpg');
  const tiny = readFileSync(tinyPath);
  const r = await request.put(`${API_BASE}/courses/${course.id}/cover`, {
    headers: hdr,
    multipart: { file: { name: 'tiny.jpg', mimeType: 'image/jpeg', buffer: tiny } },
  });
  expect(r.status()).toBe(400);
  const body = await r.json();
  expect(body.error.code).toBe('COVER_DIMENSIONS_TOO_SMALL');
  expect(body.error.details).toEqual({ width: 640, height: 480 });
});
