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
 *
 * Retries come from nxE2EPreset (spread below): 2 on CI, 0 locally. A green
 * run after a retry is NOT the same as a clean first-attempt pass — treat
 * repeated retries in CI logs as a signal to go look, not as noise to
 * ignore. A debounced error alert or a late-mounting live region can fail
 * once and pass on retry, which would hide a real intermittent WCAG
 * violation behind a green checkmark exactly as easily as it hides a
 * dev-server warm-up race.
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
      // Explicit, not Playwright's unstated 60s default: gives a cold
      // Angular dev-server compile on a fresh CI checkout (no Vite cache)
      // headroom to finish before Playwright gives up on the webServer
      // block, without masking a genuinely hung server for a full
      // CI-timeout's worth of time. NOTE: this does NOT explain the
      // intermittent role=alert timeout on the sign-in keyboard journey
      // (keyboard.a11y.spec.ts) — that failure reproduces on an
      // already-warm server too (see the repro log in task-7-report.md,
      // "Fix round 1"), so it is a real intermittent defect, not a
      // dev-server warm-up race. Investigate before assuming a retry-green
      // run means the gate is healthy.
      timeout: 90_000,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
