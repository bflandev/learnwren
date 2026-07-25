// Stryker config scoped to libs/web-data-table — TanStack table lib
// (ported from the donor design system, robin DS port slice G).
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/web-data-table/vite.config.mts',
  },
  mutate: [
    'libs/web-data-table/src/lib/**/*.ts',
    '!libs/web-data-table/src/lib/**/*.spec.ts',
    '!libs/web-data-table/src/lib/**/*.test.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/web-data-table/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/web-data-table/mutation.json' },
  thresholds: { high: 75, low: 50, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 15000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
