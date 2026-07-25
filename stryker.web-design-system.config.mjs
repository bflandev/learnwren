// Stryker config scoped to libs/web-design-system — the token pipeline lib.
//
// Excluded from mutation:
// - tokens/build.mjs — build-time generator; vitest never invokes it (the
//   specs read the committed generated output), so its mutants are
//   structurally unkillable. The equivalence + contrast specs gate its
//   OUTPUT instead.
// - src/generated/**, legacy-tokens.fixture.css — generated/frozen data.
// - src/lib/** placeholder component — scaffold remnant, no logic.
//
// What remains: contrast-core.mjs (the WCAG ratio math the contrast gate
// rides on).
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/web-design-system/vite.config.mts',
  },
  mutate: ['libs/web-design-system/src/contrast-core.mjs'],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/web-design-system/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/web-design-system/mutation.json' },
  thresholds: { high: 75, low: 50, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 15000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
