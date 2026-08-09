import { expect, test } from '@playwright/test';

import { LESSON_PAYLOAD_READY } from '../_helpers/route-inventory';
import { stubAuth, stubJson } from '../_helpers/route-stubs';
import { stubHlsFixture } from '../_helpers/hls-fixture';
import {
  SAMPLE_COUNT,
  STUB_DELAY_MS,
  applyBroadbandThrottle,
  median,
} from '../_helpers/perf-measure';

/**
 * US-09-01: "Video playback must begin within 3 seconds of clicking play on
 * a standard broadband connection."
 *
 * This is also the first thing in the repo that proves playback starts AT
 * ALL. videos.spec.ts:257-258 records that the fake playback seam returns
 * gs-stub:// segment URIs hls.js cannot fetch, so until now no CI run had
 * ever decoded a frame.
 */
const BUDGET_MS = 3000;
const VIDEO_ID = 'v-1';

test(`playback begins within ${BUDGET_MS}ms of play()`, async ({ page }) => {
  await applyBroadbandThrottle(page);
  await stubAuth(page, 'student');
  // fakePlayback MUST be false: in fake mode VideoPlayerComponent renders a
  // dev placeholder and never mounts hls.js
  // (video-player.component.html:14-21), so the gate would time nothing.
  await stubJson(page, '**/api/playback/config', { fakePlayback: false }, 200, STUB_DELAY_MS);
  await stubJson(
    page,
    '**/api/learn/courses/c-1/lessons/l-1',
    LESSON_PAYLOAD_READY,
    200,
    STUB_DELAY_MS,
  );
  await stubHlsFixture(page, VIDEO_ID);

  const samples: number[] = [];

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    await page.goto('/learn/c-1/l-1');

    const player = page.locator('[data-testid="video-player"]');
    await expect(player).toBeAttached();
    // If the player fell into its error state the timing below would hang
    // until the test timeout, reporting a useless "exceeded 30000ms" rather
    // than the actual cause. Fail loudly instead.
    await expect(page.locator('[data-testid="video-player-error"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="video-player-dev-placeholder"]')).toHaveCount(0);

    // The player uses native <video controls>, whose buttons live in the
    // browser's shadow UI and are not reliably clickable from Playwright.
    // Calling play() starts the same clock at the same point in the
    // pipeline; it is the honest equivalent of the user's click, not a
    // real pointer event.
    //
    // video.muted = true before play(): Chromium's autoplay policy can
    // reject a programmatic play() with no user gesture. Muting first keeps
    // the call from being rejected while still timing the real pipeline —
    // a muted programmatic start reaches the same first-frame event as an
    // audible one.
    const elapsed = await player.evaluate(async (el) => {
      const video = el as HTMLVideoElement;
      video.muted = true;
      const started = performance.now();
      const firstFrame = new Promise<number>((resolveFrame) => {
        const onTimeUpdate = () => {
          if (video.currentTime > 0) {
            video.removeEventListener('timeupdate', onTimeUpdate);
            resolveFrame(performance.now() - started);
          }
        };
        video.addEventListener('timeupdate', onTimeUpdate);
      });
      await video.play();
      return firstFrame;
    });

    samples.push(elapsed);
  }

  const observed = Math.round(median(samples));
  // Same log convention as load-time.perf.spec.ts: one grep-able line per
  // run so CI carries the margin even on a passing run.
  console.log(
    `[perf] video start samples=[${samples.map(Math.round).join(',')}]ms ` +
      `median=${observed}ms budget=${BUDGET_MS}ms`,
  );
  expect(
    observed,
    `time-to-first-frame median ${observed}ms over budget ${BUDGET_MS}ms ` +
      `(samples: ${samples.map(Math.round).join(', ')}ms)`,
  ).toBeLessThanOrEqual(BUDGET_MS);
});
