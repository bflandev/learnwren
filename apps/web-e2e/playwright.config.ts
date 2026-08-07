import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

// For CI, you may want to set BASE_URL to the deployed application.
// WEB_PORT lets a local run sidestep another project squatting on :4200.
const webPort = process.env['WEB_PORT'] || '4200';
const baseURL = process.env['BASE_URL'] || `http://localhost:${webPort}`;

// Storage emulator host for public object URLs. Default matches firebase.json;
// running the suite under `firebase emulators:exec` with a shifted-port config
// overrides it via the standard env var (mirrors the WEB_PORT pattern above).
const storageHost = (
  process.env['FIREBASE_STORAGE_EMULATOR_HOST'] || 'localhost:9199'
).replace(/^https?:\/\//, '');

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src' }),
  // The hermetic a11y suite (apps/web-e2e/src/a11y/*.a11y.spec.ts) has its own
  // config — playwright.a11y.config.ts — that starts only the Angular dev
  // server and stubs every /api call. Without this, this emulator+api-backed
  // config also picks up those specs via the shared testDir, running them in
  // an environment they were never designed for and misattributing failures.
  testIgnore: '**/a11y/**',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  /*
   * Boot the api alongside the web dev server. Most web-e2e specs
   * (courses, enrollment, learn, videos, materials, publish-gate) talk to
   * the api at :3333 and seed Firestore via firebase-admin against the
   * emulators, so the api must be running for the suite to pass. The api
   * config mirrors apps/api-e2e/playwright.config.ts — fake-mode video and
   * materials adapters, console email transport, test outbox enabled.
   */
  webServer: [
    {
      command: `pnpm exec nx serve web --port ${webPort}`,
      url: `http://localhost:${webPort}`,
      reuseExistingServer: !process.env['CI'],
      cwd: workspaceRoot,
    },
    {
      command: 'node dist/apps/api/main.js',
      url: 'http://localhost:3333/api/health',
      reuseExistingServer: !process.env['CI'],
      cwd: workspaceRoot,
      timeout: 30000,
      env: {
        LEARNWREN_VIDEO_SOURCE_BUCKET: 'learnwren-e2e-source',
        LEARNWREN_VIDEO_OUTPUT_BUCKET: 'learnwren-e2e-output',
        LEARNWREN_VIDEO_TRANSCODER: 'fake',
        LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE: 'true',
        LEARNWREN_MATERIALS_STORAGE_FAKE: 'true',
        // Cover image upload (mirrors apps/api-e2e/playwright.config.ts).
        // LEARNWREN_COVER_STORAGE is unset, so the api uses the default
        // adapter; bucket + public base URL point at the emulator bucket.
        LEARNWREN_COVER_BUCKET: 'learnwren-e2e-covers',
        LEARNWREN_COVER_PUBLIC_BASE_URL: `http://${storageHost}/v0/b/learnwren-e2e-covers/o`,
        // Profile picture storage mirrors the cover pattern: defaults to fake
        // (in-memory) when LEARNWREN_PICTURE_STORAGE is unset, but bucket +
        // public base URL are still required at boot.
        LEARNWREN_PICTURE_BUCKET: 'learnwren-e2e-pictures',
        LEARNWREN_PICTURE_PUBLIC_BASE_URL: `http://${storageHost}/v0/b/learnwren-e2e-pictures/o`,
        // Real adapter so uploads land in the Storage emulator and the public
        // URL actually serves. The old fake default left photoUrl pointing at
        // nothing — the legacy lw-avatar kept a broken <img> in the DOM so the
        // spec passed anyway; hlm-avatar removes the img on load error, which
        // exposed the dead URL. (Same pattern covers already use.)
        LEARNWREN_PICTURE_STORAGE: 'firebase',
        LEARNWREN_EMAIL_TRANSPORT: 'console',
        LEARNWREN_TEST_OUTBOX_ENABLED: '1',
        // All parallel workers share 127.0.0.1, so the production per-IP burst
        // limit (100/10s) can trip mid-suite (CI-observed 429 on register).
        LEARNWREN_THROTTLE_BURST_LIMIT: '10000',
        LEARNWREN_THROTTLE_SUSTAINED_LIMIT: '50000',
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
