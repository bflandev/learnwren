import { DATA_STORE_CONFIG, readDataStoreConfigFromEnv } from './data-store.config';

describe('DATA_STORE_CONFIG', () => {
  it('is a global symbol keyed by the full library-qualified name', () => {
    expect(DATA_STORE_CONFIG).toBe(Symbol.for('learnwren.api-document-store.config'));
    expect(DATA_STORE_CONFIG.toString()).toBe('Symbol(learnwren.api-document-store.config)');
  });
});

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
