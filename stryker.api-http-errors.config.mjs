// Stryker config scoped to libs/api-http-errors — the shared exception-rendering
// helper (handleException + codeForStatus + validation/fallback shaping) that
// every per-feature NestJS ExceptionFilter delegates to. Core glue with real
// branching (status→code mapping, validation detail extraction), so it targets
// the 80 domain threshold.
//
// Excluded: index.ts barrel re-exports.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/api-http-errors/vitest.config.mts',
  },
  mutate: [
    'libs/api-http-errors/src/lib/**/*.ts',
    '!libs/api-http-errors/src/lib/**/*.spec.ts',
    '!libs/api-http-errors/src/lib/**/*.test.ts',
    '!libs/api-http-errors/src/index.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/api-http-errors/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/api-http-errors/mutation.json' },
  thresholds: { high: 90, low: 75, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 15000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
