// Stryker config scoped to libs/shared-data-models.
// Type-heavy lib, but includes runtime guard/branding/parsing helpers worth mutating.
// Excluded: index.ts (barrel) and pure type files with no runtime code.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/shared-data-models/vitest.config.mts',
  },
  mutate: [
    'libs/shared-data-models/src/lib/**/*.ts',
    '!libs/shared-data-models/src/lib/**/*.spec.ts',
    '!libs/shared-data-models/src/lib/**/*.test.ts',
    '!libs/shared-data-models/src/index.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/shared-data-models/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/shared-data-models/mutation.json' },
  thresholds: { high: 90, low: 75, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 15000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
