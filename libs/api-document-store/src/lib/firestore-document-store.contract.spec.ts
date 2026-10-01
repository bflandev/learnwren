import { randomUUID } from 'node:crypto';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { describeDocumentStoreContract } from '../testing/document-store.contract';
import { FirestoreDocumentStore } from './firestore-document-store';

// Runs only under the Firestore emulator:
//   pnpm exec firebase emulators:exec --only firestore --project demo-learnwren \
//     'pnpm nx run api-document-store:test --skip-nx-cache'
// CI runs it that way in the api-e2e job (Task 8).
const emulator = process.env['FIRESTORE_EMULATOR_HOST'];

describe.skipIf(!emulator)('Firestore adapter against the emulator', () => {
  const app = initializeApp({ projectId: 'demo-learnwren' }, `contract-${randomUUID()}`);
  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  describeDocumentStoreContract('firestore', () => new FirestoreDocumentStore(db));
});
