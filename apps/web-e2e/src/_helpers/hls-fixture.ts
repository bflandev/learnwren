import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

/**
 * Serve the committed HLS fixture through page.route, mirroring the four
 * endpoints the player actually walks in production (verified against
 * libs/api-courses/src/lib/video/playback/playback.controller.ts and
 * manifest.rewriter.ts):
 *
 *   master playlist -> rendition playlist -> AES key -> segments
 *
 * Segment URIs are a synthetic /perf-fixture/ path rather than the absolute
 * signed GCS URLs production emits, because a signed URL is unstubbable by
 * design. The shape the PLAYER sees is identical: "the playlist hands me
 * URLs, I fetch them".
 */
const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'hls');
const M3U8 = 'application/vnd.apple.mpegurl';
/** The only segment filenames the rendition playlist ever references. */
const SEGMENT_NAME = /^seg\d+\.ts$/;

function read(name: string): Buffer {
  return readFileSync(join(FIXTURE_DIR, name));
}

export async function stubHlsFixture(page: Page, videoId: string): Promise<void> {
  // Registration order is defensive, not load-bearing here: none of these
  // four patterns is a prefix of another (the master pattern has no
  // trailing wildcard, so it can't match the rendition URL below), so
  // Playwright's reverse-registration-order matching never has to choose
  // between them. Kept broad-to-specific anyway as the convention this repo
  // otherwise relies on.
  await page.route(`**/api/playback/manifest/${videoId}`, (route) =>
    route.fulfill({ status: 200, contentType: M3U8, body: read('master.m3u8') }),
  );
  await page.route(`**/api/playback/manifest/${videoId}/rendition/720p`, (route) =>
    route.fulfill({ status: 200, contentType: M3U8, body: read('720p.m3u8') }),
  );
  await page.route(`**/api/playback/keys/${videoId}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/octet-stream',
      body: read('key.bin'),
    }),
  );
  await page.route('**/perf-fixture/*.ts', async (route) => {
    const name = route.request().url().split('/').pop() ?? '';
    // The name comes off a URL and is handed straight to readFileSync, so it
    // is validated against an explicit allowlist pattern rather than trusted:
    // segment files are seg0.ts, seg1.ts, … and nothing else. A name that
    // fails the pattern, or a segment the fixture directory does not have,
    // gets a 404 — a legible "the playlist asked for a segment we don't ship"
    // rather than a filesystem read outside the fixture directory or an
    // unhandled rejection inside a route handler.
    if (!SEGMENT_NAME.test(name)) {
      await route.fulfill({ status: 404, body: `unexpected segment name "${name}"` });
      return;
    }
    try {
      await route.fulfill({
        status: 200,
        contentType: 'video/mp2t',
        body: read(`${name}.bin`),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await route
        .fulfill({ status: 404, body: `missing fixture segment "${name}.bin": ${reason}` })
        .catch(() => {
          // The page or context closed mid-flight; nothing left to answer.
        });
    }
  });
}
