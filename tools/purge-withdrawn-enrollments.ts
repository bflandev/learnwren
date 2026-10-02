#!/usr/bin/env tsx
/**
 * tools/purge-withdrawn-enrollments.ts
 *
 * Hard-deletes WITHDRAWN enrollments (and the progress they carry) withdrawn
 * more than 90 days ago. Safe to re-run; run it on a schedule (cron, Cloud
 * Scheduler) — the platform has no scheduler of its own.
 *
 * Usage:
 *   pnpm tools:purge-withdrawn-enrollments
 *
 * Backend follows LEARNWREN_DATA_STORE / LEARNWREN_IDENTITY (see backend-init).
 * Firebase mode targets the local emulators by default. For production set
 * LEARNWREN_FIREBASE_TARGET=production together with
 * LEARNWREN_API_FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_JSON_PATH.
 */

import {
  purgeWithdrawnEnrollments,
  WITHDRAWN_RETENTION_DAYS,
} from '../libs/api-courses/src/lib/enrollment/purge-withdrawn';

import { initBackend } from './backend-init';

async function main(): Promise<void> {
  let exitCode = 0;
  const backend = await initBackend().catch((err) => {
    console.error(`[purge-enrollments] Failed: ${err instanceof Error ? err.message : String(err)}`);
    return process.exit(1);
  });
  console.log(`[purge-enrollments] Target: ${backend.description}.`);
  try {
    const deleted = await purgeWithdrawnEnrollments(backend.store, new Date());
    console.log(
      `[purge-enrollments] Deleted ${deleted} enrollment(s) withdrawn more than ${WITHDRAWN_RETENTION_DAYS} days ago.`,
    );
  } catch (err) {
    console.error(`[purge-enrollments] Failed: ${err instanceof Error ? err.message : String(err)}`);
    exitCode = 1;
  } finally {
    await backend.close();
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error('[purge-enrollments] fatal:', err);
  process.exit(1);
});
