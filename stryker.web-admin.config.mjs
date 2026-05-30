// Stryker config scoped to libs/web-admin — US-08-03 admin instructor-application
// review (the first administrator surface: queue page, HTTP service, role guard).
// Web/Angular lib — uses vite.config.mts (test block via @analogjs/vitest-angular).
// Excluded: *.routes.ts (routing config), *.module.ts (NgModule wiring),
// component template/style files; index.ts barrels; test-setup.ts boilerplate.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/web-admin/vite.config.mts',
  },
  mutate: [
    'libs/web-admin/src/lib/**/*.ts',
    '!libs/web-admin/src/lib/**/*.spec.ts',
    '!libs/web-admin/src/lib/**/*.test.ts',
    '!libs/web-admin/src/lib/**/*.routes.ts',
    '!libs/web-admin/src/lib/**/*.module.ts',
    '!libs/web-admin/src/index.ts',
    '!libs/web-admin/src/test-setup.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/web-admin/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/web-admin/mutation.json' },
  thresholds: { high: 90, low: 75, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 20000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
