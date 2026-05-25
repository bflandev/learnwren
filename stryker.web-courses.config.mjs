// Stryker config scoped to libs/web-courses.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/web-courses/vite.config.mts',
  },
  mutate: [
    'libs/web-courses/src/lib/**/*.ts',
    '!libs/web-courses/src/lib/**/*.spec.ts',
    '!libs/web-courses/src/lib/**/*.test.ts',
    '!libs/web-courses/src/lib/**/*.routes.ts',
    '!libs/web-courses/src/lib/**/*.module.ts',
    '!libs/web-courses/src/index.ts',
    '!libs/web-courses/src/test-setup.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/web-courses/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/web-courses/mutation.json' },
  thresholds: { high: 90, low: 75, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 20000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
