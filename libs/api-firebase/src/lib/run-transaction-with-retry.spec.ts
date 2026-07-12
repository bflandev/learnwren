import { describe, expect, it, vi } from 'vitest';

import type { FirestoreHandle } from './firebase.tokens';
import { runTransactionWithRetry } from './run-transaction-with-retry';

function dbFailingTimes(times: number, err: unknown) {
  let calls = 0;
  return {
    calls: () => calls,
    db: {
      runTransaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => {
        calls++;
        if (calls <= times) throw err;
        return fn({});
      }),
    } as unknown as FirestoreHandle,
  };
}

const invalidClosed = Object.assign(new Error('3 INVALID_ARGUMENT: Transaction is invalid or closed.'), {
  code: 3,
});
const aborted = Object.assign(new Error('10 ABORTED: contention'), { code: 10 });

describe('runTransactionWithRetry', () => {
  it('retries the transaction on "Transaction is invalid or closed" (gRPC 3) and succeeds', async () => {
    const { db, calls } = dbFailingTimes(1, invalidClosed);
    const result = await runTransactionWithRetry(db, async () => 'ok');
    expect(result).toBe('ok');
    expect(calls()).toBe(2);
  });

  it('retries on residual ABORTED (gRPC 10) after the SDK gives up', async () => {
    const { db, calls } = dbFailingTimes(2, aborted);
    await expect(runTransactionWithRetry(db, async () => 'ok')).resolves.toBe('ok');
    expect(calls()).toBe(3);
  });

  it('gives up after the retry budget and rethrows the transient error', async () => {
    const { db, calls } = dbFailingTimes(99, invalidClosed);
    await expect(runTransactionWithRetry(db, async () => 'ok')).rejects.toBe(invalidClosed);
    expect(calls()).toBe(3); // 1 attempt + 2 retries
  });

  it('does not retry domain exceptions thrown by the transaction body', async () => {
    const domainErr = Object.assign(new Error('CATEGORY_IN_USE'), { code: 'CATEGORY_IN_USE', status: 409 });
    const { db, calls } = dbFailingTimes(99, domainErr);
    await expect(runTransactionWithRetry(db, async () => 'ok')).rejects.toBe(domainErr);
    expect(calls()).toBe(1);
  });

  it('does not retry a gRPC 3 with an unrelated message', async () => {
    const otherInvalid = Object.assign(new Error('3 INVALID_ARGUMENT: bad field path'), { code: 3 });
    const { db, calls } = dbFailingTimes(99, otherInvalid);
    await expect(runTransactionWithRetry(db, async () => 'ok')).rejects.toBe(otherInvalid);
    expect(calls()).toBe(1);
  });
});
