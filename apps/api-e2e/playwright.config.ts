import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

// For CI, you may want to set BASE_URL to the deployed application.
const baseURL = process.env['BASE_URL'] || 'http://localhost:3333';

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
  // Picks up *.spec.ts, *.test.ts, and *.e2e-spec.ts. Default Playwright glob
  // omits the hyphenated `-spec` form, which silently skipped the auth and
  // firestore-rules suites.
  testMatch: '**/*.@(spec|e2e-spec|test).?(c|m)[jt]s?(x)',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'node dist/apps/api/main.js',
    url: 'http://localhost:3333/api/health',
    reuseExistingServer: !process.env['CI'],
    cwd: workspaceRoot,
    timeout: 30000,
    // The api reads its video config eagerly at boot. e2e runs the transcoder
    // and playback storage in their fake (in-memory) modes, so these need no
    // real GCP credentials or buckets — just non-empty values. Merged over
    // process.env by Playwright.
    env: {
      LEARNWREN_VIDEO_SOURCE_BUCKET: 'learnwren-e2e-source',
      LEARNWREN_VIDEO_OUTPUT_BUCKET: 'learnwren-e2e-output',
      LEARNWREN_VIDEO_TRANSCODER: 'fake',
      LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE: 'true',
      // FakeMaterialsController is now gated on the storage-impl flag (not
      // NODE_ENV), so the dev-only passthrough must be enabled explicitly
      // for the materials suite. The adapter already defaults to fake when
      // NODE_ENV != 'production', but the controller registration is gated.
      LEARNWREN_MATERIALS_STORAGE_FAKE: 'true',
      LEARNWREN_EMAIL_TRANSPORT: 'console',
      // Surface the in-process outbox via GET /api/auth/_test/last-email so
      // the suite can recover unlock tokens, which are now hashed in Firestore.
      LEARNWREN_TEST_OUTBOX_ENABLED: '1',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
