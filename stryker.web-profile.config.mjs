// Stryker config scoped to libs/web-profile — UC-01-03 profile editing UI
// (profile page, picture uploader, email/password change surfaces).
// Web/Angular lib — uses vite.config.mts (test block via @analogjs/vitest-angular).
// Excluded: *.routes.ts (routing config), *.module.ts (NgModule wiring),
// component template/style files; index.ts barrels; test-setup.ts boilerplate.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/web-profile/vite.config.mts',
  },
  mutate: [
    'libs/web-profile/src/lib/**/*.ts',
    '!libs/web-profile/src/lib/**/*.spec.ts',
    '!libs/web-profile/src/lib/**/*.test.ts',
    '!libs/web-profile/src/lib/**/*.routes.ts',
    '!libs/web-profile/src/lib/**/*.module.ts',
    '!libs/web-profile/src/index.ts',
    '!libs/web-profile/src/test-setup.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/web-profile/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/web-profile/mutation.json' },
  thresholds: { high: 90, low: 75, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 20000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
