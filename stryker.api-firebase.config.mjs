// Stryker config scoped to libs/api-firebase.
// Excluded: *.module.ts (DI wiring), tokens (type-only), index.ts (barrel).
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/api-firebase/vitest.config.mts',
  },
  mutate: [
    'libs/api-firebase/src/lib/**/*.ts',
    '!libs/api-firebase/src/lib/**/*.spec.ts',
    '!libs/api-firebase/src/lib/**/*.test.ts',
    '!libs/api-firebase/src/lib/firebase.tokens.ts',
    '!libs/api-firebase/src/index.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/api-firebase/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/api-firebase/mutation.json' },
  thresholds: { high: 90, low: 75, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 15000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
