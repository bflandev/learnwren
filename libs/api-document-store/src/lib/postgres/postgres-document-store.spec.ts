import type { Pool } from 'pg';

import { DocumentNotFoundError, TransactionConflictError } from '../document-store.errors';
import { isRetryableTxnError, MAX_TXN_ATTEMPTS, PostgresDocumentStore } from './postgres-document-store';

type Reply = { rows?: unknown[]; rowCount?: number } | Error;

/** A Pool double: records every SQL text; `script` decides each reply by SQL prefix. */
function fakePool(script: (sql: string, call: number) => Reply | undefined) {
  const log: string[] = [];
  const released: unknown[] = [];
  let call = 0;
  const query = async (sql: string) => {
    log.push(sql);
    const reply = script(sql, call++) ?? { rows: [], rowCount: 1 };
    if (reply instanceof Error) throw reply;
    return { rows: reply.rows ?? [], rowCount: reply.rowCount ?? 0 };
  };
  const pool = {
    query,
    connect: async () => ({ query, release: (err?: unknown) => void released.push(err) }),
    end: async () => void log.push('END'),
  } as unknown as Pool;
  return { pool, log, released };
}

const serialization = () => Object.assign(new Error('could not serialize access'), { code: '40001' });

describe('isRetryableTxnError', () => {
  it('retries serialization failures and deadlocks only', () => {
    expect(isRetryableTxnError({ code: '40001' })).toBe(true);
    expect(isRetryableTxnError({ code: '40P01' })).toBe(true);
    expect(isRetryableTxnError({ code: '23505' })).toBe(false);
    expect(isRetryableTxnError(new Error('x'))).toBe(false);
    expect(isRetryableTxnError(undefined)).toBe(false);
  });
});

describe('PostgresDocumentStore transactions (fake pool)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs the body SERIALIZABLE, applies buffered writes, commits, releases', async () => {
    const { pool, log, released } = fakePool(() => undefined);
    const store = new PostgresDocumentStore(pool);
    const result = await store.runTransaction(async (txn) => {
      txn.set(store.collection('c').doc('a'), { v: 1 });
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(log[0]).toBe('BEGIN ISOLATION LEVEL SERIALIZABLE');
    expect(log[1]).toMatch(/^INSERT INTO documents/);
    expect(log[2]).toBe('COMMIT');
    expect(released).toEqual([undefined]);
  });

  it('retries the whole body on a serialization failure at COMMIT, then succeeds', async () => {
    let commits = 0;
    const { pool } = fakePool((sql) => (sql === 'COMMIT' && commits++ === 0 ? serialization() : undefined));
    const store = new PostgresDocumentStore(pool);
    let runs = 0;
    const result = store.runTransaction(async () => {
      runs++;
      return runs;
    });
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBe(2);
  });

  it('gives up after MAX_TXN_ATTEMPTS with TransactionConflictError carrying the last cause', async () => {
    const { pool, log } = fakePool((sql) => (sql === 'COMMIT' ? serialization() : undefined));
    const store = new PostgresDocumentStore(pool);
    const result = store.runTransaction(async () => 'never');
    const assertion = expect(result).rejects.toBeInstanceOf(TransactionConflictError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(log.filter((s) => s === 'BEGIN ISOLATION LEVEL SERIALIZABLE')).toHaveLength(MAX_TXN_ATTEMPTS);
    await expect(result).rejects.toMatchObject({ cause: { code: '40001' } });
  });

  it('rethrows a body error unchanged after ROLLBACK, without retrying', async () => {
    const { pool, log, released } = fakePool(() => undefined);
    const store = new PostgresDocumentStore(pool);
    const boom = new Error('domain');
    await expect(store.runTransaction(async () => Promise.reject(boom))).rejects.toBe(boom);
    expect(log).toEqual(['BEGIN ISOLATION LEVEL SERIALIZABLE', 'ROLLBACK']);
    expect(released).toEqual([undefined]);
  });

  it('destroys the connection when ROLLBACK itself fails, still surfacing the original error', async () => {
    const rollbackFailure = new Error('connection lost');
    const { pool, released } = fakePool((sql) => (sql === 'ROLLBACK' ? rollbackFailure : undefined));
    const store = new PostgresDocumentStore(pool);
    const boom = new Error('domain');
    await expect(store.runTransaction(async () => Promise.reject(boom))).rejects.toBe(boom);
    expect(released).toEqual([rollbackFailure]);
  });

  it('a transactional update of a missing document rolls back with DocumentNotFoundError', async () => {
    const { pool, log } = fakePool((sql) => (sql.startsWith('UPDATE') ? { rowCount: 0 } : undefined));
    const store = new PostgresDocumentStore(pool);
    await expect(
      store.runTransaction(async (txn) => txn.update(store.collection('c').doc('missing'), { v: 1 })),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
    expect(log.at(-1)).toBe('ROLLBACK');
  });
});

describe('PostgresDocumentStore batch (fake pool)', () => {
  it('commits every write in one READ COMMITTED transaction', async () => {
    const { pool, log } = fakePool(() => undefined);
    const store = new PostgresDocumentStore(pool);
    const batch = store.batch();
    batch.set(store.collection('c').doc('a'), { v: 1 });
    batch.delete(store.collection('c').doc('b'));
    await batch.commit();
    expect(log[0]).toBe('BEGIN ISOLATION LEVEL READ COMMITTED');
    expect(log[1]).toMatch(/^INSERT INTO documents/);
    expect(log[2]).toBe('DELETE FROM documents WHERE path = $1');
    expect(log[3]).toBe('COMMIT');
  });

  it('rolls back the whole batch when an update targets a missing document', async () => {
    const { pool, log } = fakePool((sql) => (sql.startsWith('UPDATE') ? { rowCount: 0 } : undefined));
    const store = new PostgresDocumentStore(pool);
    const batch = store.batch();
    batch.set(store.collection('c').doc('a'), { v: 1 });
    batch.update(store.collection('c').doc('missing'), { v: 2 });
    await expect(batch.commit()).rejects.toBeInstanceOf(DocumentNotFoundError);
    expect(log.at(-1)).toBe('ROLLBACK');
    expect(log).not.toContain('COMMIT');
  });
});

describe('PostgresDocumentStore lifecycle (fake pool)', () => {
  it('ensureSchema takes the advisory lock before creating the schema', async () => {
    const { pool, log } = fakePool(() => undefined);
    await new PostgresDocumentStore(pool).ensureSchema();
    expect(log[0]).toBe('BEGIN ISOLATION LEVEL READ COMMITTED');
    expect(log[1]).toBe('SELECT pg_advisory_xact_lock($1)');
    expect(log[2]).toContain('CREATE TABLE IF NOT EXISTS documents');
    expect(log[3]).toBe('COMMIT');
  });

  it('ends the pool on application shutdown', async () => {
    const { pool, log } = fakePool(() => undefined);
    await new PostgresDocumentStore(pool).onApplicationShutdown();
    expect(log).toEqual(['END']);
  });
});
