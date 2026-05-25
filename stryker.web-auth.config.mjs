// Stryker config scoped to libs/web-auth.
// Web/Angular lib — uses vite.config.mts (test block via @analogjs/vitest-angular).
// Excluded: *.module.ts (NgModule wiring), *.routes.ts (routing config),
// component template/style files; index.ts barrels.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/web-auth/vite.config.mts',
  },
  mutate: [
    'libs/web-auth/src/lib/**/*.ts',
    '!libs/web-auth/src/lib/**/*.spec.ts',
    '!libs/web-auth/src/lib/**/*.test.ts',
    '!libs/web-auth/src/lib/**/*.routes.ts',
    '!libs/web-auth/src/lib/**/*.module.ts',
    '!libs/web-auth/src/index.ts',
    '!libs/web-auth/src/test-setup.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/web-auth/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/web-auth/mutation.json' },
  thresholds: { high: 90, low: 75, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 20000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
