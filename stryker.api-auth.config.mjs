// Stryker config scoped to libs/api-auth — the priority module flagged by
// the CRAP report (top offender: register, comp 14). Auth code targets a
// 90%+ mutation score per the mutation-testing skill.
//
// Excluded from mutation:
// - email-transport/* — its spec fails to import nodemailer in vitest, would
//   produce false survivors. Address separately.
// - *.module.ts, dto/**, types/**, errors/** — DI wiring, type-only code, and
//   exception classes; mutating these is noise.
// - index.ts — barrel re-exports.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/api-auth/vitest.config.mts',
  },
  mutate: [
    'libs/api-auth/src/lib/**/*.ts',
    '!libs/api-auth/src/lib/**/*.spec.ts',
    '!libs/api-auth/src/lib/**/*.test.ts',
    '!libs/api-auth/src/lib/email-transport/**',
    '!libs/api-auth/src/lib/auth.module.ts',
    '!libs/api-auth/src/lib/dto/**',
    '!libs/api-auth/src/lib/types/**',
    '!libs/api-auth/src/lib/errors/**',
    '!libs/api-auth/src/index.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/api-auth/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/api-auth/mutation.json' },
  thresholds: { high: 90, low: 75, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 15000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
