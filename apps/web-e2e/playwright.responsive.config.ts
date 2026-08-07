import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

/**
 * Standalone config for the responsive suite (US-09-05).
 *
 * Mirrors playwright.a11y.config.ts: starts ONLY the Angular dev server,
 * because these specs are hermetic — every /api call is stubbed via
 * page.route through the shared route inventory — so they need neither the
 * NestJS api nor the Firebase emulators.
 *
 * Viewport is set per-test, not here: the whole point of the suite is to
 * drive the same route at several widths, so a config-level viewport would
 * be overwritten on every test anyway and would only mislead a reader.
 *
 * Retries come from nxE2EPreset (spread below): 2 on CI, 0 locally. As with
 * the a11y gate, a green run after a retry is NOT the same as a clean
 * first-attempt pass. An overflow that depends on a late-loading font or a
 * late-mounting image can fail once and pass on retry, which hides a real
 * layout defect behind a green checkmark. Treat repeated retries in CI logs
 * as a signal to investigate.
 */
const webPort = process.env['WEB_PORT'] || '4200';
const baseURL = process.env['BASE_URL'] || `http://localhost:${webPort}`;

export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src/responsive' }),
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: `pnpm exec nx serve web --port ${webPort}`,
      url: `http://localhost:${webPort}`,
      reuseExistingServer: !process.env['CI'],
      cwd: workspaceRoot,
      // Explicit, not Playwright's unstated 60s default — same reasoning as
      // playwright.a11y.config.ts: a cold Angular dev-server compile on a
      // fresh CI checkout needs headroom, without masking a hung server for
      // a full CI timeout.
      timeout: 90_000,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
