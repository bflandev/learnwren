import { randomUUID } from 'node:crypto';

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

import { describeIdentityProviderContract } from '../../testing/identity-provider.contract';
import { FirebaseAuthRestClient } from '../firebase-auth-rest-client';
import { FirebaseIdentityProvider } from './firebase-identity-provider';

// Runs only under the Auth emulator:
//   pnpm exec firebase emulators:exec --only auth --project demo-learnwren \
//     'NX_DAEMON=false pnpm nx run api-auth:test --skip-nx-cache'
// The emulator ignores checkRevoked, so the revocation cases are off here;
// unit specs pin the revoke calls instead.
const emulator = process.env['FIREBASE_AUTH_EMULATOR_HOST'];

describe.skipIf(!emulator)('Firebase identity adapter against the Auth emulator', () => {
  const app = initializeApp({ projectId: 'demo-learnwren' }, `identity-contract-${randomUUID()}`);
  const provider = new FirebaseIdentityProvider(getAuth(app) as never, new FirebaseAuthRestClient('fake-api-key'));
  describeIdentityProviderContract('firebase', () => provider, { revocation: false, emailActions: false });
});
