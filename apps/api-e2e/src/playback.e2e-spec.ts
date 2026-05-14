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
  expect(fake.status()).toBe(204);

  return { courseId: c.id, moduleId: m.id, lessonId: l.id, videoId: sess.videoId };
}

test('owner can fetch master, rendition, and key', async ({ request }) => {
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
