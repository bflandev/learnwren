// Stryker config scoped to libs/api-object-storage — the ObjectStorage port with
// its GCS and S3 implementations and env config (US-09-04 Slice C).
// Excluded: index.ts barrel re-exports; *.module.ts DI wiring.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/api-object-storage/vitest.config.mts',
  },
  mutate: [
    'libs/api-object-storage/src/lib/**/*.ts',
    '!libs/api-object-storage/src/lib/**/*.spec.ts',
    '!libs/api-object-storage/src/lib/**/*.test.ts',
    '!libs/api-object-storage/src/index.ts',
    '!libs/api-object-storage/src/lib/**/*.module.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/api-object-storage/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/api-object-storage/mutation.json' },
  thresholds: { high: 90, low: 75, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 15000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
