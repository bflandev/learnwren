import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

// For CI, you may want to set BASE_URL to the deployed application.
const baseURL = process.env['BASE_URL'] || 'http://localhost:4200';

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
      command: 'pnpm exec nx serve web',
      url: 'http://localhost:4200',
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
        LEARNWREN_COVER_PUBLIC_BASE_URL: 'http://localhost:9199/v0/b/learnwren-e2e-covers/o',
        // Profile picture storage mirrors the cover pattern: defaults to fake
        // (in-memory) when LEARNWREN_PICTURE_STORAGE is unset, but bucket +
        // public base URL are still required at boot.
        LEARNWREN_PICTURE_BUCKET: 'learnwren-e2e-pictures',
        LEARNWREN_PICTURE_PUBLIC_BASE_URL:
          'http://localhost:9199/v0/b/learnwren-e2e-pictures/o',
        LEARNWREN_EMAIL_TRANSPORT: 'console',
        LEARNWREN_TEST_OUTBOX_ENABLED: '1',
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
