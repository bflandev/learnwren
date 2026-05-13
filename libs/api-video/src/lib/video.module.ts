import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '@learnwren/api-auth';
import { CoursesModule } from '@learnwren/api-courses';
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
@Module({
  imports: [FirebaseAdminModule, AuthModule, forwardRef(() => CoursesModule)],
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
