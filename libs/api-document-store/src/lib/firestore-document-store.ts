import {
  FieldPath,
  FieldValue,
  type CollectionReference,
  type DocumentReference,
  type DocumentSnapshot,
  type Query as FsQuery,
  type QuerySnapshot as FsQuerySnapshot,
  type Transaction as FsTransaction,
} from 'firebase-admin/firestore';

import type { FirestoreHandle } from '@learnwren/api-firebase';

import { DocumentNotFoundError, TransactionConflictError } from './document-store.errors';
import {
  DELETE_FIELD,
  DOCUMENT_ID,
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
} from './document-store.port';

const GRPC_INVALID_ARGUMENT = 3;
const GRPC_NOT_FOUND = 5;
const GRPC_ABORTED = 10;

/** Port sentinels → Firestore's. Top-level fields only, as the call sites use them. */
export function toFirestoreData(data: DocData): DocData {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, value === DELETE_FIELD ? FieldValue.delete() : value]),
  );
}

/**
 * Firestore errors → the port's. NOT_FOUND (update on a missing document) and
 * the two transient transaction failures the SDK's own retry loop does not
 * absorb: gRPC 10 ABORTED after the SDK gave up, and gRPC 3 "Transaction is
 * invalid or closed" (an internal retry replaying a query on an expired
 * transaction, seen under parallel e2e load). Anything else is unchanged.
 */
export function translateFirestoreError(err: unknown, path?: string): unknown {
  const e = err as { code?: unknown; message?: unknown } | undefined;
  if (e?.code === GRPC_NOT_FOUND) return new DocumentNotFoundError(path ?? '(unknown)');
  if (e?.code === GRPC_ABORTED) return new TransactionConflictError(err);
  if (
    e?.code === GRPC_INVALID_ARGUMENT &&
    typeof e.message === 'string' &&
    e.message.includes('Transaction is invalid or closed')
  ) {
    return new TransactionConflictError(err);
  }
  return err;
}

const toFieldPath = (field: FieldRef): string | FieldPath =>
  field === DOCUMENT_ID ? FieldPath.documentId() : field;

function wrapDocSnapshot(snap: DocumentSnapshot): DocSnapshot {
  return { exists: snap.exists, id: snap.id, ref: new FsDocRef(snap.ref), data: () => snap.data() };
}

function wrapQuerySnapshot(snap: FsQuerySnapshot): QuerySnapshot {
  return {
    empty: snap.empty,
    size: snap.size,
    docs: snap.docs.map((d) => ({ id: d.id, ref: new FsDocRef(d.ref), data: () => d.data() })),
  };
}

function rawRef(ref: DocRef): DocumentReference {
  if (!(ref instanceof FsDocRef)) throw new Error('FirestoreDocumentStore: DocRef from another store');
  return ref.raw;
}

function rawQuery(query: Query): FsQuery {
  if (!(query instanceof FsQueryWrapper)) throw new Error('FirestoreDocumentStore: Query from another store');
  return query.raw;
}

class FsQueryWrapper implements Query {
  constructor(readonly raw: FsQuery) {}
  where(field: FieldRef, op: WhereOp, value: unknown): Query {
    return new FsQueryWrapper(this.raw.where(toFieldPath(field), op, value));
  }
  orderBy(field: FieldRef, dir: SortDir = 'asc'): Query {
    return new FsQueryWrapper(this.raw.orderBy(toFieldPath(field), dir));
  }
  limit(n: number): Query {
    return new FsQueryWrapper(this.raw.limit(n));
  }
  count(): CountQuery {
    const aggregate = this.raw.count();
    return {
      get: async () => {
        const snap = await aggregate.get();
        return { data: () => ({ count: snap.data().count }) };
      },
    };
  }
  async get(): Promise<QuerySnapshot> {
    return wrapQuerySnapshot(await this.raw.get());
  }
}

class FsCollectionRef extends FsQueryWrapper implements CollectionRef {
  constructor(private readonly collectionRaw: CollectionReference) {
    super(collectionRaw);
  }
  get id(): string {
    return this.collectionRaw.id;
  }
  doc(id?: string): DocRef {
    return new FsDocRef(id === undefined ? this.collectionRaw.doc() : this.collectionRaw.doc(id));
  }
}

class FsDocRef implements DocRef {
  constructor(readonly raw: DocumentReference) {}
  get id(): string {
    return this.raw.id;
  }
  get path(): string {
    return this.raw.path;
  }
  collection(name: string): CollectionRef {
    return new FsCollectionRef(this.raw.collection(name));
  }
  async get(): Promise<DocSnapshot> {
    return wrapDocSnapshot(await this.raw.get());
  }
  async set(data: DocData): Promise<void> {
    await this.raw.set(toFirestoreData(data));
  }
  async update(patch: DocData): Promise<void> {
    try {
      await this.raw.update(toFirestoreData(patch));
    } catch (err) {
      throw translateFirestoreError(err, this.path);
    }
  }
  async delete(): Promise<void> {
    await this.raw.delete();
  }
}

function wrapTransaction(t: FsTransaction): Transaction {
  return {
    get: (async (source: DocRef | Query) =>
      source instanceof FsDocRef
        ? wrapDocSnapshot(await t.get(source.raw))
        : wrapQuerySnapshot(await t.get(rawQuery(source as Query)))) as Transaction['get'],
    set: (ref, data) => void t.set(rawRef(ref), toFirestoreData(data)),
    update: (ref, patch) => void t.update(rawRef(ref), toFirestoreData(patch)),
    delete: (ref) => void t.delete(rawRef(ref)),
  };
}

/** The cloud adapter: Firestore through the port (spec §3.2). */
export class FirestoreDocumentStore implements DocumentStore {
  constructor(private readonly db: FirestoreHandle) {}

  collection(name: string): CollectionRef {
    return new FsCollectionRef(this.db.collection(name));
  }

  collectionGroup(collectionId: string): Query {
    return new FsQueryWrapper(this.db.collectionGroup(collectionId));
  }

  batch(): WriteBatch {
    const b = this.db.batch();
    return {
      set: (ref, data) => void b.set(rawRef(ref), toFirestoreData(data)),
      update: (ref, patch) => void b.update(rawRef(ref), toFirestoreData(patch)),
      delete: (ref) => void b.delete(rawRef(ref)),
      commit: async () => {
        try {
          await b.commit();
        } catch (err) {
          throw translateFirestoreError(err);
        }
      },
    };
  }

  async runTransaction<T>(fn: (txn: Transaction) => Promise<T>): Promise<T> {
    try {
      return await this.db.runTransaction((t) => fn(wrapTransaction(t)));
    } catch (err) {
      throw translateFirestoreError(err);
    }
  }

  async recursiveDelete(ref: DocRef): Promise<void> {
    await this.db.recursiveDelete(rawRef(ref));
  }
}
