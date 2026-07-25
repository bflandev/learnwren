import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

export default [
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  ...baseConfig,
  {
    files: ['**/*.ts'],
    rules: {
      // Two prefixes coexist: `lw` for Learn Wren-authored primitives, `hlm`
      // for components ported from the donor hlm/spartan lib (kept verbatim so
      // future donor diffs stay cheap — see robin DS port slice B plan).
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: ['lw', 'hlm', 'brn'],
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: ['lw', 'hlm'],
          style: 'kebab-case',
        },
      ],
      // `input('', { alias: 'class' })` is the lib-wide hlm idiom (every
      // primitive exposes `class` passthrough). Disabled at the lib level
      // instead of per-line: the per-line eslint comment cannot coexist with
      // the per-line Stryker disable both tools need directly above the call.
      '@angular-eslint/no-input-rename': 'off',
    },
  },
  {
    files: ['**/*.html'],
    // Override or add rules here
    rules: {},
  },
];
