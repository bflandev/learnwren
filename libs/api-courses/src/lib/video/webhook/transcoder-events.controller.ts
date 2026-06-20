import { Body, Controller, Inject, Logger, Post, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { VIDEO_TRANSCODER, type VideoTranscoder } from '../transcoder/transcoder.port';
import { VideoExceptionFilter } from '../video.exception-filter';
import { VideoService } from '../video.service';
import { PubSubPushGuard } from './pubsub-push.guard';

// Without this filter a PubSubPushGuard rejection (PubSubInvalidToken/WrongAudience/
// WrongInvoker — all VideoExceptions, not HttpExceptions) escapes to Nest's default
// handler as a 500 instead of its declared 401/403. The sibling video controllers
// already carry the same filter.
@Controller('internal/transcoder-events')
@UseFilters(VideoExceptionFilter)
@UseGuards(PubSubPushGuard)
export class TranscoderEventsController {
  // Stryker disable next-line StringLiteral: Logger category label — log-only, no observable behavior
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
      // Stryker disable next-line StringLiteral: diagnostic log message — observable ack body asserted separately
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
        // Stryker disable next-line StringLiteral: diagnostic log message — observable ack body (200 + {acked,reason}) asserted separately
        `No-op for videoId=${event.videoId} jobName=${event.jobName}: ${outcome.reason}`,
      );
      res.status(200).json({ acked: true, reason: outcome.reason });
    } catch (err) {
      // Stryker disable next-line StringLiteral: diagnostic log message — observable 500 status asserted separately
      this.logger.error(`Transient failure: ${(err as Error).message}`);
      res.status(500).send();
    }
  }
}
