import { Controller, Get, Inject } from '@nestjs/common';

import type { PlaybackConfig } from '@learnwren/shared-data-models';

import { VIDEO_CONFIG, type VideoConfig } from '../video.config';

/**
 * Public endpoint exposing whether playback runs in the in-memory fake seam.
 * Intentionally unauthenticated: it reveals only the server's playback-storage
 * mode (always `false` in production), which is not sensitive, and the web app
 * fetches it once at bootstrap — before the user has necessarily signed in — to
 * decide whether the player should mount hls.js or show a dev placeholder.
 */
@Controller('playback')
export class PlaybackConfigController {
  constructor(@Inject(VIDEO_CONFIG) private readonly cfg: VideoConfig) {}

  @Get('config')
  config(): PlaybackConfig {
    return { fakePlayback: this.cfg.playbackStorageImpl === 'fake' };
  }
}
