#!/usr/bin/env tsx
/**
 * tools/promote-to-instructor.ts
 *
 * Promote an existing, email-verified user to the INSTRUCTOR role (identity
 * role plus `users/{uid}.role`; resolves a pending instructor application).
 *
 * Usage:
 *   pnpm tools:promote-to-instructor <email>
 *
 * Backend follows LEARNWREN_DATA_STORE / LEARNWREN_IDENTITY (see backend-init).
 * Firebase mode targets the local emulators by default (no setup needed beyond
 * `pnpm emulators`). To run against production, set
 * LEARNWREN_FIREBASE_TARGET=production together with
 * LEARNWREN_API_FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_JSON_PATH.
 */

import { requireVerifiedUser } from '../libs/api-profile/src/lib/instructor-application/admin-promotion';
import { promoteUserToInstructor } from '../libs/api-profile/src/lib/instructor-application/instructor-promotion';
import type { UserId } from '@learnwren/shared-data-models';

import { initBackend } from './backend-init';

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: pnpm tools:promote-to-instructor <email>');
    process.exit(2);
  }

  let exitCode = 0;
  const backend = await initBackend().catch((err) => {
    console.error(`[promote] Failed: ${err instanceof Error ? err.message : String(err)}`);
    return process.exit(1);
  });
  console.log(`[promote] Target: ${backend.description}.`);
  try {
    const user = await requireVerifiedUser(email, backend.identity);
    await promoteUserToInstructor(user.uid as UserId, backend.identity, backend.store, new Date().toISOString());
    console.log(`[promote] Promoted ${email} to INSTRUCTOR.`);
    console.log('[promote] User must sign out and sign back in for the new role to take effect.');
  } catch (err) {
    console.error(`[promote] Failed: ${err instanceof Error ? err.message : String(err)}`);
    exitCode = 1;
  } finally {
    await backend.close();
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error('[promote] fatal:', err);
  process.exit(1);
});
