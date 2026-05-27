import { Module, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { FirebaseAdminModule } from '@learnwren/api-firebase';
import { AuthModule } from '@learnwren/api-auth';
import { CoursesModule, VideoModule } from '@learnwren/api-courses';
import { ProfileModule } from '@learnwren/api-profile';

import { AppController } from './app.controller';

@Module({
  imports: [
    FirebaseAdminModule.forRoot(),
    // Per-IP rate limit. Two tiers: a burst limit (100 / 10s) catches scraping
    // and a sustained limit (1000 / minute) bounds amplification of expensive
    // routes like /api/catalog. The throttler hashes the IP — proxy headers
    // are honoured because trust-proxy is set by Cloud Functions / Hosting.
    ThrottlerModule.forRoot([
      { name: 'burst', ttl: 10_000, limit: 100 },
      { name: 'sustained', ttl: 60_000, limit: 1000 },
    ]),
    AuthModule,
    CoursesModule,
    VideoModule,
    ProfileModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
  ],
})
export class AppModule {}
