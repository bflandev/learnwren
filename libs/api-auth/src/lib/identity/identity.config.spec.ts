import type { DocumentStore } from '@learnwren/api-document-store';

import { FirebaseIdentityProvider } from './firebase-identity-provider';
import { readIdentityConfigFromEnv, makeIdentityProvider } from './identity.config';
import { LocalIdentityProvider } from './local-identity-provider';

describe('readIdentityConfigFromEnv', () => {
  it('defaults to firebase when LEARNWREN_IDENTITY is unset', () => {
    expect(readIdentityConfigFromEnv({})).toBe('firebase');
  });

  it('returns firebase for LEARNWREN_IDENTITY=firebase', () => {
    expect(readIdentityConfigFromEnv({ LEARNWREN_IDENTITY: 'firebase' })).toBe('firebase');
  });

  it('returns local for LEARNWREN_IDENTITY=local with LEARNWREN_DATA_STORE=postgres', () => {
    expect(
      readIdentityConfigFromEnv({ LEARNWREN_IDENTITY: 'local', LEARNWREN_DATA_STORE: 'postgres' }),
    ).toBe('local');
  });

  it('throws when LEARNWREN_IDENTITY=local without LEARNWREN_DATA_STORE', () => {
    expect(() => readIdentityConfigFromEnv({ LEARNWREN_IDENTITY: 'local' })).toThrow(
      'LEARNWREN_IDENTITY=local requires LEARNWREN_DATA_STORE=postgres.',
    );
  });

  it('throws when LEARNWREN_IDENTITY=local with LEARNWREN_DATA_STORE=firestore', () => {
    expect(() =>
      readIdentityConfigFromEnv({ LEARNWREN_IDENTITY: 'local', LEARNWREN_DATA_STORE: 'firestore' }),
    ).toThrow('LEARNWREN_IDENTITY=local requires LEARNWREN_DATA_STORE=postgres.');
  });

  it('throws for any other value', () => {
    expect(() => readIdentityConfigFromEnv({ LEARNWREN_IDENTITY: 'x' })).toThrow(
      'LEARNWREN_IDENTITY must be "firebase" or "local", got "x".',
    );
  });
});

describe('makeIdentityProvider', () => {
  const firebaseFake = {} as FirebaseIdentityProvider;
  const storeFake = {} as DocumentStore;

  it('returns the given Firebase instance for kind firebase', () => {
    expect(makeIdentityProvider('firebase', firebaseFake, storeFake)).toBe(firebaseFake);
  });

  it('returns a LocalIdentityProvider for kind local', () => {
    const provider = makeIdentityProvider('local', firebaseFake, storeFake);
    expect(provider).toBeInstanceOf(LocalIdentityProvider);
  });
});
