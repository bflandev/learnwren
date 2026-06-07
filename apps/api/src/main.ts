import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
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

async function bootstrap() {
  assertProdSafeEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
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
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env['PORT'] || 3333;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
