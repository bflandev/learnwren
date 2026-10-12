// Stryker config scoped to apps/api — the testable app setup (env safety
// rules, CORS allowlist, Nest app configuration, retryable init memo) and the
// test seam.
//
// Excluded: main.ts — the bootstrap that listens / exports the Cloud
// Function on import; only api-e2e and a real deploy exercise it.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'apps/api/vite.config.mts',
  },
  mutate: [
    'apps/api/src/app/**/*.ts',
    '!apps/api/src/app/**/*.spec.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/api/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/api/mutation.json' },
  thresholds: { high: 80, low: 60, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 15000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
