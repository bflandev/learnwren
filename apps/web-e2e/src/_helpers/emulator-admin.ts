import * as admin from 'firebase-admin';

/**
 * Initialise the firebase-admin app against the emulators, exactly once.
 *
 * Emulator hosts mirror the WEB_PORT pattern in playwright.config.ts:
 * defaults match firebase.json (so CI and plain local runs are unchanged),
 * but a wrapper that runs the suite under `firebase emulators:exec` with a
 * shifted-port config overrides them via the standard Firebase env vars,
 * which emulators:exec exports automatically.
 */
export function ensureEmulatorAdmin(): void {
  if (admin.apps.length === 0) {
    process.env['FIREBASE_AUTH_EMULATOR_HOST'] ??= '127.0.0.1:9099';
    process.env['FIRESTORE_EMULATOR_HOST'] ??= '127.0.0.1:8080';
    admin.initializeApp({ projectId: 'demo-learnwren' });
  }
}
