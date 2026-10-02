#!/usr/bin/env tsx
/**
 * tools/promote-to-admin.ts
 *
 * Promote an existing, email-verified user to the ADMIN role (identity role
 * plus `users/{uid}.role`). ADMIN is an operator-only grant; there is no
 * in-app admin-management flow.
 *
 * Usage:
 *   pnpm tools:promote-to-admin <email>
 *
 * Backend follows LEARNWREN_DATA_STORE / LEARNWREN_IDENTITY (see backend-init).
 * Firebase mode targets the local emulators by default. For production set
 * LEARNWREN_FIREBASE_TARGET=production together with
 * LEARNWREN_API_FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_JSON_PATH.
 */

import { promoteToAdmin } from '../libs/api-profile/src/lib/instructor-application/admin-promotion';

import { initBackend } from './backend-init';

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: pnpm tools:promote-to-admin <email>');
    process.exit(2);
  }

  let exitCode = 0;
  const backend = await initBackend().catch((err) => {
    console.error(`[promote-admin] Failed: ${err instanceof Error ? err.message : String(err)}`);
    return process.exit(1);
  });
  console.log(`[promote-admin] Target: ${backend.description}.`);
  try {
    await promoteToAdmin(email, backend.identity, backend.store);
    console.log(`[promote-admin] Promoted ${email} to ADMIN.`);
    console.log('[promote-admin] User must sign out and sign back in for the new role to take effect.');
  } catch (err) {
    console.error(`[promote-admin] Failed: ${err instanceof Error ? err.message : String(err)}`);
    exitCode = 1;
  } finally {
    await backend.close();
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error('[promote-admin] fatal:', err);
  process.exit(1);
});
