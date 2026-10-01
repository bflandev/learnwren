import type { OnApplicationShutdown } from '@nestjs/common';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

import { DocumentNotFoundError, TransactionConflictError } from '../document-store.errors';
import {
  DELETE_FIELD,
  type CollectionRef,
  type CountQuery,
  type DocData,
  type DocRef,
  type DocSnapshot,
  type DocumentStore,
  type FieldRef,
  type Query,
  type QuerySnapshot,
  type SortDir,
  type Transaction,
  type WhereOp,
  type WriteBatch,
} from '../document-store.port';
import type { QuerySpec } from '../query-spec';
import { stripUndefined } from '../strip-undefined';
import { autoId } from './auto-id';
import { escapeLike, splitPath } from './paths';
import { SCHEMA_LOCK_KEY, SCHEMA_SQL } from './schema';
import { buildQuerySql } from './sql-query';

export const MAX_TXN_ATTEMPTS = 5;
const TXN_RETRY_BASE_MS = 20;
const SERIALIZATION_FAILURE = '40001';
const DEADLOCK_DETECTED = '40P01';

interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}
type Write = (db: Queryable) => Promise<void>;

/** Postgres's two "try the whole transaction again" outcomes under SERIALIZABLE. */
export function isRetryableTxnError(err: unknown): boolean {
  const code = (err as { code?: unknown } | undefined)?.code;
  return code === SERIALIZATION_FAILURE || code === DEADLOCK_DETECTED;
}

const encode = (data: DocData): string => JSON.stringify(stripUndefined(data));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function upsert(db: Queryable, path: string, data: DocData): Promise<void> {
  const { parent, collection, id } = splitPath(path);
  await db.query(
    'INSERT INTO documents (path, parent, collection, id, data) VALUES ($1, $2, $3, $4, $5::jsonb) ' +
      'ON CONFLICT (path) DO UPDATE SET data = EXCLUDED.data',
    [path, parent, collection, id, encode(data)],
  );
}

async function patch(db: Queryable, path: string, changes: DocData): Promise<void> {
  const removed: string[] = [];
  const kept: DocData = {};
  // encode() below runs `kept` through stripUndefined, which already drops any
  // undefined-valued key — so only DELETE_FIELD needs separating out here.
  for (const [key, value] of Object.entries(changes)) {
    if (value === DELETE_FIELD) removed.push(key);
    else kept[key] = value;
  }
  const result = await db.query('UPDATE documents SET data = (data - $2::text[]) || $3::jsonb WHERE path = $1', [
    path,
    removed,
    encode(kept),
  ]);
  if (result.rowCount === 0) throw new DocumentNotFoundError(path);
}

async function remove(db: Queryable, path: string): Promise<void> {
  await db.query('DELETE FROM documents WHERE path = $1', [path]);
}

/**
 * BEGIN … COMMIT on one pooled connection; ROLLBACK on any error. A failed
 * ROLLBACK means the connection is unusable, so it is destroyed (release(err))
 * instead of returned to the pool; the original error is the one rethrown.
 */
async function inTransaction<T>(
  pool: Pool,
  isolation: 'SERIALIZABLE' | 'READ COMMITTED',
  body: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
    const result = await body(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch((rollbackErr: unknown) => {
      broken = rollbackErr instanceof Error ? rollbackErr : new Error(String(rollbackErr));
    });
    throw err;
  } finally {
    client.release(broken);
  }
}

class PgQuery implements Query {
  constructor(
    protected readonly store: PostgresDocumentStore,
    readonly spec: QuerySpec,
  ) {}
  where(field: FieldRef, op: WhereOp, value: unknown): Query {
    return new PgQuery(this.store, { ...this.spec, filters: [...this.spec.filters, { field, op, value }] });
  }
  orderBy(field: FieldRef, dir: SortDir = 'asc'): Query {
    return new PgQuery(this.store, { ...this.spec, order: [...this.spec.order, { field, dir }] });
  }
  limit(n: number): Query {
    return new PgQuery(this.store, { ...this.spec, limit: n });
  }
  count(): CountQuery {
    return {
      get: async () => {
        const count = await this.store.countOn(this.store.pool, this.spec);
        return { data: () => ({ count }) };
      },
    };
  }
  get(): Promise<QuerySnapshot> {
    return this.store.queryOn(this.store.pool, this.spec);
  }
}

class PgCollectionRef extends PgQuery implements CollectionRef {
  constructor(
    store: PostgresDocumentStore,
    private readonly path: string,
  ) {
    super(store, { source: path, group: false, filters: [], order: [] });
  }
  get id(): string {
    return this.path.slice(this.path.lastIndexOf('/') + 1);
  }
  doc(id?: string): DocRef {
    return new PgDocRef(this.store, `${this.path}/${id ?? autoId()}`);
  }
}

