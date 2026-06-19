import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';

import { AppModule } from './app/app.module';

function assertProdSafeEnv(): void {
  if (process.env['NODE_ENV'] !== 'production') return;
  if (process.env['LEARNWREN_TEST_OUTBOX_ENABLED'] === '1') {
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
function readAllowedOrigins(): string[] {
  const raw = process.env['LEARNWREN_CORS_ORIGINS'];
  if (raw && raw.trim().length > 0) {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (process.env['NODE_ENV'] === 'production') {
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
function configureApp(app: NestExpressApplication): void {
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  // Trust exactly one proxy hop so Express resolves the real client IP from the
  // X-Forwarded-For header injected by Firebase Hosting / Cloud Functions —
  // without this the per-IP ThrottlerGuard keys every request on the proxy's
  // address and collapses all clients into one bucket. A numeric hop count
  // (not `true`) prevents spoofing via an attacker-chained X-Forwarded-For.
  app.set('trust proxy', 1);
  app.enableCors({
    origin: readAllowedOrigins(),
    credentials: true,
  });
  app.setGlobalPrefix('api');
}

// ---------------------------------------------------------------------------
// Cloud Functions mode: detected when the Functions runtime env vars are set.
// We export a named `api` HTTPS function. Nest is initialised lazily and the
// initialisation PROMISE is memoized so concurrent cold-start requests share
// a single init rather than spawning duplicate Nest instances (TOCTOU-safe:
// the Promise is stored before awaiting, so the second caller gets the same
// Promise, not a second NestFactory.create call).
//
// Detection strategy:
//   - `K_SERVICE` — set by real Cloud Functions (gen1 and gen2) at cold start.
//   - `FUNCTIONS_EMULATOR` — set unconditionally by the firebase-tools EMULATOR
//     during function discovery AND per-request serving.
//   - `FUNCTIONS_CONTROL_API` — set by `firebase deploy`'s function-discovery
//     step (firebase-tools runs the `firebase-functions` binary over the bundle
//     with this flag to enumerate exports). Neither K_SERVICE nor
//     FUNCTIONS_EMULATOR is set in that context, so without this branch the
//     bundle falls into listen mode, never sets `module.exports.api`, and the
//     deploy ships zero functions (the listen also collides with the discovery
//     harness's port → EADDRINUSE). `FUNCTION_TARGET` is NOT set during
//     discovery, so it cannot be used for detection.
// ---------------------------------------------------------------------------
const isFunctionsRuntime =
  Boolean(process.env['K_SERVICE']) ||
  Boolean(process.env['FUNCTIONS_EMULATOR']) ||
  Boolean(process.env['FUNCTIONS_CONTROL_API']);

if (isFunctionsRuntime) {
  // Dynamic require keeps firebase-functions out of the hot-path in listen
  // mode and avoids top-level await (webpack emits CJS, not ESM).
  const { onRequest } = (require('firebase-functions/v2/https') as typeof import('firebase-functions/v2/https'));

  const expressApp = express();
  let nestInitPromise: Promise<void> | undefined;

  function ensureNestInitialized(): Promise<void> {
    // Memoize the Promise — not a boolean flag — so concurrent first requests
    // all await the same initialisation work without racing.
    if (!nestInitPromise) {
      nestInitPromise = (async () => {
        assertProdSafeEnv();
        // Pass { bodyParser: false } so NestJS does not call
        // registerParserMiddleware, which accesses the deprecated Express 4
        // `app.router` getter and throws in Express >=4.20.
        const adapter = new ExpressAdapter(expressApp);
        const app = await NestFactory.create<NestExpressApplication>(
          AppModule,
          adapter,
          { bodyParser: false },
        );
        // configureApp registers express.json itself (via app.use, which
        // proxies to the adapter without touching the deprecated app.router
        // path that { bodyParser: false } exists to avoid).
        configureApp(app);
        await app.init();
      })().catch((err) => {
        // A rejected init must NOT stay memoised. Clearing the promise lets the
        // next request retry a fresh cold init instead of re-awaiting the cached
        // rejection for the lifetime of this warm instance — otherwise a single
        // transient cold-start failure (Secret Manager/Firestore hiccup, OOM
        // while loading sharp/ffprobe at the memory cap) would black-hole every
        // subsequent /api/** request to this instance until the platform evicts
        // it (Cloud Run does not health-check a 500-returning warm instance, and
        // the Hosting rewrite does not retry a 5xx against another instance).
        nestInitPromise = undefined;
        throw err;
      });
    }
    return nestInitPromise;
  }

  // Export the Cloud Function named 'api'. Firebase Hosting rewrites /api/**
  // to this function. Region + maxInstances provide a cost guard. memory is
  // raised from the 256 MiB v2 default — a NestJS monolith bundling
  // firebase-admin, sharp, nodemailer and ffprobe at the default concurrency
  // (80) is undersized at 256 MiB. SMTP_PASS binds from Cloud Secret Manager
  // (`firebase functions:secrets:set SMTP_PASS`) and surfaces as
  // process.env.SMTP_PASS at runtime; rotation requires a redeploy.
  //
  // Use module.exports (not exports) — webpack bundles the entry in an IIFE
  // where `exports` is the closure-local object, not the Node.js module.exports.
  // The functions emulator discovers exports via require(bundlePath).api.
  module.exports.api = onRequest(
    {
      region: 'us-central1',
      maxInstances: 10,
      memory: '512MiB',
      secrets: ['SMTP_PASS'],
    },
    async (req, res) => {
      await ensureNestInitialized();
      expressApp(req, res);
    },
  );
} else {
  // ---------------------------------------------------------------------------
  // Listen mode (default): local dev, pnpm start, api-e2e Playwright webServer.
  // Behavior is identical to the original main.ts: same port env var, same log.
  // NestFactory.create without an explicit adapter creates its own express app
  // and handles body-parsing internally — no app.router access issue.
  // ---------------------------------------------------------------------------
  async function bootstrap() {
    assertProdSafeEnv();
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    configureApp(app);
    const port = process.env['PORT'] || 3333;
    await app.listen(port);
    Logger.log(
      `Application is running on: http://localhost:${port}/api`,
    );
  }

  bootstrap().catch((err) => {
    // Listen mode only (local dev / api-e2e). Without this an init failure
    // becomes an unhandled rejection that exits opaquely; log it through the
    // Nest logger and exit non-zero so CI/dev sees the real cause.
    Logger.error('Fatal error during bootstrap', err);
    process.exit(1);
  });
}
