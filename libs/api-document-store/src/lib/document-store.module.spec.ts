import { Global, Logger, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FIRESTORE } from '@learnwren/api-firebase';
import type { Pool } from 'pg';

import { defaultPool, DocumentStoreModule, makeDocumentStore } from './document-store.module';
import { DOCUMENT_STORE } from './document-store.port';
import { FirestoreDocumentStore } from './firestore-document-store';
import { PostgresDocumentStore } from './postgres/postgres-document-store';

// Stands in for FirebaseAdminModule, which is global in production.
@Global()
@Module({ providers: [{ provide: FIRESTORE, useValue: {} }], exports: [FIRESTORE] })
class FakeFirebaseModule {}

function fakePool() {
  const sql: string[] = [];
  const listeners: Record<string, (err: Error) => void> = {};
  const client = { query: async (text: string) => void sql.push(text), release: () => undefined };
  const pool = {
    connect: async () => client,
    on: (event: string, fn: (err: Error) => void) => {
      listeners[event] = fn;
      return pool;
    },
  } as unknown as Pool;
  return { pool, sql, listeners };
}

describe('DocumentStoreModule', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('provides a FirestoreDocumentStore by default', async () => {
    delete process.env['LEARNWREN_DATA_STORE'];
    const moduleRef = await Test.createTestingModule({
      imports: [FakeFirebaseModule, DocumentStoreModule],
    }).compile();
    expect(moduleRef.get(DOCUMENT_STORE)).toBeInstanceOf(FirestoreDocumentStore);
  });

  it('fails module compilation on an invalid LEARNWREN_DATA_STORE', async () => {
    process.env['LEARNWREN_DATA_STORE'] = 'mysql';
    await expect(
      Test.createTestingModule({ imports: [FakeFirebaseModule, DocumentStoreModule] }).compile(),
    ).rejects.toThrow('LEARNWREN_DATA_STORE must be "firestore" or "postgres", got "mysql".');
  });
});

describe('makeDocumentStore', () => {
  it('wraps the Firestore handle for kind firestore', async () => {
    const store = await makeDocumentStore({ kind: 'firestore' }, {} as never);
    expect(store).toBeInstanceOf(FirestoreDocumentStore);
  });

  it('builds a Postgres store from the URL, creates the schema, and logs idle-client errors', async () => {
    const { pool, sql, listeners } = fakePool();
    const urls: string[] = [];
    const store = await makeDocumentStore({ kind: 'postgres', url: 'postgres://h/db' }, {} as never, (url) => {
      urls.push(url);
      return pool;
    });
    expect(store).toBeInstanceOf(PostgresDocumentStore);
    expect(urls).toEqual(['postgres://h/db']);
    expect(sql.some((s) => s.includes('CREATE TABLE IF NOT EXISTS documents'))).toBe(true);
    expect(typeof listeners['error']).toBe('function');

    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    listeners['error'](new Error('idle client died'));
    expect(errorSpy).toHaveBeenCalledWith('idle Postgres client error: idle client died');
    // The 'DocumentStore' logger name — asserted via the instance context the real
    // (unmocked) Logger carries, not just the message text.
    expect((errorSpy.mock.contexts[0] as { context?: string }).context).toBe('DocumentStore');
    errorSpy.mockRestore();
  });
});

describe('defaultPool', () => {
  it('builds a Pool configured with the given connection string', async () => {
    const pool = defaultPool('postgres://h/db');
    expect(pool.options.connectionString).toBe('postgres://h/db');
    await pool.end();
  });

  it('sets a connect timeout so an unreachable database errors instead of hanging forever', async () => {
    const pool = defaultPool('postgres://h/db');
    expect(pool.options.connectionTimeoutMillis).toBe(10_000);
    await pool.end();
  });
});
