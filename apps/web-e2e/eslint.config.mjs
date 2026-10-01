import playwright from 'eslint-plugin-playwright';
import baseConfig from '../../eslint.config.mjs';

export default [
  {
    // Playwright's rules assume every `expect`/`it` call is a Playwright
    // test. src/_helpers/*.spec.ts are plain vitest unit specs (see
    // vite.config.mts), so they are excluded here — otherwise
    // playwright/no-standalone-expect fires on ordinary vitest assertions.
    ...playwright.configs['flat/recommended'],
    files: ['src/**/*.spec.ts'],
    ignores: ['src/_helpers/**'],
  },
  ...baseConfig,
  {
    // e2e test seeding talks to the Firebase emulator directly; it's outside
    // the DocumentStore port (constraints.md). See root eslint.config.mjs.
    files: ['src/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['**/*.ts', '**/*.js'],
    // Override or add rules here
    rules: {},
  },
];
