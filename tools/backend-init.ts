/**
 * tools/backend-init.ts
 *
 * Builds the identity + document-store pair for the operator tools from the
 * same env selectors the api uses (LEARNWREN_DATA_STORE, LEARNWREN_IDENTITY).
 * Firebase stays the default and keeps the emulator-first safety default.
 */

import * as admin from 'firebase-admin';
import { Pool } from 'pg';

import { readDataStoreConfigFromEnv } from '../libs/api-document-store/src/lib/data-store.config';
import { FirestoreDocumentStore } from '../libs/api-document-store/src/lib/firestore-document-store';
import { PostgresDocumentStore } from '../libs/api-document-store/src/lib/postgres/postgres-document-store';
import { readIdentityConfigFromEnv } from '../libs/api-auth/src/lib/identity/identity.config';
import { LocalIdentityProvider } from '../libs/api-auth/src/lib/identity/local-identity-provider';
import type {
  OperatorIdentity,
  OperatorStore,
} from '../libs/api-profile/src/lib/instructor-application/admin-promotion';

import { initFirebaseApp, resolveMode } from './firebase-admin-init';

export interface OperatorBackend {
  readonly identity: OperatorIdentity;
  readonly store: OperatorStore;
  readonly description: string;
  close(): Promise<void>;
}

/** The two identity calls the tools need, over the Admin SDK (not the DI-wired adapter). */
function firebaseIdentity(auth: admin.auth.Auth): OperatorIdentity {
  return {
    async getUserByEmail(email) {
      try {
        const u = await auth.getUserByEmail(email);
        return { uid: u.uid, email: u.email ?? email, emailVerified: u.emailVerified };
      } catch (err) {
        if ((err as { code?: string }).code === 'auth/user-not-found') return null;
        throw err;
      }
    },
    setRole: (uid, role) => auth.setCustomUserClaims(uid, { role }),
  };
}

export async function initBackend(env: Record<string, string | undefined> = process.env): Promise<OperatorBackend> {
  const dataStore = readDataStoreConfigFromEnv(env);
  const identityKind = readIdentityConfigFromEnv(env);

  if (dataStore.kind === 'postgres') {
    const pool = new Pool({ connectionString: dataStore.url });
    const store = new PostgresDocumentStore(pool);
    await store.ensureSchema();
    if (identityKind !== 'local') {
      throw new Error('LEARNWREN_DATA_STORE=postgres requires LEARNWREN_IDENTITY=local for the operator tools.');
    }
    return {
      identity: new LocalIdentityProvider(store),
      store,
      description: 'postgres + local identity',
      close: () => pool.end(),
    };
  }

  if (identityKind !== 'firebase') {
    throw new Error('LEARNWREN_IDENTITY=local requires LEARNWREN_DATA_STORE=postgres.');
  }
  const mode = resolveMode();
  initFirebaseApp(mode);
  return {
    identity: firebaseIdentity(admin.auth()),
    store: new FirestoreDocumentStore(admin.firestore()),
    description: `firebase (${mode})`,
    close: async () => undefined,
  };
}
