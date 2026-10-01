import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // This lib IS the DocumentStore port's Firestore adapter — it's allowed
    // to touch Firestore directly. See the root eslint.config.mjs comment.
    files: ['src/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
];
