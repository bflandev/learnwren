import { Inject, Injectable } from '@nestjs/common';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type { User, UserId } from '@learnwren/shared-data-models';

const USERS = 'users';
const FALLBACK_NAME = 'Instructor';

/**
 * Read-only lookup of instructor display names from the `users` collection.
 * The only place the catalogue reaches outside the `courses` collection.
 */
@Injectable()
export class InstructorDirectory {
  constructor(@Inject(FIRESTORE) private readonly firestore: FirestoreHandle) {}

  /**
   * Resolve a display name for each id. Deduplicates ids, reads the matching
   * `users/{uid}` documents in parallel, and falls back to "Instructor" for
   * any id with no user document.
   */
  async displayNamesFor(uids: UserId[]): Promise<Map<UserId, string>> {
    const unique = [...new Set(uids)];
    const entries = await Promise.all(
      unique.map(async (uid): Promise<[UserId, string]> => {
        const snap = await this.firestore.collection(USERS).doc(uid).get();
        const data = snap.exists ? (snap.data() as User) : undefined;
        return [uid, data?.displayName ?? FALLBACK_NAME];
      }),
    );
    return new Map(entries);
  }
}
