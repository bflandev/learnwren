import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // This is the one file allowed to touch FIREBASE_AUTH directly — it IS
    // the identity port's Firebase adapter. Keep the Firestore restriction
    // (this lib does not touch Firestore, but stay consistent with the root
    // rule rather than opting out wholesale). See root eslint.config.mjs.
    files: ['src/lib/identity/firebase-identity-provider.ts'],
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
              name: 'firebase-admin',
              importNames: ['firestore'],
              message: 'Use @learnwren/api-document-store (DocumentStore port).',
            },
            {
              name: '@google-cloud/firestore',
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
];
