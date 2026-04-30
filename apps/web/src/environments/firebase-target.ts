export type FirebaseTargetMode = 'emulator' | 'production';

/**
 * Maps any raw input (typically the LEARNWREN_FIREBASE_TARGET env var, read at
 * build time) to a strictly-typed mode. Unknown values fall back to 'emulator'
 * so a typo in the shell never silently aims at a real Firebase project.
 */
export function firebaseTargetMode(input: string | undefined): FirebaseTargetMode {
  return input === 'production' ? 'production' : 'emulator';
}
