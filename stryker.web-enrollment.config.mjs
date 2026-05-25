// Stryker config scoped to libs/web-enrollment.
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
    '!libs/web-enrollment/src/lib/**/*.routes.ts',
    '!libs/web-enrollment/src/lib/**/*.module.ts',
    '!libs/web-enrollment/src/index.ts',
    '!libs/web-enrollment/src/test-setup.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/web-enrollment/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/web-enrollment/mutation.json' },
  thresholds: { high: 90, low: 75, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 20000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
