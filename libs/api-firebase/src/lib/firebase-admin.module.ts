import { DynamicModule, Module } from '@nestjs/common';
import * as admin from 'firebase-admin';

import {
  FIREBASE_AUTH,
  FIREBASE_STORAGE,
  FIRESTORE,
} from './firebase.tokens';

const DEFAULT_EMULATOR_HOSTS = {
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
} as const;

const EMULATOR_PROJECT_ID = 'demo-learnwren';

type Mode = 'emulator' | 'production';

function resolveMode(): Mode {
  return process.env['LEARNWREN_FIREBASE_TARGET'] === 'production'
    ? 'production'
    : 'emulator';
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[FirebaseAdminModule] LEARNWREN_FIREBASE_TARGET=production requires ${name} to be set.`,
    );
  }
  return value;
}

function applyEmulatorEnvDefaults(): void {
  for (const [key, value] of Object.entries(DEFAULT_EMULATOR_HOSTS)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function ensureEmulatorAppInitialized(): admin.app.App {
  applyEmulatorEnvDefaults();
  const existing = admin.apps[0];
  if (existing) return existing;
  return admin.initializeApp({ projectId: EMULATOR_PROJECT_ID });
}

function ensureProductionAppInitialized(): admin.app.App {
  const projectId = required('LEARNWREN_API_FIREBASE_PROJECT_ID');
  const credentialPath = process.env['FIREBASE_SERVICE_ACCOUNT_JSON_PATH'];

  const existing = admin.apps[0];
  if (existing) return existing;

  if (credentialPath) {
    return admin.initializeApp({
      projectId,
      credential: admin.credential.cert(credentialPath),
    });
  }
  // ADC path — used when running on Firebase compute (Cloud Functions etc.).
  return admin.initializeApp({ projectId });
}

@Module({})
export class FirebaseAdminModule {
  static forRoot(): DynamicModule {
    const mode = resolveMode();
    const app =
      mode === 'production'
        ? ensureProductionAppInitialized()
        : ensureEmulatorAppInitialized();

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
