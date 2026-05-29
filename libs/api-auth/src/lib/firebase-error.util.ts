/**
 * Narrow an unknown caught value to a Firebase-style error carrying a string
 * `code`. The auth services branch on `err.code` (e.g. `auth/user-not-found`,
 * `auth/email-already-exists`); this guard lets them do so without unsafe
 * property access on non-object throws (strings, null, etc.). Shared by
 * AuthService and AccountRecoveryService so the predicate is defined — and
 * tested — exactly once.
 */
export function isFirebaseError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && 'code' in err;
}
