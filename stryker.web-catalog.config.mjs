// Stryker config scoped to libs/web-catalog — course discovery UI (EP-05 Slice A).
//
// Excluded from mutation:
// - *.routes.ts — pure config (route arrays); no runtime logic.
// - test-setup.ts — vitest setup boilerplate.
// - index.ts — barrel re-exports.
//
// Component .ts files are mutated because their guards, transformations, and
// effect callbacks carry behaviour. Templates (.html) are not mutated by
// Stryker — that surface is covered by spec assertions against the rendered DOM.
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
    '!libs/web-catalog/src/index.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/web-catalog/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/web-catalog/mutation.json' },
  // Web UI sits in the 50–70% "glue/orchestration" band per the mutation-testing
  // skill — most survivors will be template-bound effects mutation can't reach.
  thresholds: { high: 75, low: 50, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 15000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
