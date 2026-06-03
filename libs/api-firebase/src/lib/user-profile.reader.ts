import type { FirestoreHandle } from './firebase.tokens';

const USERS = 'users';

/**
 * The fields persisted on a `users/{uid}` document that callers read. `id` is the
 * Firestore document key (the uid), not necessarily a stored field, so it is
 * intentionally absent here; every field is optional because older or partial
 * documents may omit any of them. This is the single source of truth for the
 * shape of a stored user profile — previously each consumer cast a raw snapshot
 * to the full `User` type, which asserted fields that may be absent.
 */
export interface StoredUserProfile {
  displayName?: string;
  email?: string;
  photoUrl?: string;
  biography?: string;
}

/**
 * Batch-read `users/{uid}` profile documents. Deduplicates ids and reads them in
 * parallel (one Firestore round-trip per unique id, all concurrent), returning a
 * Map keyed by uid that contains only the documents that exist. Callers apply
 * their own fallback name + projection.
 *
 * This is the ONLY place the API reads the identity-owned `users` collection.
 * Centralizing it removes three drifting re-implementations (roster, instructor
 * directory, admin application review) and collapses the admin review's former
 * sequential per-application read (an O(N) round-trip loop) into one parallel
 * fan-out.
 */
export async function readStoredUserProfiles(
  firestore: FirestoreHandle,
  uids: readonly string[],
): Promise<Map<string, StoredUserProfile>> {
  const unique = [...new Set(uids)];
  const entries = await Promise.all(
    unique.map(async (uid): Promise<readonly [string, StoredUserProfile | undefined]> => {
      const snap = await firestore.collection(USERS).doc(uid).get();
      // Some snapshots expose `exists`; treat only an explicit `false` as missing
      // so callers that supply a bare `{ data }` snapshot still resolve.
      const data = snap.exists === false ? undefined : (snap.data() as StoredUserProfile | undefined);
      return [uid, data] as const;
    }),
  );
  const map = new Map<string, StoredUserProfile>();
  for (const [uid, data] of entries) {
    if (data) map.set(uid, data);
  }
  return map;
}
