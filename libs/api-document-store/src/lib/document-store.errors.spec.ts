import { DocumentNotFoundError, TransactionConflictError } from './document-store.errors';

describe('DocumentNotFoundError', () => {
  it('names the missing path and is an Error', () => {
    const err = new DocumentNotFoundError('courses/c1');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('DocumentNotFoundError');
    expect(err.path).toBe('courses/c1');
    expect(err.message).toBe('Document not found: courses/c1');
  });
});

describe('TransactionConflictError', () => {
  it('keeps the adapter error as its cause', () => {
    const cause = { code: 10 };
    const err = new TransactionConflictError(cause);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('TransactionConflictError');
    expect(err.cause).toBe(cause);
    expect(err.message).toBe('Transaction conflict');
  });
});
