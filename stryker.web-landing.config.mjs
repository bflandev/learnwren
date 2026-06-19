// Stryker config scoped to libs/web-landing — static marketing landing page.
//
// Excluded from mutation:
// - *.routes.ts — pure config (route arrays); no runtime logic.
// - landing-content.ts — static copy data; assertions in landing-content.spec
//   lock its shape, but per-string mutation produces equivalent-ish noise.
// - index.ts — barrel re-exports.
//
// Component .ts files carry only field assignment + ngOnInit(setTitle); templates
// (.html) are not mutated by Stryker — that surface is covered by spec DOM assertions.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/web-landing/vite.config.mts',
  },
  mutate: [
    'libs/web-landing/src/lib/**/*.ts',
    '!libs/web-landing/src/lib/**/*.spec.ts',
    '!libs/web-landing/src/lib/**/*.test.ts',
    '!libs/web-landing/src/lib/**/*.routes.ts',
    '!libs/web-landing/src/lib/landing-content.ts',
    '!libs/web-landing/src/index.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/web-landing/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/web-landing/mutation.json' },
  thresholds: { high: 75, low: 50, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 15000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
