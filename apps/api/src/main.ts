import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';

import { AppModule } from './app/app.module';
import {
  API_FUNCTION_OPTIONS,
  assertProdSafeEnv,
  configureApp,
  isFunctionsRuntime,
  memoizeRetryableInit,
} from './app/app-setup';

// Thin bootstrap: picks a mode and wires in the pure config from app-setup.ts
// (unit-tested there). Importing this file starts the server, so it has no spec.

if (isFunctionsRuntime()) {
  // ---------------------------------------------------------------------------
  // Cloud Functions mode: export a named `api` HTTPS function. Nest is
  // initialised lazily, once, shared by concurrent cold-start requests and
  // retried after a failed init (see memoizeRetryableInit).
  // ---------------------------------------------------------------------------
  // Dynamic require keeps firebase-functions out of the hot-path in listen
  // mode and avoids top-level await (webpack emits CJS, not ESM).
  const { onRequest } = (require('firebase-functions/v2/https') as typeof import('firebase-functions/v2/https'));

  const expressApp = express();

  const ensureNestInitialized = memoizeRetryableInit(async () => {
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
  });

  // Use module.exports (not exports) — webpack bundles the entry in an IIFE
  // where `exports` is the closure-local object, not the Node.js module.exports.
  // The functions emulator discovers exports via require(bundlePath).api.
  module.exports.api = onRequest(API_FUNCTION_OPTIONS, async (req, res) => {
    await ensureNestInitialized();
    expressApp(req, res);
  });
} else {
  // ---------------------------------------------------------------------------
  // Listen mode (default): local dev, pnpm start, api-e2e Playwright webServer.
  // NestFactory.create without an explicit adapter creates its own express app
  // and handles body-parsing internally — no app.router access issue.
  // ---------------------------------------------------------------------------
  async function bootstrap() {
    assertProdSafeEnv();
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    configureApp(app);
    // Without this, Nest never calls onApplicationShutdown on SIGTERM/SIGINT,
    // so PostgresDocumentStore never closes its pool on restart/redeploy.
    app.enableShutdownHooks();
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
