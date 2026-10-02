import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { createInMemoryDocumentStore, DOCUMENT_STORE } from '@learnwren/api-document-store';
import { FIREBASE_WEB_API_KEY } from '@learnwren/api-firebase';

import { AuthModule } from './auth.module';
import { FirebaseIdentityProvider } from './identity/firebase-identity-provider';
import { IDENTITY_PROVIDER } from './identity/identity-provider.port';
import { LocalIdentityProvider } from './identity/local-identity-provider';

// Stands in for DocumentStoreModule, which is global in production. Only
// FIREBASE_WEB_API_KEY (for FirebaseAuthRestClient, still built in local
// mode) is needed here — FirebaseIdentityProvider itself is overridden below
// with a fake, so its own FIREBASE_AUTH dependency never has to be provided.
@Global()
@Module({
  providers: [
    { provide: FIREBASE_WEB_API_KEY, useValue: 'fake-api-key' },
    { provide: DOCUMENT_STORE, useFactory: () => createInMemoryDocumentStore() },
  ],
  exports: [FIREBASE_WEB_API_KEY, DOCUMENT_STORE],
})
class FakeGlobalsModule {}

const fakeFirebaseIdentityProvider = {} as FirebaseIdentityProvider;

async function buildModule() {
  return Test.createTestingModule({ imports: [FakeGlobalsModule, AuthModule] })
    .overrideProvider(FirebaseIdentityProvider)
    .useValue(fakeFirebaseIdentityProvider)
    .compile();
}

describe('AuthModule', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('wires IDENTITY_PROVIDER to FirebaseIdentityProvider by default', async () => {
    delete process.env['LEARNWREN_IDENTITY'];
    const moduleRef = await buildModule();
    expect(moduleRef.get(IDENTITY_PROVIDER)).toBe(fakeFirebaseIdentityProvider);
  });

  it('wires IDENTITY_PROVIDER to LocalIdentityProvider when LEARNWREN_IDENTITY=local and LEARNWREN_DATA_STORE=postgres', async () => {
    process.env['LEARNWREN_IDENTITY'] = 'local';
    process.env['LEARNWREN_DATA_STORE'] = 'postgres';
    const moduleRef = await buildModule();
    expect(moduleRef.get(IDENTITY_PROVIDER)).toBeInstanceOf(LocalIdentityProvider);
  });

  it('fails module compilation on an invalid LEARNWREN_IDENTITY', async () => {
    process.env['LEARNWREN_IDENTITY'] = 'x';
    await expect(buildModule()).rejects.toThrow(
      'LEARNWREN_IDENTITY must be "firebase" or "local", got "x".',
    );
  });

  it('resolving IDENTITY_PROVIDER twice returns the same LocalIdentityProvider instance (one instance per app)', async () => {
    process.env['LEARNWREN_IDENTITY'] = 'local';
    process.env['LEARNWREN_DATA_STORE'] = 'postgres';
    const moduleRef = await buildModule();
    expect(moduleRef.get(IDENTITY_PROVIDER)).toBe(moduleRef.get(IDENTITY_PROVIDER));
  });
});
