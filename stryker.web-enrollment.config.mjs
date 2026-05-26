// Stryker config scoped to libs/web-enrollment — course enrolment UI
// (EP-05 Slice B).
//
// Excluded from mutation:
// - test-setup.ts — vitest setup boilerplate.
// - index.ts — barrel re-exports.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/web-enrollment/vite.config.mts',
  },
  mutate: [
    'libs/web-enrollment/src/lib/**/*.ts',
    '!libs/web-enrollment/src/lib/**/*.spec.ts',
    '!libs/web-enrollment/src/lib/**/*.test.ts',
    '!libs/web-enrollment/src/index.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/web-enrollment/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/web-enrollment/mutation.json' },
  // Glue between API responses and a small panel UI; 50–70% band per skill.
  thresholds: { high: 75, low: 50, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 15000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
