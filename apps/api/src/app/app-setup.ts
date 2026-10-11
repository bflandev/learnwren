import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import type { HttpsOptions } from 'firebase-functions/v2/https';

import { readTrustProxyHops } from './trust-proxy';

/**
 * Pure configuration behind main.ts, split out so unit tests can cover it.
 * main.ts stays a thin bootstrap that only picks a mode and wires these in.
 */

export function assertProdSafeEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (env['NODE_ENV'] !== 'production') return;
  if (env['LEARNWREN_TEST_OUTBOX_ENABLED'] === '1') {
    throw new Error(
      'Refusing to start: LEARNWREN_TEST_OUTBOX_ENABLED=1 is incompatible with NODE_ENV=production',
    );
  }
}

/**
 * CORS origin allowlist. Comma-separated list in `LEARNWREN_CORS_ORIGINS`.
 * Defaults to localhost dev origins in non-prod; in prod refuses to start
 * if the env var is unset so a misconfigured deploy doesn't silently fall
 * back to a permissive policy.
 */
export function readAllowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env['LEARNWREN_CORS_ORIGINS'];
  if (raw && raw.trim().length > 0) {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (env['NODE_ENV'] === 'production') {
    throw new Error('Refusing to start: LEARNWREN_CORS_ORIGINS must be set in production');
  }
  return ['http://localhost:4200', 'http://127.0.0.1:4200'];
}

/**
 * Configure middleware and options on an already-created Nest app.
 * Called in BOTH listen mode and functions mode after NestFactory.create() —
 * every shared middleware must live here, not inline in a mode branch, so the
 * two modes cannot drift. Does NOT call app.init() or app.listen().
 */
export function configureApp(app: NestExpressApplication, env: NodeJS.ProcessEnv = process.env): void {
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  // Trust the configured proxy hops (default 1: Firebase Hosting, or the
  // bundled nginx) so Express resolves the real client IP from X-Forwarded-For
  // — otherwise the per-IP ThrottlerGuard keys every request on a proxy's
  // address and collapses all clients into one bucket. See readTrustProxyHops.
  app.set('trust proxy', readTrustProxyHops(env));
  app.enableCors({
    origin: readAllowedOrigins(env),
    credentials: true,
  });
  app.setGlobalPrefix('api');
}

/**
 * Cloud Functions mode detection:
 *   - `K_SERVICE` — set by real Cloud Functions (gen1 and gen2) at cold start.
 *   - `FUNCTIONS_EMULATOR` — set unconditionally by the firebase-tools EMULATOR
 *     during function discovery AND per-request serving.
 *   - `FUNCTIONS_CONTROL_API` — set by `firebase deploy`'s function-discovery
 *     step (firebase-tools runs the `firebase-functions` binary over the bundle
 *     with this flag to enumerate exports). Neither K_SERVICE nor
 *     FUNCTIONS_EMULATOR is set in that context, so without this branch the
 *     bundle falls into listen mode, never sets `module.exports.api`, and the
 *     deploy ships zero functions (the listen also collides with the discovery
 *     harness's port → EADDRINUSE). `FUNCTION_TARGET` is NOT set during
 *     discovery, so it cannot be used for detection.
 */
export function isFunctionsRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    Boolean(env['K_SERVICE']) ||
    Boolean(env['FUNCTIONS_EMULATOR']) ||
    Boolean(env['FUNCTIONS_CONTROL_API'])
  );
}

/**
 * Memoize the init PROMISE — not a boolean flag — so concurrent cold-start
 * requests all await the same initialisation instead of spawning duplicate
 * Nest instances (TOCTOU-safe: the Promise is stored before awaiting).
 *
 * A rejected init must NOT stay memoised. Clearing the promise lets the next
 * request retry a fresh cold init instead of re-awaiting the cached rejection
 * for the lifetime of this warm instance — otherwise a single transient
 * cold-start failure (Secret Manager/Firestore hiccup, OOM while loading
 * sharp/ffprobe at the memory cap) would black-hole every subsequent /api/**
 * request to this instance until the platform evicts it (Cloud Run does not
 * health-check a 500-returning warm instance, and the Hosting rewrite does not
 * retry a 5xx against another instance).
 */
export function memoizeRetryableInit(init: () => Promise<void>): () => Promise<void> {
  let initPromise: Promise<void> | undefined;
  return () => {
    if (!initPromise) {
      initPromise = init().catch((err) => {
        initPromise = undefined;
        throw err;
      });
    }
    return initPromise;
  };
}

/**
 * Options for the exported `api` Cloud Function. Firebase Hosting rewrites
 * /api/** to it. Region + maxInstances provide a cost guard. memory is raised
 * from the 256 MiB v2 default — a NestJS monolith bundling firebase-admin,
 * sharp, nodemailer and ffprobe at the default concurrency (80) is undersized
 * at 256 MiB. SMTP_PASS binds from Cloud Secret Manager
 * (`firebase functions:secrets:set SMTP_PASS`) and surfaces as
 * process.env.SMTP_PASS at runtime; rotation requires a redeploy.
 */
export const API_FUNCTION_OPTIONS: HttpsOptions = {
  region: 'us-central1',
  maxInstances: 10,
  memory: '512MiB',
  // Above the 60 s default: notifying a large class sends its emails
  // within the request, a few at a time (NotificationsService). Hosting
  // still answers the browser 504 after 60 s; this lets the function
  // finish sending, and the editor reads that 504 as "still sending".
  // ponytail: move the send to a task queue if classes outgrow ~3,000.
  timeoutSeconds: 300,
  secrets: ['SMTP_PASS'],
};
