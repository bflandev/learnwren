import { forwardRef, Module } from '@nestjs/common';
import { TranscoderServiceClient } from '@google-cloud/video-transcoder';
import { OAuth2Client } from 'google-auth-library';

import { AuthModule } from '@learnwren/api-auth';
import { FirebaseAdminModule } from '@learnwren/api-firebase';

import { CoursesModule } from '../courses.module';
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

// Gate the fake webhook controller by the transcoder *implementation*, not by
// NODE_ENV. A staging/preview deploy with NODE_ENV unset but a real GCP
// transcoder must not expose an unauthenticated endpoint that promotes any
// video to READY with attacker-controlled output paths.
const fakeTranscoderEnabled =
  (process.env['LEARNWREN_VIDEO_TRANSCODER'] ?? '') === 'fake';
const controllers = [
  VideoController,
  TranscoderEventsController,
  PlaybackController,
  ...(fakeTranscoderEnabled ? [FakeTranscoderController] : []),
];

// CoursesModule ↔ VideoModule are mutually dependent (slice A pattern).
@Module({
  imports: [
    FirebaseAdminModule,
    AuthModule,
    forwardRef(() => CoursesModule),
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
    // Also registered as a provider (not only a controller) so the dev-only
    // FakeTranscoderController can inject it and delegate to the real webhook
    // handler. Nest does not expose controllers through the DI container.
    TranscoderEventsController,
  ],
  exports: [VideoService],
})
export class VideoModule {}
