import { TransactionConflictError } from './document-store.errors';
import type { DocumentStore, Transaction } from './document-store.port';

const TRANSIENT_TXN_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 100;

/**
 * runTransaction with a small retry budget for TransactionConflictError, which
 * each adapter raises for its own transient failures. The whole body re-runs,
 * so callers keep bodies free of external side effects.
 *
 * ponytail: applied where the failure was observed (query-in-txn repos);
 * wrap further repositories if the same 500 ever shows up elsewhere.
 */
export async function runTransactionWithRetry<T>(
  store: DocumentStore,
  fn: (txn: Transaction) => Promise<T>,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= TRANSIENT_TXN_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * attempt));
    }
    try {
      return await store.runTransaction(fn);
    } catch (err) {
      if (!(err instanceof TransactionConflictError)) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}
