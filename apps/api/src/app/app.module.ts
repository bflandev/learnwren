import { Module, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { FirebaseAdminModule } from '@learnwren/api-firebase';
import { AuthModule } from '@learnwren/api-auth';
import { CoursesModule, VideoModule } from '@learnwren/api-courses';
import { ProfileModule } from '@learnwren/api-profile';

import { AppController } from './app.controller';
import { resolveThrottleTiers } from './throttle.config';

@Module({
  imports: [
    FirebaseAdminModule.forRoot(),
    // Per-IP rate limit. Two tiers: a burst limit (100 / 10s) catches scraping
    // and a sustained limit (1000 / minute) bounds amplification of expensive
    // routes like /api/catalog. The throttler hashes req.ip — main.ts sets
    // `trust proxy = 1` so Express resolves the real client IP from
    // X-Forwarded-For (the platform does NOT configure this automatically).
    // NOTE: the store is in-memory and therefore PER-INSTANCE. With the gen2
    // function's maxInstances:10 there is no cross-instance coordination, so a
    // distributed burst can reach up to ~10x these limits. That is acceptable
    // here — this is an amplification/scraping guard, not a hard quota; a strict
    // global limit would need a shared store (e.g. Redis via ThrottlerStorage).
    // Limits are env-overridable (LEARNWREN_THROTTLE_{BURST,SUSTAINED}_LIMIT)
    // for e2e runs where all parallel workers share one IP.
    ThrottlerModule.forRoot(resolveThrottleTiers(process.env)),
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
