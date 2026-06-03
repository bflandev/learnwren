import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { API_BASE, initAdmin, registerStudent } from './_helpers/auth';

initAdmin();

// The cover fixture is a 1280x720 JPEG which comfortably exceeds the 256x256
// minimum the profile picture service enforces.
const FIXTURE_PATH = join(__dirname, 'fixtures', 'cover-1280x720.jpg');

test('UC-01-03 Slice B — profile picture PUT → GET → DELETE → GET round-trip', async ({
  request,
}) => {
  const session = await registerStudent(request);
  const hdr = { Cookie: session.cookieHeader };

  // Sanity-check the seeded user has no photoUrl yet.
  const before = await request.get(`${API_BASE}/profile`, { headers: hdr });
  expect(before.status()).toBe(200);
  const beforeBody = await before.json();
  expect(beforeBody.photoUrl).toBeUndefined();

  // PUT — upload the picture.
  const bytes = readFileSync(FIXTURE_PATH);
  const put = await request.put(`${API_BASE}/profile/picture`, {
    headers: hdr,
    multipart: {
      file: { name: 'avatar.jpg', mimeType: 'image/jpeg', buffer: bytes },
    },
  });
  expect(put.status()).toBe(200);
  const putBody = await put.json();
  expect(putBody.uid).toBe(session.uid);
  // The fake adapter stores at profile-pictures/<uid>/avatar.jpg; the
  // service builds the URL as `${publicBaseUrl}/${path}?v=<iso>`.
  expect(putBody.photoUrl).toMatch(
    new RegExp(`profile-pictures/${session.uid}/avatar\\.jpg\\?v=`),
  );

  // GET — reflects the new photoUrl.
  const get = await request.get(`${API_BASE}/profile`, { headers: hdr });
  expect(get.status()).toBe(200);
  const getBody = await get.json();
  expect(getBody.photoUrl).toBe(putBody.photoUrl);

  // DELETE — removes the photo.
  const del = await request.delete(`${API_BASE}/profile/picture`, { headers: hdr });
  expect(del.status()).toBe(200);
  const delBody = await del.json();
  expect(delBody.photoUrl).toBeUndefined();

  // GET — photoUrl is gone.
  const get2 = await request.get(`${API_BASE}/profile`, { headers: hdr });
  expect(get2.status()).toBe(200);
  const get2Body = await get2.json();
  expect(get2Body.photoUrl).toBeUndefined();
});

// Regression lock (N3): PictureExceptionFilter must @Catch AuthException so an
// unauthenticated request renders 401, not a 500.
test('401 — an unauthenticated profile-picture edit is rejected, not 500', async ({ request }) => {
  const res = await request.put(`${API_BASE}/profile/picture`);
  expect(res.status()).toBe(401);
});
