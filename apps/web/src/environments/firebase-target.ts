export type FirebaseTargetMode = 'emulator' | 'production';

export interface FirebaseWebConfig {
  apiKey?: string;
  authDomain?: string;
  projectId: string;
  appId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

export interface EmulatorHosts {
  auth: string;
  firestore: { host: string; port: number };
  storage: { host: string; port: number };
}

/**
 * Environment is a discriminated union — emulator builds carry the local
 * host config, production builds don't. App code that connects to emulators
 * narrows on `firebaseTargetMode === 'emulator'` first; the bundler then
 * dead-code-eliminates the unreachable branch in production builds, so
 * production output ships zero emulator strings.
 */
export type Environment =
  | { firebaseTargetMode: 'emulator'; firebase: FirebaseWebConfig; emulatorHosts: EmulatorHosts }
  | { firebaseTargetMode: 'production'; firebase: FirebaseWebConfig };

/**
 * Maps any raw input (typically the LEARNWREN_FIREBASE_TARGET env var, read at
 * build time) to a strictly-typed mode. Unknown values fall back to 'emulator'
 * so a typo in the shell never silently aims at a real Firebase project.
 */
export function firebaseTargetMode(input: string | undefined): FirebaseTargetMode {
  return input === 'production' ? 'production' : 'emulator';
}
