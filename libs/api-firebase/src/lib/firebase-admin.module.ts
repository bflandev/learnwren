import { DynamicModule, Module } from '@nestjs/common';
import * as admin from 'firebase-admin';

import {
  FIREBASE_AUTH,
  FIREBASE_STORAGE,
  FIRESTORE,
} from './firebase.tokens';

// TODO(auth-spec): replace hardcoded emulator hosts and project ID with
// environment-driven config when the real Firebase project arrives.
const DEFAULT_EMULATOR_HOSTS = {
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
} as const;

const EMULATOR_PROJECT_ID = 'demo-learnwren';

function applyEmulatorEnvDefaults(): void {
  for (const [key, value] of Object.entries(DEFAULT_EMULATOR_HOSTS)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function ensureFirebaseAppInitialized(): admin.app.App {
  const existing = admin.apps[0];
  if (existing) {
    return existing;
  }
  return admin.initializeApp({ projectId: EMULATOR_PROJECT_ID });
}

@Module({})
export class FirebaseAdminModule {
  static forRoot(): DynamicModule {
    applyEmulatorEnvDefaults();
    const app = ensureFirebaseAppInitialized();

    return {
      module: FirebaseAdminModule,
      global: true,
      providers: [
        { provide: FIRESTORE, useFactory: () => app.firestore() },
        { provide: FIREBASE_AUTH, useFactory: () => app.auth() },
        { provide: FIREBASE_STORAGE, useFactory: () => app.storage() },
      ],
      exports: [FIRESTORE, FIREBASE_AUTH, FIREBASE_STORAGE],
    };
  }
}
