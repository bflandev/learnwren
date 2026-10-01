import { FieldValue } from 'firebase-admin/firestore';

import { DocumentNotFoundError, TransactionConflictError } from './document-store.errors';
import { DELETE_FIELD } from './document-store.port';
import { toFirestoreData, translateFirestoreError } from './firestore-document-store';

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
