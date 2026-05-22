/**
 * tools/firebase-admin-init.ts
 *
 * Shared Firebase Admin SDK initialization for the standalone `tools/*.ts`
 * scripts. Mirrors `libs/api-firebase`'s target resolution: the local
 * emulators are the default, production is opt-in via LEARNWREN_FIREBASE_TARGET.
 *
 * Defaulting to the emulator matters here because FIREBASE_SERVICE_ACCOUNT_JSON_PATH
 * is typically exported per-machine in the developer's shell init — without an
 * explicit emulator default a script would silently make production calls.
 */

import * as admin from 'firebase-admin';

const DEFAULT_EMULATOR_HOSTS = {
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
} as const;

const EMULATOR_PROJECT_ID = 'demo-learnwren';

export type Mode = 'emulator' | 'production';

/**
 * Resolve the Firebase target the same way `libs/api-firebase` does: the
 * emulator unless `LEARNWREN_FIREBASE_TARGET` is explicitly `production`. This
 * keeps the safe (local) path the default.
 */
export function resolveMode(): Mode {
  return process.env['LEARNWREN_FIREBASE_TARGET'] === 'production'
    ? 'production'
    : 'emulator';
}

/**
 * Initialize the singleton Admin SDK app for the given mode (no-op if one
 * already exists). In emulator mode the emulator host env vars are applied so
 * the SDK never reaches GCP. In production mode LEARNWREN_API_FIREBASE_PROJECT_ID
 * is required and this throws if it is missing.
 */
export function initFirebaseApp(mode: Mode): void {
  if (admin.apps.length > 0) return;

  if (mode === 'emulator') {
    // Point the Admin SDK at the local emulators. Without these the SDK makes
    // real GCP calls; combined with a shell-init service-account path that
    // means accidental production writes.
    for (const [key, value] of Object.entries(DEFAULT_EMULATOR_HOSTS)) {
      if (!process.env[key]) process.env[key] = value;
    }
    admin.initializeApp({ projectId: EMULATOR_PROJECT_ID });
    return;
  }

  const projectId = process.env['LEARNWREN_API_FIREBASE_PROJECT_ID'];
  if (!projectId) {
    throw new Error(
      'LEARNWREN_FIREBASE_TARGET=production requires LEARNWREN_API_FIREBASE_PROJECT_ID to be set.',
    );
  }
  const credentialPath = process.env['FIREBASE_SERVICE_ACCOUNT_JSON_PATH'];
  admin.initializeApp(
    credentialPath
      ? { projectId, credential: admin.credential.cert(credentialPath) }
      : { projectId },
  );
}
