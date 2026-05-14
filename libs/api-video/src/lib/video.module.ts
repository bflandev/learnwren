import { forwardRef, Module } from '@nestjs/common';
import { TranscoderServiceClient } from '@google-cloud/video-transcoder';
import { OAuth2Client } from 'google-auth-library';

import { AuthModule } from '@learnwren/api-auth';
import { FirebaseAdminModule } from '@learnwren/api-firebase';

import { FakeTranscoderAdapter } from './transcoder/fake-transcoder.adapter';
import {
  GcpTranscoderAdapter,
  type TranscoderClient,
} from './transcoder/gcp-transcoder.adapter';
import { VIDEO_TRANSCODER, type VideoTranscoder } from './transcoder/transcoder.port';
import { VIDEO_CONFIG, readVideoConfigFromEnv, type VideoConfig } from './video.config';
import { VideoController } from './video.controller';
import { VideoExceptionFilter } from './video.exception-filter';
import { VideoOwnerGuard } from './video-owner.guard';
import { VideoRepository } from './video.repository';
import { VideoService } from './video.service';
import { VideoStorageAdapter } from './video-storage.adapter';
import { FakeTranscoderController } from './webhook/fake-transcoder.controller';
import { ID_TOKEN_VERIFIER, PubSubPushGuard } from './webhook/pubsub-push.guard';
import { TranscoderEventsController } from './webhook/transcoder-events.controller';

function makeTranscoder(cfg: VideoConfig): VideoTranscoder {
  if (cfg.transcoderImpl === 'fake') return new FakeTranscoderAdapter();
  return new GcpTranscoderAdapter({
    client: new TranscoderServiceClient() as unknown as TranscoderClient,
    projectId: cfg.gcpProjectId!,
    location: cfg.transcoderLocation!,
  });
}

const controllers = [
  VideoController,
  TranscoderEventsController,
  ...(process.env['NODE_ENV'] !== 'production' ? [FakeTranscoderController] : []),
];

// CoursesModule ↔ VideoModule are mutually dependent (slice A pattern).
@Module({
  // nx-ignore-next-line
  // eslint-disable-next-line @nx/enforce-module-boundaries -- intentional circular: api-video ↔ api-courses (NestJS forwardRef cascade delete)
  imports: [
    FirebaseAdminModule,
    AuthModule,
    forwardRef(() => require('@learnwren/api-courses').CoursesModule),
  ],
  controllers,
  providers: [
    VideoRepository,
    VideoService,
    VideoStorageAdapter,
    VideoOwnerGuard,
    VideoExceptionFilter,
    PubSubPushGuard,
    { provide: VIDEO_CONFIG, useFactory: () => readVideoConfigFromEnv(process.env) },
    {
      provide: VIDEO_TRANSCODER,
      inject: [VIDEO_CONFIG],
      useFactory: (cfg: VideoConfig) => makeTranscoder(cfg),
    },
    {
      provide: ID_TOKEN_VERIFIER,
      useFactory: () => new OAuth2Client(),
    },
  ],
  exports: [VideoService],
})
export class VideoModule {}
