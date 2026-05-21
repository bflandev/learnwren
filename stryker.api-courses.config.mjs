// Stryker config scoped to libs/api-courses — slice D update (EP-03 publish gate).
//
// Excluded from mutation:
// - courses.repository.ts — thin Firestore adapter, verified by api-e2e.
// - *.module.ts, dto/**, types/** — DI wiring, type-only code.
// - courses.exception-filter.ts — covered by unit tests but mutation noise is high
//   (parseFieldErrors trims to first word; mutants that change the trim behaviour
//   are equivalent for the body-shape contract).
// - errors/courses-error.codes.ts — type-only union, no runtime logic.
// - errors/courses.exception.ts is NOW included: slice D added InvalidTransitionException,
//   PublishNotEligibleException, CourseArchivedException; these carry runtime behaviour
//   (status codes, detail shapes) that should be mutation-tested.
// - index.ts — barrel re-exports.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/api-courses/vitest.config.mts',
  },
  mutate: [
    'libs/api-courses/src/lib/**/*.ts',
    '!libs/api-courses/src/lib/**/*.spec.ts',
    '!libs/api-courses/src/lib/**/*.test.ts',
    '!libs/api-courses/src/lib/courses.repository.ts',
    '!libs/api-courses/src/lib/courses.module.ts',
    '!libs/api-courses/src/lib/courses.exception-filter.ts',
    '!libs/api-courses/src/lib/dto/**',
    '!libs/api-courses/src/lib/types/**',
    '!libs/api-courses/src/lib/errors/courses-error.codes.ts',
    '!libs/api-courses/src/index.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/api-courses/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/api-courses/mutation.json' },
  thresholds: { high: 90, low: 75, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 15000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
