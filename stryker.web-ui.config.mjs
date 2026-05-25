// Stryker config scoped to libs/web-ui.
// Presentational components — minimal logic; many components will be near-equivalent
// to mutate. Heavy filtering expected.
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
    '!libs/web-ui/src/lib/**/*.routes.ts',
    '!libs/web-ui/src/lib/**/*.module.ts',
    '!libs/web-ui/src/index.ts',
    '!libs/web-ui/src/test-setup.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/web-ui/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/web-ui/mutation.json' },
  thresholds: { high: 90, low: 75, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 20000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
