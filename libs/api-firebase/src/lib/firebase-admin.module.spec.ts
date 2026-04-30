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

const TARGET_KEYS = [
  'LEARNWREN_FIREBASE_TARGET',
  'LEARNWREN_API_FIREBASE_PROJECT_ID',
  'FIREBASE_SERVICE_ACCOUNT_JSON_PATH',
] as const;

async function resetEnvAndApps(): Promise<void> {
  for (const key of EMULATOR_ENV_KEYS) delete process.env[key];
  for (const key of TARGET_KEYS) delete process.env[key];
  await Promise.all(admin.apps.map((a) => a?.delete()));
}

describe('FirebaseAdminModule', () => {
  beforeEach(async () => {
    await resetEnvAndApps();
  });

  afterEach(async () => {
    await resetEnvAndApps();
  });

  describe('emulator mode (default)', () => {
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

    it('initializes firebase-admin app exactly once across multiple imports', async () => {
      await Test.createTestingModule({ imports: [FirebaseAdminModule.forRoot()] }).compile();
      await Test.createTestingModule({ imports: [FirebaseAdminModule.forRoot()] }).compile();
      expect(admin.apps.length).toBe(1);
    });

    it('treats LEARNWREN_FIREBASE_TARGET=emulator the same as unset', async () => {
      process.env['LEARNWREN_FIREBASE_TARGET'] = 'emulator';
      await Test.createTestingModule({ imports: [FirebaseAdminModule.forRoot()] }).compile();
      expect(process.env['FIREBASE_AUTH_EMULATOR_HOST']).toBe('127.0.0.1:9099');
    });

    it('falls back to emulator when LEARNWREN_FIREBASE_TARGET is a garbage value', async () => {
      process.env['LEARNWREN_FIREBASE_TARGET'] = 'banana';
      await Test.createTestingModule({ imports: [FirebaseAdminModule.forRoot()] }).compile();
      expect(process.env['FIREBASE_AUTH_EMULATOR_HOST']).toBe('127.0.0.1:9099');
    });
  });

  describe('production mode', () => {
    it('throws a clear error when LEARNWREN_API_FIREBASE_PROJECT_ID is unset', () => {
      process.env['LEARNWREN_FIREBASE_TARGET'] = 'production';

      // forRoot() throws synchronously during DynamicModule construction —
      // before Test.createTestingModule() returns a promise — so this is
      // a synchronous expectation, not a rejected-promise expectation.
      expect(() =>
        Test.createTestingModule({
          imports: [FirebaseAdminModule.forRoot()],
        }),
      ).toThrow(/LEARNWREN_API_FIREBASE_PROJECT_ID/);
    });

    it('initializes against the real project ID and does NOT set emulator env vars', async () => {
      process.env['LEARNWREN_FIREBASE_TARGET'] = 'production';
      process.env['LEARNWREN_API_FIREBASE_PROJECT_ID'] = 'test-prod-id';
      // no service-account path → ADC path

      const moduleRef = await Test.createTestingModule({
        imports: [FirebaseAdminModule.forRoot()],
      }).compile();

      expect(process.env['FIREBASE_AUTH_EMULATOR_HOST']).toBeUndefined();
      expect(process.env['FIRESTORE_EMULATOR_HOST']).toBeUndefined();
      expect(process.env['FIREBASE_STORAGE_EMULATOR_HOST']).toBeUndefined();

      expect(admin.apps.length).toBe(1);
      expect(admin.apps[0]?.options.projectId).toBe('test-prod-id');

      expect(moduleRef.get(FIRESTORE)).toBeDefined();
      expect(moduleRef.get(FIREBASE_AUTH)).toBeDefined();
      expect(moduleRef.get(FIREBASE_STORAGE)).toBeDefined();
    });

    it('initializes with cert credential when FIREBASE_SERVICE_ACCOUNT_JSON_PATH is set', async () => {
      process.env['LEARNWREN_FIREBASE_TARGET'] = 'production';
      process.env['LEARNWREN_API_FIREBASE_PROJECT_ID'] = 'test-prod-id';
      // We don't actually want to read a real file in unit tests. firebase-admin
      // resolves credential.cert lazily — its presence is what we verify.
      process.env['FIREBASE_SERVICE_ACCOUNT_JSON_PATH'] = '/tmp/learnwren-test-sa.json';

      // Stub the file so admin.credential.cert can read it without exploding.
      // firebase-admin parses the private_key string, so we generate a real
      // RSA key on the fly rather than ship one in the repo.
      const { writeFileSync } = await import('node:fs');
      const { generateKeyPairSync } = await import('node:crypto');
      const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      });
      writeFileSync(
        '/tmp/learnwren-test-sa.json',
        JSON.stringify({
          type: 'service_account',
          project_id: 'test-prod-id',
          private_key_id: 'x',
          private_key: privateKey,
          client_email: 'fake@test-prod-id.iam.gserviceaccount.com',
          client_id: '0',
        }),
      );

      const moduleRef = await Test.createTestingModule({
        imports: [FirebaseAdminModule.forRoot()],
      }).compile();

      expect(admin.apps.length).toBe(1);
      expect(admin.apps[0]?.options.projectId).toBe('test-prod-id');
      // Credential is set (vs undefined for the ADC path).
      expect(admin.apps[0]?.options.credential).toBeDefined();

      expect(moduleRef.get(FIRESTORE)).toBeDefined();
    });
  });
});
