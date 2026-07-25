// Stryker config scoped to libs/web-ui — the full hlm component library
// (robin DS port slice B) plus the kept lw primitives (cover, wordmark,
// theme, theme-toggle, avatar-tone).
//
// Excluded from mutation:
// - test-setup.ts — vitest setup boilerplate.
// - index.ts — barrel re-exports.
// - token-discipline.spec.ts imports every exported class-string const; the
//   *_BASE/variant constants themselves stay IN scope — their StringLiteral
//   mutants are killable by the component specs' class assertions.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/web-ui/vite.config.mts',
  },
  mutate: [
    'libs/web-ui/src/lib/**/*.ts',
    '!libs/web-ui/src/lib/**/*.spec.ts',
    '!libs/web-ui/src/lib/**/*.test.ts',
    '!libs/web-ui/src/index.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/web-ui/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/web-ui/mutation.json' },
  thresholds: { high: 75, low: 50, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 15000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
