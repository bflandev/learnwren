// Stryker config scoped to libs/web-video.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/web-video/vite.config.mts',
  },
  mutate: [
    'libs/web-video/src/lib/**/*.ts',
    '!libs/web-video/src/lib/**/*.spec.ts',
    '!libs/web-video/src/lib/**/*.test.ts',
    '!libs/web-video/src/lib/**/*.routes.ts',
    '!libs/web-video/src/lib/**/*.module.ts',
    '!libs/web-video/src/index.ts',
    '!libs/web-video/src/test-setup.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/web-video/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/web-video/mutation.json' },
  thresholds: { high: 90, low: 75, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 20000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
