import { readDataStoreConfigFromEnv } from './data-store.config';

describe('readDataStoreConfigFromEnv', () => {
  it('defaults to firestore', () => {
    expect(readDataStoreConfigFromEnv({})).toEqual({ kind: 'firestore' });
  });

  it('accepts firestore explicitly and ignores a postgres URL', () => {
    expect(
      readDataStoreConfigFromEnv({ LEARNWREN_DATA_STORE: 'firestore', LEARNWREN_POSTGRES_URL: 'postgres://x' }),
    ).toEqual({ kind: 'firestore' });
  });

  it('selects postgres with its URL', () => {
    expect(
      readDataStoreConfigFromEnv({ LEARNWREN_DATA_STORE: 'postgres', LEARNWREN_POSTGRES_URL: 'postgres://u:p@h:5432/db' }),
    ).toEqual({ kind: 'postgres', url: 'postgres://u:p@h:5432/db' });
  });

  it('requires LEARNWREN_POSTGRES_URL for postgres', () => {
    expect(() => readDataStoreConfigFromEnv({ LEARNWREN_DATA_STORE: 'postgres' })).toThrow(
      'LEARNWREN_POSTGRES_URL is required when LEARNWREN_DATA_STORE=postgres.',
    );
    expect(() => readDataStoreConfigFromEnv({ LEARNWREN_DATA_STORE: 'postgres', LEARNWREN_POSTGRES_URL: '' })).toThrow(
      'LEARNWREN_POSTGRES_URL is required when LEARNWREN_DATA_STORE=postgres.',
    );
  });

  it('rejects any other value', () => {
    expect(() => readDataStoreConfigFromEnv({ LEARNWREN_DATA_STORE: 'mysql' })).toThrow(
      'LEARNWREN_DATA_STORE must be "firestore" or "postgres", got "mysql".',
    );
  });
});
