import { createInMemoryDocumentStore } from './in-memory-document-store';
import { TransactionConflictError } from './document-store.errors';
import type { DocumentStore } from './document-store.port';
import { runTransactionWithRetry } from './run-transaction-with-retry';

function storeFailing(failures: unknown[]): { store: DocumentStore; calls: () => number } {
  const inner = createInMemoryDocumentStore();
  let calls = 0;
  const store: DocumentStore = {
    ...inner,
    runTransaction: async (fn) => {
      calls++;
      const failure = failures.shift();
      if (failure !== undefined) throw failure;
      return inner.runTransaction(fn);
    },
  };
  return { store, calls: () => calls };
}

describe('runTransactionWithRetry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the body result on the first attempt', async () => {
    const { store, calls } = storeFailing([]);
    await expect(runTransactionWithRetry(store, async () => 'ok')).resolves.toBe('ok');
    expect(calls()).toBe(1);
  });

  it('retries a TransactionConflictError and then succeeds', async () => {
    const { store, calls } = storeFailing([new TransactionConflictError({ code: 10 })]);
    const result = runTransactionWithRetry(store, async () => 'ok');
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBe('ok');
    expect(calls()).toBe(2);
  });

  it('gives up after three attempts and throws the last conflict', async () => {
    const last = new TransactionConflictError('third');
    const { store, calls } = storeFailing([
      new TransactionConflictError('first'),
      new TransactionConflictError('second'),
      last,
    ]);
    const result = runTransactionWithRetry(store, async () => 'never');
    const assertion = expect(result).rejects.toBe(last);
    await vi.runAllTimersAsync();
    await assertion;
    expect(calls()).toBe(3);
  });

  it('rethrows any other error immediately', async () => {
    const domain = new Error('domain');
    const { store, calls } = storeFailing([domain]);
    await expect(runTransactionWithRetry(store, async () => 'never')).rejects.toBe(domain);
    expect(calls()).toBe(1);
  });

  it('waits 100 ms, then 200 ms, between attempts', async () => {
    const { store, calls } = storeFailing([
      new TransactionConflictError(1),
      new TransactionConflictError(2),
    ]);
    const result = runTransactionWithRetry(store, async () => 'ok');
    await vi.advanceTimersByTimeAsync(99);
    expect(calls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(199);
    expect(calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe('ok');
    expect(calls()).toBe(3);
  });
});
