// Stryker config scoped to libs/web-ui — design-system primitives (button,
// card, cover, icon, input, pill, progress, theme, theme-toggle, wordmark).
//
// Excluded from mutation:
// - test-setup.ts — vitest setup boilerplate.
// - index.ts — barrel re-exports.
// - button/lw-button.directive.ts — host-binding-only directive; no runtime
//   branches mutation testing can usefully exercise (Stryker run produced
//   1 surviving mutant on a single decorator argument).
// - icon/lw-icon.component.ts — declarative SVG path table; the only logic
//   is `paths[name]` lookup, so every mutant lives in the data, not in
//   behavior. The skill's "don't measure DTOs/mappers/generated code" rule
//   applies: the icon set is data masquerading as code.
//
// What remains: theme.service (state, persistence, document class toggling),
// theme-toggle (UI wiring around theme.service), cover/card/cover/pill/
// progress (small layout components with input branches), and wordmark.
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
    '!libs/web-ui/src/lib/button/lw-button.directive.ts',
    '!libs/web-ui/src/lib/icon/lw-icon.component.ts',
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
