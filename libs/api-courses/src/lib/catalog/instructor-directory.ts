import { Inject, Injectable } from '@nestjs/common';

import { FIRESTORE, type FirestoreHandle, readStoredUserProfiles } from '@learnwren/api-firebase';
import type { UserId } from '@learnwren/shared-data-models';

const FALLBACK_NAME = 'Instructor';

export interface InstructorRef {
  displayName: string;
  photoUrl?: string;
  biography?: string;
}

/**
 * Read-only lookup of instructor refs (display name + optional photo + optional bio)
 * from the `users` collection. The only place the catalogue reaches outside the
 * `courses` collection.
 */
@Injectable()
export class InstructorDirectory {
  constructor(@Inject(FIRESTORE) private readonly firestore: FirestoreHandle) {}

  /**
   * Resolve a display name + optional photo URL + optional biography for each id.
   * Deduplicates ids and reads `users/{uid}` documents in parallel.
   * Falls back to `{ displayName: 'Instructor' }` when the user document does not exist.
   */
  async instructorRefsFor(uids: UserId[]): Promise<Map<UserId, InstructorRef>> {
    const stored = await readStoredUserProfiles(this.firestore, uids);
    const unique = [...new Set(uids)];
    return new Map(
      unique.map((uid): [UserId, InstructorRef] => {
        const data = stored.get(uid);
        const ref: InstructorRef = { displayName: data?.displayName ?? FALLBACK_NAME };
        if (data?.photoUrl) ref.photoUrl = data.photoUrl;
        if (data?.biography) ref.biography = data.biography;
        return [uid, ref];
      }),
    );
  }

  /** @deprecated Prefer `instructorRefsFor`. Retained as a thin shim for now. */
  async displayNamesFor(uids: UserId[]): Promise<Map<UserId, string>> {
    const refs = await this.instructorRefsFor(uids);
    return new Map([...refs].map(([uid, ref]) => [uid, ref.displayName]));
  }
}
