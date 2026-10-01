import type { Pool } from 'pg';

import { DELETE_FIELD } from '../document-store.port';
import { DocumentNotFoundError, TransactionConflictError } from '../document-store.errors';
import { isRetryableTxnError, MAX_TXN_ATTEMPTS, PostgresDocumentStore } from './postgres-document-store';

type Reply = { rows?: unknown[]; rowCount?: number } | Error;
type Call = { sql: string; values: unknown[] };

/**
 * A Pool double: records every SQL text (and its bind values); `script` decides
 * each reply by SQL prefix. `poolLog`/`clientLog` are separate so a test can
 * prove a read inside a transaction went through the pooled `client`, not the
 * bare `pool` — a regression there would read outside the open transaction.
 */
function fakePool(script: (sql: string, call: number) => Reply | undefined) {
  const log: string[] = [];
  const poolLog: string[] = [];
  const clientLog: string[] = [];
  const calls: Call[] = [];
  const released: unknown[] = [];
  let call = 0;
  const makeQuery = (ownLog: string[]) => async (sql: string, values: unknown[] = []) => {
    log.push(sql);
    ownLog.push(sql);
    calls.push({ sql, values });
    const reply = script(sql, call++) ?? { rows: [], rowCount: 1 };
    if (reply instanceof Error) throw reply;
    return { rows: reply.rows ?? [], rowCount: reply.rowCount ?? 0 };
  };
  const pool = {
    query: makeQuery(poolLog),
    connect: async () => ({ query: makeQuery(clientLog), release: (err?: unknown) => void released.push(err) }),
    end: async () => void log.push('END'),
  } as unknown as Pool;
  return { pool, log, poolLog, clientLog, calls, released };
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

describe('PostgresDocumentStore update (fake pool)', () => {
  it('sends exactly the deleted field names, and drops an explicit undefined value', async () => {
    const { pool, calls } = fakePool(() => undefined);
    const store = new PostgresDocumentStore(pool);
    await store
      .collection('c')
      .doc('a')
      .update({ gone: DELETE_FIELD, kept: 1, explicitlyUndefined: undefined });
    const update = calls.find((c) => c.sql.startsWith('UPDATE'));
    expect(update?.values).toEqual(['c/a', ['gone'], '{"kept":1}']);
  });
});

describe('PgQuery.orderBy default direction (fake pool)', () => {
  it('defaults the stored direction to "asc", not an empty string', () => {
    const { pool } = fakePool(() => undefined);
    const store = new PostgresDocumentStore(pool);
    const query = store.collection('c').orderBy('x') as unknown as {
      spec: { order: Array<{ field: unknown; dir: string }> };
    };
    expect(query.spec.order).toEqual([{ field: 'x', dir: 'asc' }]);
  });
});

describe('PgCollectionRef.id (fake pool)', () => {
  it('reports only the last path segment for a nested subcollection', () => {
    const { pool } = fakePool(() => undefined);
    const store = new PostgresDocumentStore(pool);
    const nested = store.collection('courses').doc('c1').collection('lessons');
    expect(nested.id).toBe('lessons');
  });
});

describe('PostgresDocumentStore.countOn (fake pool)', () => {
  it('returns 0 when the count query yields no row', async () => {
    const { pool } = fakePool((sql) => (sql.startsWith('SELECT count') ? { rows: [] } : undefined));
    const store = new PostgresDocumentStore(pool);
    const { data } = await store.collection('c').count().get();
    expect(data()).toEqual({ count: 0 });
  });
});

describe('PostgresDocumentStore transaction retry backoff (fake pool)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits BASE_MS * attempt (20, 40, 60, 80 ms) between attempts', async () => {
    const { pool, log } = fakePool((sql) => (sql === 'COMMIT' ? serialization() : undefined));
    const store = new PostgresDocumentStore(pool);
    const begins = () => log.filter((s) => s === 'BEGIN ISOLATION LEVEL SERIALIZABLE').length;

    const result = store.runTransaction(async () => 'never');
    const assertion = expect(result).rejects.toBeInstanceOf(TransactionConflictError);

    await vi.advanceTimersByTimeAsync(0); // let the first attempt's BEGIN/COMMIT run
    expect(begins()).toBe(1);
    await vi.advanceTimersByTimeAsync(19);
    expect(begins()).toBe(1);
    await vi.advanceTimersByTimeAsync(1); // 20ms elapsed -> attempt 2
    expect(begins()).toBe(2);
    await vi.advanceTimersByTimeAsync(39);
    expect(begins()).toBe(2);
    await vi.advanceTimersByTimeAsync(1); // +40ms -> attempt 3
    expect(begins()).toBe(3);
    await vi.advanceTimersByTimeAsync(59);
    expect(begins()).toBe(3);
    await vi.advanceTimersByTimeAsync(1); // +60ms -> attempt 4
    expect(begins()).toBe(4);
    await vi.advanceTimersByTimeAsync(79);
    expect(begins()).toBe(4);
    await vi.advanceTimersByTimeAsync(1); // +80ms -> attempt 5, then gives up
    expect(begins()).toBe(5);

    await assertion;
  });

  it('retries a 40001 thrown from the body itself, not only one thrown at COMMIT', async () => {
    const { pool, log } = fakePool(() => undefined);
    const store = new PostgresDocumentStore(pool);
    let attempts = 0;
    const result = store.runTransaction(async () => {
      attempts++;
      if (attempts === 1) throw serialization();
      return 'ok';
    });
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBe('ok');
    expect(attempts).toBe(2);
    expect(log.filter((s) => s === 'BEGIN ISOLATION LEVEL SERIALIZABLE')).toHaveLength(2);
  });

  it('retries a 40001 thrown by txn.get, not only one thrown at COMMIT', async () => {
    const { pool } = fakePool((sql) => (sql.startsWith('SELECT data') ? serialization() : undefined));
    const store = new PostgresDocumentStore(pool);
    let attempts = 0;
    const result = store.runTransaction(async (txn) => {
      attempts++;
      if (attempts === 1) {
        await txn.get(store.collection('c').doc('a'));
      }
      return 'ok';
    });
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBe('ok');
    expect(attempts).toBe(2);
  });
});

describe('PostgresDocumentStore batch is not retried (fake pool)', () => {
  it('a 40001 during batch commit propagates immediately, without retry', async () => {
    const { pool, log } = fakePool((sql) => (sql === 'COMMIT' ? serialization() : undefined));
    const store = new PostgresDocumentStore(pool);
    const batch = store.batch();
    batch.set(store.collection('c').doc('a'), { v: 1 });
    await expect(batch.commit()).rejects.toMatchObject({ code: '40001' });
    expect(log.filter((s) => s === 'BEGIN ISOLATION LEVEL READ COMMITTED')).toHaveLength(1);
  });
});

describe('PostgresDocumentStore transactions read through the client (fake pool)', () => {
  it('txn.get queries the pooled transaction client, never the bare pool', async () => {
    const { pool, poolLog, clientLog } = fakePool(() => undefined);
    const store = new PostgresDocumentStore(pool);
    await store.runTransaction(async (txn) => txn.get(store.collection('c').doc('a')));
    expect(clientLog.some((s) => s.startsWith('SELECT data'))).toBe(true);
    expect(poolLog.some((s) => s.startsWith('SELECT data'))).toBe(false);
  });
});
