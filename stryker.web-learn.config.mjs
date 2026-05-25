// Stryker config scoped to libs/web-learn.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/web-learn/vite.config.mts',
  },
  mutate: [
    'libs/web-learn/src/lib/**/*.ts',
    '!libs/web-learn/src/lib/**/*.spec.ts',
    '!libs/web-learn/src/lib/**/*.test.ts',
    '!libs/web-learn/src/lib/**/*.routes.ts',
    '!libs/web-learn/src/lib/**/*.module.ts',
    '!libs/web-learn/src/index.ts',
    '!libs/web-learn/src/test-setup.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/web-learn/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/web-learn/mutation.json' },
  thresholds: { high: 90, low: 75, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 20000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
