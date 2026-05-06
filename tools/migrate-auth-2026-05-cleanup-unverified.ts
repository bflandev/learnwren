#!/usr/bin/env tsx
/**
 * tools/migrate-auth-2026-05-cleanup-unverified.ts
 *
 * Pre-deploy cleanup. Lists every Firebase Auth user with emailVerified=false,
 * and (if --confirm is passed) deletes the user and the matching users/{uid}
 * Firestore doc. Idempotent.
 *
 * Usage:
 *   tsx tools/migrate-auth-2026-05-cleanup-unverified.ts          # dry run, lists only
 *   tsx tools/migrate-auth-2026-05-cleanup-unverified.ts --confirm # deletes
 *
 * Requires: FIREBASE_SERVICE_ACCOUNT_JSON_PATH + LEARNWREN_API_FIREBASE_PROJECT_ID
 * for prod, or running against the emulator with FIREBASE_AUTH_EMULATOR_HOST +
 * FIRESTORE_EMULATOR_HOST exported.
 */

import * as admin from 'firebase-admin';

async function main(): Promise<void> {
  const confirm = process.argv.includes('--confirm');

  const projectId =
    process.env['LEARNWREN_API_FIREBASE_PROJECT_ID'] ?? 'demo-learnwren';
  const credentialPath = process.env['FIREBASE_SERVICE_ACCOUNT_JSON_PATH'];

  if (admin.apps.length === 0) {
    if (credentialPath) {
      admin.initializeApp({ projectId, credential: admin.credential.cert(credentialPath) });
    } else {
      admin.initializeApp({ projectId });
    }
  }

  const auth = admin.auth();
  const firestore = admin.firestore();

  const unverified: { uid: string; email: string }[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      if (!user.emailVerified) {
        unverified.push({ uid: user.uid, email: user.email ?? '(no email)' });
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  console.log(`[migrate] Found ${unverified.length} unverified user(s):`);
  for (const u of unverified) {
    console.log(`  - ${u.uid}  ${u.email}`);
  }

  if (!confirm) {
    console.log('\n[migrate] Dry run. Re-run with --confirm to delete.');
    return;
  }

  let deleted = 0;
  for (const u of unverified) {
    try {
      await auth.deleteUser(u.uid);
    } catch (err) {
      console.warn(`[migrate] auth.deleteUser ${u.uid} failed: ${String(err)}`);
    }
    try {
      await firestore.collection('users').doc(u.uid).delete();
    } catch (err) {
      console.warn(`[migrate] firestore users/${u.uid} delete failed: ${String(err)}`);
    }
    deleted += 1;
  }
  console.log(`[migrate] Deleted ${deleted} user(s).`);
}

main().catch((err) => {
  console.error('[migrate] fatal:', err);
  process.exit(1);
});
