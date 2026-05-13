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
 * Requires: FIREBASE_SERVICE_ACCOUNT_JSON_PATH + LEARNWREN_API_FIREBASE_PROJECT_ID
 * for prod, or running against the emulator with FIREBASE_AUTH_EMULATOR_HOST +
 * FIRESTORE_EMULATOR_HOST exported.
 */

import * as admin from 'firebase-admin';

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

  await auth.setCustomUserClaims(user.uid, { role: 'INSTRUCTOR' });
  await firestore.collection('users').doc(user.uid).update({ role: 'INSTRUCTOR' });

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

  const projectId =
    process.env['LEARNWREN_API_FIREBASE_PROJECT_ID'] ?? 'demo-learnwren';
  const credentialPath = process.env['FIREBASE_SERVICE_ACCOUNT_JSON_PATH'];

  if (admin.apps.length === 0) {
    if (credentialPath) {
      admin.initializeApp({
        projectId,
        credential: admin.credential.cert(credentialPath),
      });
    } else {
      admin.initializeApp({ projectId });
    }
  }

  try {
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
