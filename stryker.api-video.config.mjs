// Stryker config scoped to libs/api-video — EP-03 Slice A.
//
// Excluded from mutation:
// - video.repository.ts — thin Firestore adapter, verified by api-e2e.
// - video-storage.adapter.ts — thin Cloud Storage adapter, verified by api-e2e.
// - video.module.ts, video.config.ts — DI wiring, environment readers.
// - video.exception-filter.ts — covered by unit tests but mutation noise is high.
// - dto/**, types/**, errors/** — type-only code, validation decorators, exception classes.
// - index.ts — barrel re-exports.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/api-video/vitest.config.mts',
  },
  mutate: [
    'libs/api-video/src/lib/**/*.ts',
    '!libs/api-video/src/lib/**/*.spec.ts',
    '!libs/api-video/src/lib/**/*.test.ts',
    '!libs/api-video/src/lib/video.repository.ts',
    '!libs/api-video/src/lib/video-storage.adapter.ts',
    '!libs/api-video/src/lib/video.module.ts',
    '!libs/api-video/src/lib/video.exception-filter.ts',
    '!libs/api-video/src/lib/video.config.ts',
    '!libs/api-video/src/lib/dto/**',
    '!libs/api-video/src/lib/types/**',
    '!libs/api-video/src/lib/errors/**',
    '!libs/api-video/src/index.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/api-video/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/api-video/mutation.json' },
  thresholds: { high: 90, low: 75, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 15000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
