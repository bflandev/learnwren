// Stryker config scoped to libs/api-document-store — the DocumentStore port
// with its in-memory and Firestore adapters, run-transaction-with-retry,
// user-profile.reader and DI wiring (US-09-04 Slice D1).
// Excluded: index.ts barrel re-exports; src/testing/** (shared contract suite, test code).
// Run inside the Firestore emulator (`firebase emulators:exec --only firestore`)
// with LEARNWREN_TEST_POSTGRES_URL set, so both
// firestore-document-store.contract.spec.ts and
// postgres-document-store.contract.spec.ts run and can kill mutants in their
// respective adapter wrapper classes. CI's mutation job provides both (the
// Firestore emulator wrapper and a Postgres service container).
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/api-document-store/vitest.config.mts',
  },
  mutate: [
    'libs/api-document-store/src/lib/**/*.ts',
    '!libs/api-document-store/src/lib/**/*.spec.ts',
    '!libs/api-document-store/src/lib/**/*.test.ts',
    '!libs/api-document-store/src/index.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/api-document-store/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/api-document-store/mutation.json' },
  thresholds: { high: 90, low: 75, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 15000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
