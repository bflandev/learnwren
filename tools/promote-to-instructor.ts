#!/usr/bin/env tsx
/**
 * tools/promote-to-instructor.ts
 *
 * Promote an existing, email-verified user to the INSTRUCTOR role. Sets the
 * Firebase Auth custom claim `role: 'INSTRUCTOR'` and the Firestore
 * `users/{uid}.role` field.
 *
 * Usage:
 *   pnpm tools:promote-to-instructor <email>
 *
 * Targets the local Firebase emulators by default (no setup needed beyond
 * `pnpm emulators`). To run against production, set
 * LEARNWREN_FIREBASE_TARGET=production together with
 * LEARNWREN_API_FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_JSON_PATH.
 */

import * as admin from 'firebase-admin';

import { promoteUserToInstructor } from '../libs/api-profile/src/lib/instructor-application/instructor-promotion';
import type { PromotionFirestoreLike } from '../libs/api-profile/src/lib/instructor-application/instructor-promotion';
import type { UserId } from '@learnwren/shared-data-models';

import { initFirebaseApp, resolveMode } from './firebase-admin-init';

type AuthLike = Pick<admin.auth.Auth, 'getUserByEmail' | 'setCustomUserClaims'>;
type FirestoreLike = Pick<admin.firestore.Firestore, 'collection'>;

export async function promoteToInstructor(
  email: string,
  auth: AuthLike,
  firestore: FirestoreLike,
): Promise<void> {
  const user = await auth.getUserByEmail(email);
  if (!user.emailVerified) {
    throw new Error(
      `Refusing to promote ${email}: the account is not email-verified. ` +
        'Have the user verify their email first.',
    );
  }

  await promoteUserToInstructor(
    user.uid as UserId,
    auth,
    firestore as unknown as PromotionFirestoreLike,
    new Date().toISOString(),
  );

  console.log(`[promote] Promoted ${email} (uid=${user.uid}) to INSTRUCTOR.`);
  console.log(
    '[promote] User must sign out and sign back in for the new role to take effect.',
  );
}

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: pnpm tools:promote-to-instructor <email>');
    process.exit(2);
  }

  const mode = resolveMode();
  console.log(`[promote] Target: ${mode}.`);

  try {
    initFirebaseApp(mode);
    await promoteToInstructor(email, admin.auth(), admin.firestore());
  } catch (err) {
    console.error(`[promote] Failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[promote] fatal:', err);
  process.exit(1);
});
