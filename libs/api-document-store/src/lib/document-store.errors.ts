/** `update` on a document that does not exist. */
export class DocumentNotFoundError extends Error {
  override readonly name = 'DocumentNotFoundError';
  constructor(readonly path: string) {
    super(`Document not found: ${path}`);
  }
}

/** A transient transaction failure; only runTransactionWithRetry inspects it. */
export class TransactionConflictError extends Error {
  override readonly name = 'TransactionConflictError';
  constructor(cause: unknown) {
    super('Transaction conflict', { cause });
  }
}
