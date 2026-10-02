import { runTransactionWithRetry, type DocumentStore } from '@learnwren/api-document-store';
import type { Enrollment } from '@learnwren/shared-data-models';

/** How long a WITHDRAWN enrollment (and its progress) is kept for re-enrolment. */
export const WITHDRAWN_RETENTION_DAYS = 90;
const DAY_MS = 86_400_000;

/**
 * Hard-deletes WITHDRAWN enrollments withdrawn more than `retentionDays`
 * before `now`. Returns how many were deleted. Run by the operator tool
 * `pnpm tools:purge-withdrawn-enrollments` (cron it; there is no scheduler).
 *
 * ponytail: scans every WITHDRAWN row (the port has only ==/in filters);
 * page the scan if that set ever gets large.
 */
export async function purgeWithdrawnEnrollments(
  store: DocumentStore,
  now: Date,
  retentionDays = WITHDRAWN_RETENTION_DAYS,
): Promise<number> {
  const cutoff = now.getTime() - retentionDays * DAY_MS;
  const isExpired = (e: Enrollment | null): boolean =>
    e?.status === 'WITHDRAWN' &&
    // Stryker disable next-line ConditionalExpression: equivalent — Date.parse(null) is NaN and NaN < cutoff is false.
    e.withdrawnAt != null &&
    Date.parse(e.withdrawnAt) < cutoff;

  const snap = await store.collection('enrollments').where('status', '==', 'WITHDRAWN').get();
  let deleted = 0;
  for (const doc of snap.docs) {
    // Stryker disable next-line ConditionalExpression: equivalent — skipping only saves a transaction; the transaction re-checks the same condition.
    if (!isExpired(doc.data() as Enrollment)) continue;
    // Re-check inside a transaction: a student who re-enrolled since the scan keeps their progress.
    const removed = await runTransactionWithRetry(store, async (t) => {
      const fresh = await t.get(doc.ref);
      if (!isExpired(fresh.exists ? (fresh.data() as Enrollment) : null)) return false;
      t.delete(doc.ref);
      return true;
    });
    if (removed) deleted++;
  }
  return deleted;
}
