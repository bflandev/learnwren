import { Body, Controller, NotFoundException, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';

import type { VideoId } from '@learnwren/shared-data-models';

import { VideoRepository } from '../video.repository';
import { TranscoderEventsController } from './transcoder-events.controller';

interface FakeFailBody {
  reason?: string;
}

function envelope(payload: object): {
  message: { data: string; messageId: string; publishTime: string };
  subscription: string;
} {
  return {
    message: {
      data: Buffer.from(JSON.stringify(payload)).toString('base64'),
      messageId: `fake-${Date.now()}`,
      publishTime: new Date().toISOString(),
    },
    subscription: 'fake-subscription',
  };
}

@Controller('internal/fake-transcoder')
export class FakeTranscoderController {
  constructor(
    private readonly real: TranscoderEventsController,
    // The real webhook path (Pub/Sub → TranscoderEventsController) reaches the
    // repository's JOB_NAME_MISMATCH guard, so the envelope's job.name has to
    // match the value the adapter persisted on submit. Synthesising a name
    // from the videoId silently turns every "complete" into a no-op (200) and
    // the test/dev round-trip stops at TRANSCODING. Look up the stored value.
    private readonly videos: VideoRepository,
  ) {}

  @Post('complete/:vid')
  async complete(@Param('vid') vid: VideoId, @Res() res: Response): Promise<void> {
    const jobName = await this.resolveJobName(vid);
    const env = envelope({
      job: {
        name: jobName,
        state: 'SUCCEEDED',
        labels: { videoid: vid },
        output: { uri: `gs://fake-out/videos/${vid}/hls/` },
      },
      eventTime: new Date().toISOString(),
    });
    await this.real.handle(env, res);
  }

  @Post('fail/:vid')
  async fail(
    @Param('vid') vid: VideoId,
    @Body() body: FakeFailBody,
    @Res() res: Response,
  ): Promise<void> {
    const jobName = await this.resolveJobName(vid);
    const env = envelope({
      job: {
        name: jobName,
        state: 'FAILED',
        labels: { videoid: vid },
        error: { code: 13, message: body.reason ?? 'fake-transcoder synthetic failure' },
      },
      eventTime: new Date().toISOString(),
    });
    await this.real.handle(env, res);
  }

  private async resolveJobName(vid: VideoId): Promise<string> {
    const v = await this.videos.getVideo(vid);
    if (!v?.transcoderJobName) throw new NotFoundException();
    return v.transcoderJobName;
  }
}
