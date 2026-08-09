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
 *
 * SCOPE OF THE TIMER — read before trusting the margin below the budget:
 * `VideoPlayerComponent.ngAfterViewInit` mounts hls.js on page load, and
 * hls.js's default `autoStartLoad: true` starts fetching and decrypting the
 * manifest, key, and segment immediately — before this test's clock starts.
 * The clock below only starts inside `player.evaluate()`, which runs after
 * `page.goto`, `toBeAttached()`, and the two zero-count assertions have all
 * resolved; by then the ~24 KB fixture segment has almost certainly already
 * been fetched and decrypted. So the measured number is "MSE append +
 * decode + first paint on an already-buffered segment", not "click to
 * first frame from a cold page". That is a faithful reading of the AC — a
 * real user clicks play on a page that has been sitting there loading, not
 * at the instant of navigation — and it matches production's own hls.js
 * config. But it means this gate CANNOT see a regression in manifest, key,
 * or segment fetch latency: those already happened off-clock. Do not
 * "fix" this by disabling autoStartLoad; that would model something the
 * product does not do.
 *
 * RESOLUTION OF THE TIMER ITSELF — the clock stops on the first `timeupdate`
 * with `currentTime > 0`, and the HTML spec caps `timeupdate` at roughly
 * 4 Hz. That gives the published median a 0-250ms positive bias; it is not
 * a decode measurement precise to the millisecond, though a real decode
 * regression still shifts it. `requestVideoFrameCallback` is the exact fix
 * if that precision is ever needed (see spec §10).
 */
const BUDGET_MS = 3000;
const VIDEO_ID = 'v-1';
// Fails the evaluate() call with a legible message well before Playwright's
// own 30s test timeout would, so a broken decrypt path reads as "no frame
// decoded" instead of an opaque "Test timeout of 30000ms exceeded."
const FIRST_FRAME_TIMEOUT_MS = 20_000;

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
    const elapsed = await player.evaluate(async (el, deadlineMs) => {
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
      const deadline = new Promise<never>((_resolve, reject) => {
        setTimeout(
          () => reject(new Error(`no frame decoded within ${deadlineMs}ms; check the HLS fixture handlers`)),
          deadlineMs,
        );
      });
      await video.play();
      return Promise.race([firstFrame, deadline]);
    }, FIRST_FRAME_TIMEOUT_MS);

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
