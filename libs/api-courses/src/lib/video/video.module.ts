import { forwardRef, Module } from '@nestjs/common';
import { TranscoderServiceClient } from '@google-cloud/video-transcoder';
import { OAuth2Client } from 'google-auth-library';

import { AuthModule } from '@learnwren/api-auth';
import { FirebaseAdminModule } from '@learnwren/api-firebase';

import { CoursesModule } from '../courses.module';
import { CaptionsController } from './captions/captions.controller';
import { CaptionsService } from './captions/captions.service';
import { EnrollmentOrOwnerGuard } from './playback/enrollment-or-owner.guard';
import { KeyService } from './playback/key.service';
import { ManifestService } from './playback/manifest.service';
import { PlaybackConfigController } from './playback/playback-config.controller';
import { PlaybackController } from './playback/playback.controller';
import { FakeTranscoderAdapter } from './transcoder/fake-transcoder.adapter';
import { FfmpegEventBridge } from './transcoder/ffmpeg-event.bridge';
import { FfmpegTranscoderAdapter, spawnRunner } from './transcoder/ffmpeg-transcoder.adapter';
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

function binaryPath(pkg: string, fallback: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require(pkg) as { path: string }).path;
  } catch {
    return fallback;
  }
}

function makeTranscoder(cfg: VideoConfig, storage: VideoStorageAdapter): VideoTranscoder {
  if (cfg.transcoderImpl === 'fake') return new FakeTranscoderAdapter();
  if (cfg.transcoderImpl === 'ffmpeg') {
    return new FfmpegTranscoderAdapter({
      storage,
      runner: spawnRunner,
      ffmpegPath: binaryPath('@ffmpeg-installer/ffmpeg', 'ffmpeg'),
      ffprobePath: binaryPath('@ffprobe-installer/ffprobe', 'ffprobe'),
    });
  }
  return new GcpTranscoderAdapter({
    client: new TranscoderServiceClient() as unknown as TranscoderClient,
    projectId: cfg.gcpProjectId!,
    location: cfg.transcoderLocation!,
  });
}

// The fake transcoder webhook is gated behind FirebaseSessionGuard (any valid
// session cookie) AND two env-var guards: NODE_ENV !== 'production' AND the
// explicit fake transcoder flag. Both guards are required — a staging/preview
// deploy that forgets to set NODE_ENV would otherwise inherit the .env.tpl
// default and expose the endpoint.
const fakeTranscoderEnabled =
  process.env['NODE_ENV'] !== 'production' &&
  (process.env['LEARNWREN_VIDEO_TRANSCODER'] ?? '') === 'fake';
if (
  process.env['NODE_ENV'] === 'production' &&
  (process.env['LEARNWREN_VIDEO_TRANSCODER'] ?? '') === 'fake'
) {
  throw new Error(
    'Refusing to start: LEARNWREN_VIDEO_TRANSCODER=fake is incompatible with NODE_ENV=production',
  );
}
const controllers = [
  VideoController,
  CaptionsController,
  TranscoderEventsController,
  PlaybackController,
  PlaybackConfigController,
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
    CaptionsService,
    VideoStorageAdapter,
    VideoOwnerGuard,
    VideoExceptionFilter,
    PubSubPushGuard,
    { provide: VIDEO_CONFIG, useFactory: () => readVideoConfigFromEnv(process.env) },
    {
      provide: VIDEO_TRANSCODER,
      inject: [VIDEO_CONFIG, VideoStorageAdapter],
      useFactory: (cfg: VideoConfig, storage: VideoStorageAdapter) => makeTranscoder(cfg, storage),
    },
    FfmpegEventBridge,
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
  exports: [VideoRepository, VideoService, CaptionsService],
})
export class VideoModule {}
