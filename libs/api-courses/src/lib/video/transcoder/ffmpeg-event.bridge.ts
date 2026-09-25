import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';

import { VideoService } from '../video.service';
import { FfmpegTranscoderAdapter } from './ffmpeg-transcoder.adapter';
import { VIDEO_TRANSCODER, type VideoTranscoder } from './transcoder.port';

/**
 * Hands the ffmpeg adapter its completion sink after DI has settled.
 * VideoService depends on VIDEO_TRANSCODER, so the adapter cannot take the
 * service in its constructor without a cycle; a post-init hook breaks it.
 */
@Injectable()
export class FfmpegEventBridge implements OnModuleInit {
  constructor(
    @Inject(VIDEO_TRANSCODER) private readonly transcoder: VideoTranscoder,
    private readonly svc: VideoService,
  ) {}

  onModuleInit(): void {
    if (!(this.transcoder instanceof FfmpegTranscoderAdapter)) return;
    this.transcoder.setSink((event) => this.svc.handleTranscoderEvent(event));
  }
}
