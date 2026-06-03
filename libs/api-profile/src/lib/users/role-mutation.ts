import type { UserId } from '@learnwren/shared-data-models';

/** Minimal structural slice of the Firebase Admin Auth handle used to demote. */
export interface DemotionAuthLike {
  setCustomUserClaims(uid: string, claims: object | null): Promise<unknown>;
  revokeRefreshTokens(uid: string): Promise<unknown>;
}

/** Minimal structural slice of the Firebase Admin Firestore handle used to demote. */
export interface DemotionFirestoreLike {
  collection(path: string): {
    doc(id: string): { update(data: Record<string, unknown>): Promise<unknown> };
  };
}

/**
 * Revoke the INSTRUCTOR role: set the STUDENT custom claim, update
 * `users/{uid}.role`, and revoke the user's refresh tokens so the change takes
 * effect on their next request (the session guard verifies cookies with
 * `checkRevoked = true`). Pure over the Admin-SDK handles so it stays
 * unit-testable and Nest-free, mirroring `promoteUserToInstructor`.
 */
export async function demoteInstructorToStudent(
  uid: UserId,
  auth: DemotionAuthLike,
  firestore: DemotionFirestoreLike,
): Promise<void> {
  await auth.setCustomUserClaims(uid, { role: 'STUDENT' });
  await firestore.collection('users').doc(uid).update({ role: 'STUDENT' });
  await auth.revokeRefreshTokens(uid);
}
