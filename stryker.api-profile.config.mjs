// Stryker config scoped to libs/api-profile — UC-01-03 profile editing
// (displayName/biography text, picture upload, email change, password change).
// NestJS feature lib; mirrors the api-auth exclusion shape.
//
// Excluded from mutation:
// - *.module.ts — DI wiring.
// - **/dto/** — DTOs are type guards only (length/format validation lives in
//   the services per the Nest ValidationPipe short-circuit rule); mutating them
//   is noise.
// - **/errors/** — *-error.codes.ts are type-only unions and *.exception.ts are
//   plain exception classes; no branching logic.
// - index.ts — barrel re-exports.
//
// Exception-filters are INCLUDED: post the api-http-errors refactor they are
// thin shells, but the { validation } flag they pass to handleException is real
// behaviour. The picture fake/real storage adapters are INCLUDED — they are dev
// seams that carry runtime behaviour (matching the api-courses fake-transcoder).
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/api-profile/vitest.config.mts',
  },
  mutate: [
    'libs/api-profile/src/lib/**/*.ts',
    '!libs/api-profile/src/lib/**/*.spec.ts',
    '!libs/api-profile/src/lib/**/*.test.ts',
    '!libs/api-profile/src/lib/**/*.module.ts',
    '!libs/api-profile/src/lib/**/dto/**',
    '!libs/api-profile/src/lib/**/errors/**',
    '!libs/api-profile/src/index.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/api-profile/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/api-profile/mutation.json' },
  thresholds: { high: 90, low: 75, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 15000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
