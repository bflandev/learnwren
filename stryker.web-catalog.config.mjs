// Stryker config scoped to libs/web-catalog.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/web-catalog/vite.config.mts',
  },
  mutate: [
    'libs/web-catalog/src/lib/**/*.ts',
    '!libs/web-catalog/src/lib/**/*.spec.ts',
    '!libs/web-catalog/src/lib/**/*.test.ts',
    '!libs/web-catalog/src/lib/**/*.routes.ts',
    '!libs/web-catalog/src/lib/**/*.module.ts',
    '!libs/web-catalog/src/index.ts',
    '!libs/web-catalog/src/test-setup.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/web-catalog/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/web-catalog/mutation.json' },
  thresholds: { high: 90, low: 75, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 20000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
