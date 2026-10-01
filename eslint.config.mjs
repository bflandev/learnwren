import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/out-tsc',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          // web ↛ api and api ↛ web. Both can depend on shared. Shared can
          // depend only on itself. Keeps the wire contracts (shared) free of
          // framework-specific code so they remain consumable from both sides.
          depConstraints: [
            {
              sourceTag: 'scope:web',
              onlyDependOnLibsWithTags: ['scope:web', 'scope:shared'],
            },
            {
              sourceTag: 'scope:api',
              onlyDependOnLibsWithTags: ['scope:api', 'scope:shared'],
            },
            {
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
          ],
        },
      ],
    },
  },
  {
    // US-09-04 Slice D: data access goes through the DocumentStore port.
    // Only the port's own lib and the Firebase wiring lib touch Firestore.
    // Nx's lint executor runs eslint with cwd set to each project's own
    // directory, so file-path globs here can't name sibling projects to
    // exclude them (the matched path never contains the project's own
    // directory name). api-document-store and api-firebase opt out via a
    // local override in their own eslint.config.mjs instead.
    files: ['**/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'firebase-admin/firestore',
              message: 'Use @learnwren/api-document-store (DocumentStore port).',
            },
            {
              name: '@learnwren/api-firebase',
              importNames: ['FIRESTORE', 'FirestoreHandle'],
              message: 'Inject DOCUMENT_STORE from @learnwren/api-document-store.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
];
