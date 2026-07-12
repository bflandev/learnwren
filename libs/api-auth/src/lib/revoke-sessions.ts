import type { FirebaseAuthHandle } from '@learnwren/api-firebase';

// Safety margin past the second boundary — clock skew between this process
// and Firebase's stamping of tokensValidAfterTime.
const SECOND_BOUNDARY_MARGIN_MS = 250;

/** True when the API talks to the Firebase Auth emulator (dev/e2e). */
export function isAuthEmulator(): boolean {
  return Boolean(process.env['FIREBASE_AUTH_EMULATOR_HOST']);
}

/**
 * Revoke ALL of a user's sessions, closing the same-second minting gap:
 * Firebase compares tokensValidAfterTime to a cookie's iat at whole-second
 * precision, so a revoke landing in the same wall-second a cookie was minted
 * is a silent no-op for that cookie. Unlike logout there is no cookie here to
 * confirm against (the targets are other devices' sessions), so instead of
 * confirm-and-retry, revoke once more strictly past the next second boundary
 * — the second stamp is greater than the iat of any cookie minted before or
 * during the first revoke. In the emulator (dev/e2e only) the ~1s wait is
 * skipped: dev sessions don't need the same-second guarantee, and unit tests
 * set the emulator env var to avoid real sleeps.
 *
 * Failures propagate: callers choose best-effort (password/email change,
 * where the primary mutation already succeeded) or fatal (demote).
 */
export async function revokeAllUserSessions(
  auth: FirebaseAuthHandle,
  uid: string,
): Promise<void> {
  await auth.revokeRefreshTokens(uid);
  if (isAuthEmulator()) return;
  await sleepPastNextSecond();
  await auth.revokeRefreshTokens(uid);
}

function sleepPastNextSecond(): Promise<void> {
  const waitMs = 1000 - (Date.now() % 1000) + SECOND_BOUNDARY_MARGIN_MS;
  return new Promise<void>((resolve) => setTimeout(resolve, waitMs));
}