class PgDocRef implements DocRef {
  constructor(
    private readonly store: PostgresDocumentStore,
    readonly path: string,
  ) {}
  get id(): string {
    return this.path.slice(this.path.lastIndexOf('/') + 1);
  }
  collection(name: string): CollectionRef {
    return new PgCollectionRef(this.store, `${this.path}/${name}`);
  }
  get(): Promise<DocSnapshot> {
    return this.store.readOn(this.store.pool, this.path);
  }
  set(data: DocData): Promise<void> {
    return upsert(this.store.pool, this.path, data);
  }
  update(changes: DocData): Promise<void> {
    return patch(this.store.pool, this.path, changes);
  }
  delete(): Promise<void> {
    return remove(this.store.pool, this.path);
  }
}

/** The self-hosted adapter: every collection in one Postgres table (spec §3.3). */
export class PostgresDocumentStore implements DocumentStore, OnApplicationShutdown {
  constructor(readonly pool: Pool) {}

  collection(name: string): CollectionRef {
    return new PgCollectionRef(this, name);
  }

  collectionGroup(collectionId: string): Query {
    return new PgQuery(this, { source: collectionId, group: true, filters: [], order: [] });
  }

  batch(): WriteBatch {
    const writes: Write[] = [];
    return {
      set: (ref, data) => void writes.push((db) => upsert(db, ref.path, data)),
      update: (ref, changes) => void writes.push((db) => patch(db, ref.path, changes)),
      delete: (ref) => void writes.push((db) => remove(db, ref.path)),
      commit: () =>
        inTransaction(this.pool, 'READ COMMITTED', async (client) => {
          for (const write of writes) await write(client);
        }),
    };
  }

  /**
   * SERIALIZABLE, writes buffered until the body resolves (reads come first,
   * as on Firestore). Serialization failures and deadlocks re-run the whole
   * body, like the Firestore SDK's own retries; after MAX_TXN_ATTEMPTS the
   * last one surfaces as TransactionConflictError.
   */
  async runTransaction<T>(fn: (txn: Transaction) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await inTransaction(this.pool, 'SERIALIZABLE', async (client) => {
          const writes: Write[] = [];
          const result = await fn(this.transactionOn(client, writes));
          for (const write of writes) await write(client);
          return result;
        });
      } catch (err) {
        if (!isRetryableTxnError(err)) throw err;
        if (attempt >= MAX_TXN_ATTEMPTS) throw new TransactionConflictError(err);
        await sleep(TXN_RETRY_BASE_MS * attempt);
      }
    }
  }

  async recursiveDelete(ref: DocRef): Promise<void> {
    await this.pool.query("DELETE FROM documents WHERE path = $1 OR path LIKE $2 ESCAPE '\\'", [
      ref.path,
      `${escapeLike(ref.path)}/%`,
    ]);
  }

  /** Creates the table and indexes if missing; safe to call concurrently. */
  async ensureSchema(): Promise<void> {
    await inTransaction(this.pool, 'READ COMMITTED', async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [SCHEMA_LOCK_KEY]);
      await client.query(SCHEMA_SQL);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }

  /** @internal */
  async readOn(db: Queryable, path: string): Promise<DocSnapshot> {
    const { rows } = await db.query<{ data: DocData }>('SELECT data FROM documents WHERE path = $1', [path]);
    const data = rows[0]?.data;
    return {
      exists: data !== undefined,
      id: path.slice(path.lastIndexOf('/') + 1),
      ref: new PgDocRef(this, path),
      // structuredClone(undefined) is undefined, so no separate undefined check is needed.
      data: () => structuredClone(data),
    };
  }

  /** @internal */
  async queryOn(db: Queryable, spec: QuerySpec): Promise<QuerySnapshot> {
    const { text, values } = buildQuerySql(spec, 'rows');
    const { rows } = await db.query<{ path: string; data: DocData }>(text, values);
    return {
      empty: rows.length === 0,
      size: rows.length,
      docs: rows.map((row) => ({
        id: row.path.slice(row.path.lastIndexOf('/') + 1),
        ref: new PgDocRef(this, row.path),
        data: () => structuredClone(row.data),
      })),
    };
  }

  /** @internal */
  async countOn(db: Queryable, spec: QuerySpec): Promise<number> {
    const { text, values } = buildQuerySql(spec, 'count');
    const { rows } = await db.query<{ count: number }>(text, values);
    // count(*) always returns exactly one row; the fallback only satisfies strict-null-checks.
    return rows[0]?.count ?? 0;
  }

  private transactionOn(client: PoolClient, writes: Write[]): Transaction {
    return {
      get: ((source: DocRef | Query) =>
        source instanceof PgQuery
          ? this.queryOn(client, source.spec)
          : this.readOn(client, (source as DocRef).path)) as Transaction['get'],
      set: (ref, data) => void writes.push((db) => upsert(db, ref.path, data)),
      update: (ref, changes) => void writes.push((db) => patch(db, ref.path, changes)),
      delete: (ref) => void writes.push((db) => remove(db, ref.path)),
    };
  }
}
