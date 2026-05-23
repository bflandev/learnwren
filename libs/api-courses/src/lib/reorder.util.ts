import { StaleReorderException } from './errors/courses.exception';

/**
 * Verify that `proposedIds` is a permutation of `currentIds`. Used by both
 * the repository (inside the transaction, against the live Firestore set)
 * and the service (against its stale-read snapshot) to reject reorder
 * payloads that have drifted from the underlying collection.
 *
 * Rejects with StaleReorderException when:
 *   - the lengths differ (an id was added or removed);
 *   - `proposedIds` contains duplicates — `["a","a","b"]` would otherwise
 *     slip past a per-id existence loop and silently double-write one id
 *     while losing another. (Pinned by the api-courses regression test
 *     `same-length-duplicate-id reorder rejection`.)
 *   - any proposed id is not present in `currentIds`.
 */
export function assertReorderSetMatches(
  currentIds: string[],
  proposedIds: string[],
): void {
  if (currentIds.length !== proposedIds.length) throw new StaleReorderException();
  const proposed = new Set(proposedIds);
  if (proposed.size !== proposedIds.length) throw new StaleReorderException();
  const current = new Set(currentIds);
  for (const id of proposed) {
    if (!current.has(id)) throw new StaleReorderException();
  }
}
