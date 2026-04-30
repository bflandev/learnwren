import { Test } from '@nestjs/testing';
import * as admin from 'firebase-admin';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FIREBASE_AUTH, FIREBASE_STORAGE, FIRESTORE } from './firebase.tokens';
import { FirebaseAdminModule } from './firebase-admin.module';

const EMULATOR_ENV_KEYS = [
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_STORAGE_EMULATOR_HOST',
] as const;

describe('FirebaseAdminModule', () => {
  beforeEach(async () => {
    for (const key of EMULATOR_ENV_KEYS) {
      delete process.env[key];
    }
    await Promise.all(admin.apps.map((a) => a?.delete()));
  });

  afterEach(async () => {
    await Promise.all(admin.apps.map((a) => a?.delete()));
  });

  it('sets emulator host env vars when unset and resolves all three tokens', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FirebaseAdminModule.forRoot()],
    }).compile();

    expect(process.env['FIREBASE_AUTH_EMULATOR_HOST']).toBe('127.0.0.1:9099');
    expect(process.env['FIRESTORE_EMULATOR_HOST']).toBe('127.0.0.1:8080');
    expect(process.env['FIREBASE_STORAGE_EMULATOR_HOST']).toBe('127.0.0.1:9199');

    expect(moduleRef.get(FIRESTORE)).toBeDefined();
    expect(moduleRef.get(FIREBASE_AUTH)).toBeDefined();
    expect(moduleRef.get(FIREBASE_STORAGE)).toBeDefined();
  });

  it('does not overwrite emulator host env vars that are already set', async () => {
    process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:19099';
    process.env['FIRESTORE_EMULATOR_HOST'] = '127.0.0.1:18080';
    process.env['FIREBASE_STORAGE_EMULATOR_HOST'] = '127.0.0.1:19199';

    await Test.createTestingModule({
      imports: [FirebaseAdminModule.forRoot()],
    }).compile();

    expect(process.env['FIREBASE_AUTH_EMULATOR_HOST']).toBe('127.0.0.1:19099');
    expect(process.env['FIRESTORE_EMULATOR_HOST']).toBe('127.0.0.1:18080');
    expect(process.env['FIREBASE_STORAGE_EMULATOR_HOST']).toBe('127.0.0.1:19199');
  });

  it('initializes the firebase-admin app exactly once across multiple imports', async () => {
    await Test.createTestingModule({ imports: [FirebaseAdminModule.forRoot()] }).compile();
    await Test.createTestingModule({ imports: [FirebaseAdminModule.forRoot()] }).compile();
    expect(admin.apps.length).toBe(1);
  });
});
