import { FieldValue } from 'firebase-admin/firestore';

import type { FirestoreHandle } from '@learnwren/api-firebase';

import { DocumentNotFoundError, TransactionConflictError } from './document-store.errors';
import { DELETE_FIELD, type DocRef, type Query } from './document-store.port';
import { FirestoreDocumentStore, toFirestoreData, translateFirestoreError } from './firestore-document-store';

describe('toFirestoreData', () => {
  it('turns DELETE_FIELD into FieldValue.delete() and leaves other values alone', () => {
    const out = toFirestoreData({ a: 1, b: DELETE_FIELD, c: { d: 'x' } });
    expect(out['a']).toBe(1);
    expect((out['b'] as FieldValue).isEqual(FieldValue.delete())).toBe(true);
    expect(out['c']).toEqual({ d: 'x' });
  });
});

describe('translateFirestoreError', () => {
  it('maps gRPC 5 NOT_FOUND to DocumentNotFoundError with the path', () => {
    const err = translateFirestoreError({ code: 5 }, 'courses/c1');
    expect(err).toBeInstanceOf(DocumentNotFoundError);
    expect((err as DocumentNotFoundError).path).toBe('courses/c1');
  });

  it('maps gRPC 5 without a known path to DocumentNotFoundError on "(unknown)"', () => {
    expect((translateFirestoreError({ code: 5 }) as DocumentNotFoundError).path).toBe('(unknown)');
  });

  it('maps gRPC 10 ABORTED to TransactionConflictError, keeping the cause', () => {
    const cause = { code: 10 };
    const err = translateFirestoreError(cause);
    expect(err).toBeInstanceOf(TransactionConflictError);
    expect((err as TransactionConflictError).cause).toBe(cause);
  });

  it('maps gRPC 3 "Transaction is invalid or closed" to TransactionConflictError', () => {
    const err = translateFirestoreError({ code: 3, message: '3 INVALID_ARGUMENT: Transaction is invalid or closed.' });
    expect(err).toBeInstanceOf(TransactionConflictError);
  });

  it('passes every other error through unchanged', () => {
    const other3 = { code: 3, message: 'bad field' };
    const domain = Object.assign(new Error('x'), { code: 'USER_NOT_FOUND' });
    const noMessage = { code: 3 };
    expect(translateFirestoreError(other3)).toBe(other3);
    expect(translateFirestoreError(domain)).toBe(domain);
    expect(translateFirestoreError(noMessage)).toBe(noMessage);
    expect(translateFirestoreError(undefined)).toBeUndefined();
  });
});

// A DocRef/Query stand-in that is NOT an instance of the adapter's own
// FsDocRef/FsQueryWrapper classes, to exercise the "from another store" guards
// (rawRef/rawQuery) that the real emulator contract suite never triggers —
// every ref/query it hands back always came from the same adapter.
const foreignRef = {} as unknown as DocRef;
const foreignQuery = {} as unknown as Query;

describe('FirestoreDocumentStore guards against refs/queries from another adapter', () => {
  function makeFakeDb(overrides: Partial<FirestoreHandle> = {}): FirestoreHandle {
    return { ...overrides } as unknown as FirestoreHandle;
  }

  it('batch().set/update/delete reject a DocRef that is not an FsDocRef', () => {
    const batch = { set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn() };
    const db = makeFakeDb({ batch: () => batch as never });
    const store = new FirestoreDocumentStore(db);
    const b = store.batch();
    expect(() => b.set(foreignRef, {})).toThrow('FirestoreDocumentStore: DocRef from another store');
    expect(() => b.update(foreignRef, {})).toThrow('FirestoreDocumentStore: DocRef from another store');
    expect(() => b.delete(foreignRef)).toThrow('FirestoreDocumentStore: DocRef from another store');
    expect(batch.set).not.toHaveBeenCalled();
    expect(batch.update).not.toHaveBeenCalled();
    expect(batch.delete).not.toHaveBeenCalled();
  });

  it('recursiveDelete rejects a DocRef that is not an FsDocRef', async () => {
    const db = makeFakeDb({ recursiveDelete: vi.fn() });
    const store = new FirestoreDocumentStore(db);
    await expect(store.recursiveDelete(foreignRef)).rejects.toThrow(
      'FirestoreDocumentStore: DocRef from another store',
    );
  });

  it('a transaction rejects a Query that is not an FsQueryWrapper', async () => {
    const db = makeFakeDb({
      runTransaction: (fn: (t: unknown) => Promise<unknown>) => fn({}),
    });
    const store = new FirestoreDocumentStore(db);
    await expect(
      store.runTransaction(async (txn) => {
        await txn.get(foreignQuery);
      }),
    ).rejects.toThrow('FirestoreDocumentStore: Query from another store');
  });

  it('a transaction set/update/delete reject a DocRef that is not an FsDocRef', async () => {
    const t = { set: vi.fn(), update: vi.fn(), delete: vi.fn(), get: vi.fn() };
    const db = makeFakeDb({
      runTransaction: (fn: (t: unknown) => Promise<unknown>) => fn(t),
    });
    const store = new FirestoreDocumentStore(db);
    await store.runTransaction(async (txn) => {
      expect(() => txn.set(foreignRef, {})).toThrow('FirestoreDocumentStore: DocRef from another store');
      expect(() => txn.update(foreignRef, {})).toThrow('FirestoreDocumentStore: DocRef from another store');
      expect(() => txn.delete(foreignRef)).toThrow('FirestoreDocumentStore: DocRef from another store');
    });
    expect(t.set).not.toHaveBeenCalled();
    expect(t.update).not.toHaveBeenCalled();
    expect(t.delete).not.toHaveBeenCalled();
  });
});

describe('FirestoreDocumentStore translates errors on batch commit and runTransaction', () => {
  it('batch().commit() translates a thrown Firestore error', async () => {
    const batch = {
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn().mockRejectedValue({ code: 5 }),
    };
    const db = { batch: () => batch as never } as unknown as FirestoreHandle;
    const store = new FirestoreDocumentStore(db);
    await expect(store.batch().commit()).rejects.toBeInstanceOf(DocumentNotFoundError);
  });

  it('runTransaction translates a thrown Firestore error', async () => {
    const db = {
      runTransaction: vi.fn().mockRejectedValue({ code: 10 }),
    } as unknown as FirestoreHandle;
    const store = new FirestoreDocumentStore(db);
    await expect(store.runTransaction(async () => 'unreached')).rejects.toBeInstanceOf(
      TransactionConflictError,
    );
  });
});
