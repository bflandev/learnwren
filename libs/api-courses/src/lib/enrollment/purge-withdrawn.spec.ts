import { createInMemoryDocumentStore, type DocumentStore } from '@learnwren/api-document-store';

import { purgeWithdrawnEnrollments, WITHDRAWN_RETENTION_DAYS } from './purge-withdrawn';

const NOW = new Date('2026-10-02T12:00:00.000Z');
const DAY_MS = 86_400_000;
const daysAgo = (days: number): string => new Date(NOW.getTime() - days * DAY_MS).toISOString();

function enrollment(id: string, status: 'ACTIVE' | 'WITHDRAWN', withdrawnAt: string | null) {
  return { [`enrollments/${id}`]: { id, status, withdrawnAt, progress: [] } };
}

describe('purgeWithdrawnEnrollments', () => {
  it('retains withdrawn enrollments for 90 days', () => {
    expect(WITHDRAWN_RETENTION_DAYS).toBe(90);
  });

  it('deletes withdrawn enrollments older than the retention window and returns the count', async () => {
    const store = createInMemoryDocumentStore({
      ...enrollment('old', 'WITHDRAWN', daysAgo(91)),
      ...enrollment('older', 'WITHDRAWN', daysAgo(400)),
    });

    const deleted = await purgeWithdrawnEnrollments(store, NOW);

    expect(deleted).toBe(2);
    expect(store.__store.size).toBe(0);
  });

  it('keeps withdrawn enrollments at or inside the window, active ones, and rows with no withdrawnAt', async () => {
    const store = createInMemoryDocumentStore({
      ...enrollment('edge', 'WITHDRAWN', daysAgo(90)),
      ...enrollment('recent', 'WITHDRAWN', daysAgo(1)),
      ...enrollment('active', 'ACTIVE', null),
      ...enrollment('no-stamp', 'WITHDRAWN', null),
    });

    const deleted = await purgeWithdrawnEnrollments(store, NOW);

    expect(deleted).toBe(0);
    expect([...store.__store.keys()].sort()).toEqual([
      'enrollments/active',
      'enrollments/edge',
      'enrollments/no-stamp',
      'enrollments/recent',
    ]);
  });

  it('honours a custom retention window', async () => {
    const store = createInMemoryDocumentStore(enrollment('a', 'WITHDRAWN', daysAgo(8)));

    expect(await purgeWithdrawnEnrollments(store, NOW, 7)).toBe(1);
  });

  /** A store whose transactions first apply `change` — something that landed after the scan. */
  function racingStore(change: (inner: DocumentStore) => Promise<void>) {
    const inner = createInMemoryDocumentStore(enrollment('raced', 'WITHDRAWN', daysAgo(120)));
    const racing: DocumentStore = {
      ...inner,
      runTransaction: async (fn) => {
        await change(inner);
        return inner.runTransaction(fn);
      },
    };
    return { inner, racing };
  }

  it('spares an enrollment re-activated between the scan and the delete', async () => {
    const { inner, racing } = racingStore((s) =>
      s.collection('enrollments').doc('raced').update({ status: 'ACTIVE', withdrawnAt: null }),
    );

    expect(await purgeWithdrawnEnrollments(racing, NOW)).toBe(0);
    expect(inner.__store.get('enrollments/raced')).toMatchObject({ status: 'ACTIVE' });
  });

  it('re-checks the status itself, not only withdrawnAt, inside the transaction', async () => {
    const { inner, racing } = racingStore((s) =>
      s.collection('enrollments').doc('raced').update({ status: 'ACTIVE' }),
    );

    expect(await purgeWithdrawnEnrollments(racing, NOW)).toBe(0);
    expect(inner.__store.has('enrollments/raced')).toBe(true);
  });

  it('skips an enrollment deleted between the scan and the delete', async () => {
    const { racing } = racingStore((s) => s.collection('enrollments').doc('raced').delete());

    expect(await purgeWithdrawnEnrollments(racing, NOW)).toBe(0);
  });
});
