import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // This lib owns the raw Firebase Admin wiring (FIRESTORE token, etc.)
    // that DocumentStoreModule and the Firestore adapter depend on. See the
    // root eslint.config.mjs comment.
    files: ['src/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
];
