import { Body, Controller, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';

import type { VideoId } from '@learnwren/shared-data-models';

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
  constructor(private readonly real: TranscoderEventsController) {}

  @Post('complete/:vid')
  async complete(@Param('vid') vid: VideoId, @Res() res: Response): Promise<void> {
    const env = envelope({
      job: {
        name: `projects/fake/locations/fake/jobs/${vid}`,
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
    const env = envelope({
      job: {
        name: `projects/fake/locations/fake/jobs/${vid}`,
        state: 'FAILED',
        labels: { videoid: vid },
        error: { code: 13, message: body.reason ?? 'fake-transcoder synthetic failure' },
      },
      eventTime: new Date().toISOString(),
    });
    await this.real.handle(env, res);
  }
}
