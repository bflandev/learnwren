import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '@learnwren/api-auth';
import { FirebaseAdminModule } from '@learnwren/api-firebase';

import { VIDEO_CONFIG, readVideoConfigFromEnv } from './video.config';
import { VideoController } from './video.controller';
import { VideoExceptionFilter } from './video.exception-filter';
import { VideoOwnerGuard } from './video-owner.guard';
import { VideoRepository } from './video.repository';
import { VideoService } from './video.service';
import { VideoStorageAdapter } from './video-storage.adapter';

// CoursesModule ↔ VideoModule are mutually dependent:
//   VideoController injects CoursesRepository from CoursesModule.
//   CoursesService injects VideoService from VideoModule (cascade delete).
// NestJS resolves the cycle at runtime via forwardRef.
// Lazy require() inside forwardRef breaks the CommonJS circular-import problem.
@Module({
  // nx-ignore-next-line
  // eslint-disable-next-line @nx/enforce-module-boundaries -- intentional circular: api-video ↔ api-courses (NestJS forwardRef cascade delete)
  imports: [FirebaseAdminModule, AuthModule, forwardRef(() => require('@learnwren/api-courses').CoursesModule)],
  controllers: [VideoController],
  providers: [
    VideoRepository,
    VideoService,
    VideoStorageAdapter,
    VideoOwnerGuard,
    VideoExceptionFilter,
    { provide: VIDEO_CONFIG, useFactory: () => readVideoConfigFromEnv(process.env) },
  ],
  exports: [VideoService],
})
export class VideoModule {}
