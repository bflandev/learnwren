import { Body, Controller, Inject, Logger, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { VIDEO_TRANSCODER, type VideoTranscoder } from '../transcoder/transcoder.port';
import { VideoService } from '../video.service';
import { PubSubPushGuard } from './pubsub-push.guard';

@Controller('internal/transcoder-events')
@UseGuards(PubSubPushGuard)
export class TranscoderEventsController {
  private readonly logger = new Logger('TranscoderEventsController');

  constructor(
    @Inject(VIDEO_TRANSCODER) private readonly transcoder: VideoTranscoder,
    private readonly svc: VideoService,
  ) {}

  @Post()
  async handle(@Body() body: unknown, @Res() res: Response): Promise<void> {
    let event;
    try {
      event = await this.transcoder.parseEvent(body);
    } catch (err) {
      this.logger.error(`Discarding malformed event: ${(err as Error).message}`);
      res.status(200).json({ acked: true, reason: 'MALFORMED' });
      return;
    }

    try {
      const outcome = await this.svc.handleTranscoderEvent(event);
      if (outcome.acted) {
        res.status(204).send();
        return;
      }
      this.logger.log(
        `No-op for videoId=${event.videoId} jobName=${event.jobName}: ${outcome.reason}`,
      );
      res.status(200).json({ acked: true, reason: outcome.reason });
    } catch (err) {
      this.logger.error(`Transient failure: ${(err as Error).message}`);
      res.status(500).send();
    }
  }
}
