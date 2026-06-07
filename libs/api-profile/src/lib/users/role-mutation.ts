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
 * Revoke the INSTRUCTOR role. Step order is chosen for partial-failure safety:
 *
 *  1. `setCustomUserClaims` → any NEW token the user mints is STUDENT.
 *  2. `revokeRefreshTokens` → invalidates already-issued INSTRUCTOR session
 *     cookies (the session guard verifies with `checkRevoked = true`). This is
 *     the security-critical step; it must never be skipped. The previous order
 *     ("claim → Firestore → revoke") skipped it whenever the Firestore write
 *     threw, leaving a demoted user with live INSTRUCTOR sessions.
 *  3. `users/{uid}.role` (+ `updatedAt`) is written LAST. The admin `demote()`
 *     gate reads this field, so writing it last keeps the operation cleanly
 *     retryable: any failure above leaves the user still INSTRUCTOR in
 *     Firestore (a retry re-runs and re-attempts the revoke) rather than the
 *     un-retryable "Firestore says STUDENT but tokens were never revoked" trap.
 *
 * Pure over the Admin-SDK handles so it stays unit-testable and Nest-free,
 * mirroring `promoteUserToInstructor`.
 */
export async function demoteInstructorToStudent(
  uid: UserId,
  auth: DemotionAuthLike,
  firestore: DemotionFirestoreLike,
  nowIso: string,
): Promise<void> {
  await auth.setCustomUserClaims(uid, { role: 'STUDENT' });
  await auth.revokeRefreshTokens(uid);
  await firestore.collection('users').doc(uid).update({ role: 'STUDENT', updatedAt: nowIso });
}
