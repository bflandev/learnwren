import type { firestore } from 'firebase-admin';

import type { FirestoreHandle } from './firebase.tokens';

const TRANSIENT_TXN_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 100;

/**
 * The two transient transaction failures the Firestore SDK's own retry loop
 * does NOT absorb:
 *  - gRPC 3 INVALID_ARGUMENT "Transaction is invalid or closed": an internal
 *    retry-request timeout replayed an in-transaction query on a transaction
 *    that had already expired/aborted. Observed under parallel e2e load on
 *    transactions that run queries (not just doc gets) in-txn.
 *  - gRPC 10 ABORTED leaking out after the SDK exhausted its own attempts.
 * Domain exceptions and any other error are NOT transient and rethrow as-is.
 */
function isTransientTxnError(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown };
  if (e?.code === 10) return true;
  return (
    e?.code === 3 &&
    typeof e.message === 'string' &&
    e.message.includes('Transaction is invalid or closed')
  );
}

/**
 * runTransaction with a small retry budget for the transient failures above.
 * The whole transaction body re-runs, so callers must keep bodies free of
 * external side effects (all repository transactions here already are).
 *
 * ponytail: applied where the failure was observed (query-in-txn repos);
 * wrap further repositories if the same 500 ever shows up elsewhere.
 */
export async function runTransactionWithRetry<T>(
  db: FirestoreHandle,
  fn: (t: firestore.Transaction) => Promise<T>,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= TRANSIENT_TXN_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * attempt));
    }
    try {
      return await db.runTransaction(fn);
    } catch (err) {
      if (!isTransientTxnError(err)) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}
