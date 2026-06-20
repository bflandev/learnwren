import { Inject, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as admin from 'firebase-admin';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FIREBASE_AUTH, FIREBASE_STORAGE, FIREBASE_WEB_API_KEY, FIRESTORE } from './firebase.tokens';
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
  'LEARNWREN_FIREBASE_WEB_API_KEY',
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
      // Spy on initializeApp: the second forRoot must reuse admin.apps[0] and
      // therefore NOT call initializeApp again. Asserting the call count (not
      // just apps.length) kills the `if (existing) return existing` reuse guard.
      const initSpy = vi.spyOn(admin, 'initializeApp');
      try {
        await Test.createTestingModule({ imports: [FirebaseAdminModule.forRoot()] }).compile();
        await Test.createTestingModule({ imports: [FirebaseAdminModule.forRoot()] }).compile();
        expect(admin.apps.length).toBe(1);
        expect(initSpy).toHaveBeenCalledTimes(1);
      } finally {
        initSpy.mockRestore();
      }
    });

    it('initializes the emulator app with project ID "demo-learnwren"', async () => {
      await Test.createTestingModule({ imports: [FirebaseAdminModule.forRoot()] }).compile();
      expect(admin.apps[0]?.options.projectId).toBe('demo-learnwren');
    });

    it('reuses the same admin app instance on the second forRoot() call', async () => {
      const first = await Test.createTestingModule({ imports: [FirebaseAdminModule.forRoot()] }).compile();
      const second = await Test.createTestingModule({ imports: [FirebaseAdminModule.forRoot()] }).compile();
      // Same underlying Firestore handle (the cache returns the existing app's firestore)
      expect(first.get(FIRESTORE)).toBe(second.get(FIRESTORE));
    });

    it('resolves FIREBASE_WEB_API_KEY to "fake-api-key" when the env var is unset', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [FirebaseAdminModule.forRoot()],
      }).compile();
      expect(moduleRef.get(FIREBASE_WEB_API_KEY)).toBe('fake-api-key');
    });

    it('resolves FIREBASE_WEB_API_KEY to the env var value when it is set', async () => {
      process.env['LEARNWREN_FIREBASE_WEB_API_KEY'] = 'caller-provided-key';
      const moduleRef = await Test.createTestingModule({
        imports: [FirebaseAdminModule.forRoot()],
      }).compile();
      expect(moduleRef.get(FIREBASE_WEB_API_KEY)).toBe('caller-provided-key');
    });

    it('exposes FIRESTORE, FIREBASE_AUTH, FIREBASE_STORAGE and FIREBASE_WEB_API_KEY from the module', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [FirebaseAdminModule.forRoot()],
      }).compile();
      // Exporting all four tokens is part of the public contract — a regression
      // here would silently break downstream injection.
      expect(moduleRef.get(FIRESTORE)).toBeDefined();
      expect(moduleRef.get(FIREBASE_AUTH)).toBeDefined();
      expect(moduleRef.get(FIREBASE_STORAGE)).toBeDefined();
      expect(moduleRef.get(FIREBASE_WEB_API_KEY)).toBeDefined();
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

    it('throws when LEARNWREN_FIREBASE_WEB_API_KEY is unset in production mode', async () => {
      process.env['LEARNWREN_FIREBASE_TARGET'] = 'production';
      process.env['LEARNWREN_API_FIREBASE_PROJECT_ID'] = 'test-prod-id';
      // Intentionally omit LEARNWREN_FIREBASE_WEB_API_KEY.

      // The throw happens inside the useFactory, so it surfaces when the
      // testing module resolves the provider.
      await expect(
        Test.createTestingModule({
          imports: [FirebaseAdminModule.forRoot()],
        }).compile(),
      ).rejects.toThrow(/LEARNWREN_FIREBASE_WEB_API_KEY/);
    });

    it('does NOT throw on missing FIREBASE_WEB_API_KEY in emulator mode (key is optional)', async () => {
      // Sanity check on the production guard's mode condition: if it ignored
      // mode, emulator mode without the key would also throw.
      const moduleRef = await Test.createTestingModule({
        imports: [FirebaseAdminModule.forRoot()],
      }).compile();
      expect(moduleRef.get(FIREBASE_WEB_API_KEY)).toBe('fake-api-key');
    });

    it('resolves FIREBASE_WEB_API_KEY to the env value verbatim in production', async () => {
      process.env['LEARNWREN_FIREBASE_TARGET'] = 'production';
      process.env['LEARNWREN_API_FIREBASE_PROJECT_ID'] = 'test-prod-id';
      process.env['LEARNWREN_FIREBASE_WEB_API_KEY'] = 'prod-web-api-key-123';

      const moduleRef = await Test.createTestingModule({
        imports: [FirebaseAdminModule.forRoot()],
      }).compile();
      // Verbatim — not 'fake-api-key', not the empty string.
      expect(moduleRef.get(FIREBASE_WEB_API_KEY)).toBe('prod-web-api-key-123');
    });

    it('initializes against the real project ID and does NOT set emulator env vars', async () => {
      process.env['LEARNWREN_FIREBASE_TARGET'] = 'production';
      process.env['LEARNWREN_API_FIREBASE_PROJECT_ID'] = 'test-prod-id';
      process.env['LEARNWREN_FIREBASE_WEB_API_KEY'] = 'test-web-api-key';
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
      process.env['LEARNWREN_FIREBASE_WEB_API_KEY'] = 'test-web-api-key';
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

      // Spy (call-through) to prove the cert branch is taken with the exact
      // configured path. `options.credential` is defined on BOTH the cert and
      // ADC paths, so it can't distinguish them — the cert() call can.
      const certSpy = vi.spyOn(admin.credential, 'cert');

      const moduleRef = await Test.createTestingModule({
        imports: [FirebaseAdminModule.forRoot()],
      }).compile();

      expect(certSpy).toHaveBeenCalledWith('/tmp/learnwren-test-sa.json');
      certSpy.mockRestore();

      expect(admin.apps.length).toBe(1);
      expect(admin.apps[0]?.options.projectId).toBe('test-prod-id');
      // Credential is set (vs undefined for the ADC path).
      expect(admin.apps[0]?.options.credential).toBeDefined();

      expect(moduleRef.get(FIRESTORE)).toBeDefined();
    });
  });

  describe('Firestore settings + DI contract (mutation hardening)', () => {
    it('applies { ignoreUndefinedProperties: true } to the Firestore handle exactly once', async () => {
      const settingsSpy = vi
        .spyOn(admin.firestore.Firestore.prototype, 'settings')
        .mockImplementation(() => undefined as unknown as void);
      try {
        const m1 = await Test.createTestingModule({
          imports: [FirebaseAdminModule.forRoot()],
        }).compile();
        m1.get(FIRESTORE); // force the useFactory to run
        // Second forRoot reuses the same app → same Firestore handle → settings
        // must NOT be re-applied (configureFirestoreOnce dedup via WeakSet).
        const m2 = await Test.createTestingModule({
          imports: [FirebaseAdminModule.forRoot()],
        }).compile();
        m2.get(FIRESTORE);

        expect(settingsSpy).toHaveBeenCalledTimes(1);
        expect(settingsSpy).toHaveBeenCalledWith({ ignoreUndefinedProperties: true });
      } finally {
        settingsSpy.mockRestore();
      }
    });

    it('exposes its tokens as a GLOBAL module so an unrelated consumer can inject them', async () => {
      // Global injection requires BOTH global:true AND the token in exports[].
      // A consumer module that does NOT import FirebaseAdminModule but injects
      // FIRESTORE only resolves if the module is global and exports the token.
      @Injectable()
      class FirestoreConsumer {
        constructor(@Inject(FIRESTORE) public readonly firestore: unknown) {}
      }
      @Module({ providers: [FirestoreConsumer] })
      class ConsumerModule {}

      const moduleRef = await Test.createTestingModule({
        imports: [FirebaseAdminModule.forRoot(), ConsumerModule],
      }).compile();

      expect(moduleRef.get(FirestoreConsumer).firestore).toBeDefined();
    });
  });

  describe('production credential resolution (mutation hardening)', () => {
    it('does NOT call credential.cert on the ADC path (no service-account path)', async () => {
      process.env['LEARNWREN_FIREBASE_TARGET'] = 'production';
      process.env['LEARNWREN_API_FIREBASE_PROJECT_ID'] = 'test-prod-id';
      process.env['LEARNWREN_FIREBASE_WEB_API_KEY'] = 'k';
      // no FIREBASE_SERVICE_ACCOUNT_JSON_PATH → ADC

      const certSpy = vi.spyOn(admin.credential, 'cert');
      try {
        await Test.createTestingModule({
          imports: [FirebaseAdminModule.forRoot()],
        }).compile();
        expect(certSpy).not.toHaveBeenCalled();
      } finally {
        certSpy.mockRestore();
      }
    });

    it('reuses the existing app on a second production forRoot (does not re-initialize)', async () => {
      process.env['LEARNWREN_FIREBASE_TARGET'] = 'production';
      process.env['LEARNWREN_API_FIREBASE_PROJECT_ID'] = 'test-prod-id';
      process.env['LEARNWREN_FIREBASE_WEB_API_KEY'] = 'k';

      const initSpy = vi.spyOn(admin, 'initializeApp');
      try {
        await Test.createTestingModule({ imports: [FirebaseAdminModule.forRoot()] }).compile();
        // A second forRoot must reuse admin.apps[0] rather than re-initialize.
        await Test.createTestingModule({ imports: [FirebaseAdminModule.forRoot()] }).compile();
        expect(admin.apps.length).toBe(1);
        expect(initSpy).toHaveBeenCalledTimes(1);
      } finally {
        initSpy.mockRestore();
      }
    });
  });
});
