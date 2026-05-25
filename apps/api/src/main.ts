import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

import { AppModule } from './app/app.module';

function assertProdSafeEnv(): void {
  if (process.env['NODE_ENV'] !== 'production') return;
  if (process.env['LEARNWREN_TEST_OUTBOX_ENABLED'] === '1') {
    throw new Error(
      'Refusing to start: LEARNWREN_TEST_OUTBOX_ENABLED=1 is incompatible with NODE_ENV=production',
    );
  }
}

async function bootstrap() {
  assertProdSafeEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(cookieParser());
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env['PORT'] || 3333;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
