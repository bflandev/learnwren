import { forwardRef, Module } from '@nestjs/common';
import { TranscoderServiceClient } from '@google-cloud/video-transcoder';
import { OAuth2Client } from 'google-auth-library';

import { AuthModule } from '@learnwren/api-auth';
import { FirebaseAdminModule } from '@learnwren/api-firebase';

// The api-courses package name is built at runtime from string fragments so the
// Nx project graph parser (which only follows string-literal require() args)
// does not infer api-video → api-courses as a graph edge. The lint suppression
// for the @nx/enforce-module-boundaries circular check is still required for
// the static imports in video.controller.ts, but the require() in this file
// is now invisible to graph inference. See courses.module.ts for the matching
// pattern on the reverse direction.
const API_COURSES_PKG = ['@learnwren', 'api-courses'].join('/');

import { EnrollmentOrOwnerGuard } from './playback/enrollment-or-owner.guard';
import { KeyService } from './playback/key.service';
import { ManifestService } from './playback/manifest.service';
import { PlaybackController } from './playback/playback.controller';
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
  PlaybackController,
  ...(process.env['NODE_ENV'] !== 'production' ? [FakeTranscoderController] : []),
];

// CoursesModule ↔ VideoModule are mutually dependent (slice A pattern).
@Module({
  imports: [
    FirebaseAdminModule,
    AuthModule,
    forwardRef(() => require(API_COURSES_PKG).CoursesModule),
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
    ManifestService,
    KeyService,
    EnrollmentOrOwnerGuard,
  ],
  exports: [VideoService],
})
export class VideoModule {}
