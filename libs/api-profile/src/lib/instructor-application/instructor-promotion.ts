import type { UserId } from '@learnwren/shared-data-models';

import { INSTRUCTOR_APPLICATIONS_COLLECTION } from './instructor-applications.constants';

/** Minimal structural slice of the Firebase Admin Auth handle. */
export interface PromotionAuthLike {
  setCustomUserClaims(uid: string, claims: object | null): Promise<unknown>;
}

/** Minimal structural slice of the Firebase Admin Firestore handle. */
export interface PromotionFirestoreLike {
  collection(path: string): {
    doc(id: string): {
      get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
      update(data: Record<string, unknown>): Promise<unknown>;
    };
  };
}

/**
 * Grant the INSTRUCTOR role: set the Firebase custom claim, update
 * `users/{uid}.role`, and resolve any PENDING instructor application to
 * APPROVED. Pure over the Admin-SDK handles so the promote-to-instructor CLI
 * and the admin review service share one effect and can't drift. The user must
 * re-authenticate for the new claim to take effect.
 */
export async function promoteUserToInstructor(
  uid: UserId,
  auth: PromotionAuthLike,
  firestore: PromotionFirestoreLike,
  nowIso: string,
): Promise<void> {
  await auth.setCustomUserClaims(uid, { role: 'INSTRUCTOR' });
  await firestore.collection('users').doc(uid).update({ role: 'INSTRUCTOR', updatedAt: nowIso });

  const appRef = firestore.collection(INSTRUCTOR_APPLICATIONS_COLLECTION).doc(uid);
  const snap = await appRef.get();
  if (snap.exists && snap.data()?.['status'] === 'PENDING') {
    await appRef.update({ status: 'APPROVED', resolvedAt: nowIso });
  }
}
