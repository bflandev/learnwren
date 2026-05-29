#!/usr/bin/env tsx
/**
 * tools/promote-to-admin.ts
 *
 * Promote an existing, email-verified user to the ADMIN role. Sets the Firebase
 * Auth custom claim `role: 'ADMIN'` and the Firestore `users/{uid}.role` field.
 * ADMIN is an operator-only grant; there is no in-app admin-management flow.
 *
 * Usage:
 *   pnpm tools:promote-to-admin <email>
 *
 * Targets the local Firebase emulators by default. For production set
 * LEARNWREN_FIREBASE_TARGET=production together with
 * LEARNWREN_API_FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_JSON_PATH.
 */

import * as admin from 'firebase-admin';

import { initFirebaseApp, resolveMode } from './firebase-admin-init';

type AuthLike = Pick<admin.auth.Auth, 'getUserByEmail' | 'setCustomUserClaims'>;
type FirestoreLike = Pick<admin.firestore.Firestore, 'collection'>;

export async function promoteToAdmin(
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

  await auth.setCustomUserClaims(user.uid, { role: 'ADMIN' });
  await firestore.collection('users').doc(user.uid).update({ role: 'ADMIN' });

  console.log(`[promote-admin] Promoted ${email} (uid=${user.uid}) to ADMIN.`);
  console.log(
    '[promote-admin] User must sign out and sign back in for the new role to take effect.',
  );
}

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: pnpm tools:promote-to-admin <email>');
    process.exit(2);
  }

  const mode = resolveMode();
  console.log(`[promote-admin] Target: ${mode}.`);

  try {
    initFirebaseApp(mode);
    await promoteToAdmin(email, admin.auth(), admin.firestore());
  } catch (err) {
    console.error(`[promote-admin] Failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[promote-admin] fatal:', err);
  process.exit(1);
});
