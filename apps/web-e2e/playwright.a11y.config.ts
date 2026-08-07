import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

/**
 * Standalone config for the accessibility suite.
 *
 * Unlike playwright.config.ts, this starts ONLY the Angular dev server: the
 * a11y specs are hermetic (every /api call is stubbed via page.route), so
 * they need neither the NestJS api nor the Firebase emulators. That keeps
 * the CI gate fast and free of seeded-data flake.
 */
const webPort = process.env['WEB_PORT'] || '4200';
const baseURL = process.env['BASE_URL'] || `http://localhost:${webPort}`;

export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src/a11y' }),
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
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
