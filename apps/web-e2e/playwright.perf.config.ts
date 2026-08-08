import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';
import { join } from 'node:path';

/**
 * Standalone config for the performance suite (US-09-01).
 *
 * Differs from playwright.a11y.config.ts and playwright.responsive.config.ts
 * in one way that matters: it serves the PRODUCTION BUILD through a static
 * server rather than running `nx serve web`. Dev-server bundles are
 * unminified, untree-shaken, and run dev-mode change detection, so an LCP
 * measured against them describes the dev server and not the product.
 * `web-e2e:perf` declares dependsOn: ["web:build"] so the bundle exists.
 *
 * Like the other two suites it is hermetic — every /api call is stubbed via
 * page.route — so it needs neither the NestJS api nor the Firebase emulators.
 *
 * RETRIES ARE DISABLED HERE, unlike the other two suites. A perf budget that
 * passes on the third attempt has not been met; retrying a timing assertion
 * launders a real regression into a green checkmark. Flakiness is instead
 * absorbed by the median-of-3 sampling INSIDE each test (see
 * _helpers/perf-measure.ts), which is a statistic rather than a do-over.
 */
const webPort = Number(process.env['PERF_WEB_PORT'] || 4310);
const baseURL = process.env['BASE_URL'] || `http://localhost:${webPort}`;
const buildOutput = join(workspaceRoot, 'dist/apps/web/browser');
const cliEntry = join(workspaceRoot, 'apps/web-e2e/src/_helpers/static-server.cli.ts');

export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src/perf' }),
  retries: 0,
  // Timing tests must not run concurrently: parallel workers contend for CPU
  // and network, which is exactly the noise the median is meant to exclude.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: `pnpm exec tsx ${cliEntry} ${buildOutput} ${webPort}`,
      url: baseURL,
      reuseExistingServer: !process.env['CI'],
      cwd: workspaceRoot,
      timeout: 30_000,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
