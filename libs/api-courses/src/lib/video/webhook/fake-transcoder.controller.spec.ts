import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { Video, VideoId } from '@learnwren/shared-data-models';

import { FakeTranscoderController } from './fake-transcoder.controller';

function build(video: Partial<Video> | null = { transcoderJobName: 'fake-job-v1-1-0' }) {
  const eventsController = { handle: vi.fn(async () => undefined) };
  const videos = { getVideo: vi.fn(async () => video as Video | null) };
  const c = new FakeTranscoderController(eventsController as never, videos as never);
  return { c, eventsController, videos };
}

function res() {
  return {
    statusCode: 0,
    body: undefined as unknown,
    status: vi.fn(function (this: ReturnType<typeof res>, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(function (this: ReturnType<typeof res>, b: unknown) {
      this.body = b;
      return this;
    }),
    send: vi.fn(function (this: ReturnType<typeof res>) {
      return this;
    }),
  };
}

function decodeEnvelope(eventsController: { handle: ReturnType<typeof vi.fn> }) {
  const envelope = eventsController.handle.mock.calls[0]![0] as { message: { data: string } };
  return JSON.parse(Buffer.from(envelope.message.data, 'base64').toString());
}

describe('FakeTranscoderController', () => {
  it('complete: builds a SUCCEEDED Pub/Sub envelope and delegates to the real handler', async () => {
    const { c, eventsController } = build();
    await c.complete('v1' as VideoId, res() as never);
    expect(eventsController.handle).toHaveBeenCalledTimes(1);
    const decoded = decodeEnvelope(eventsController);
    expect(decoded.job.state).toBe('SUCCEEDED');
    expect(decoded.job.labels.videoid).toBe('v1');
  });

  it('complete: uses the stored transcoderJobName so JOB_NAME_MISMATCH never trips', async () => {
    const { c, eventsController } = build({ transcoderJobName: 'fake-job-v1-1779-42' });
    await c.complete('v1' as VideoId, res() as never);
    const decoded = decodeEnvelope(eventsController);
    expect(decoded.job.name).toBe('fake-job-v1-1779-42');
  });

  it('fail: builds a FAILED envelope and passes the reason', async () => {
    const { c, eventsController } = build();
    await c.fail('v1' as VideoId, { reason: 'codec failure' }, res() as never);
    const decoded = decodeEnvelope(eventsController);
    expect(decoded.job.state).toBe('FAILED');
    expect(decoded.job.error.message).toBe('codec failure');
  });

  it('fail: uses the stored transcoderJobName', async () => {
    const { c, eventsController } = build({ transcoderJobName: 'fake-job-v1-99-7' });
    await c.fail('v1' as VideoId, {}, res() as never);
    const decoded = decodeEnvelope(eventsController);
    expect(decoded.job.name).toBe('fake-job-v1-99-7');
  });

  it('fail: uses a default reason when none is provided', async () => {
    const { c, eventsController } = build();
    await c.fail('v1' as VideoId, {}, res() as never);
    const decoded = decodeEnvelope(eventsController);
    expect(decoded.job.error.message).toBe('fake-transcoder synthetic failure');
  });

  it('complete: forwards a placeholder name when the video does not exist (real handler returns VIDEO_NOT_FOUND)', async () => {
    const { c, eventsController } = build(null);
    await c.complete('v1' as VideoId, res() as never);
    expect(eventsController.handle).toHaveBeenCalledTimes(1);
    const decoded = decodeEnvelope(eventsController);
    expect(decoded.job.name).toBe('fake-job-unknown');
  });

  it('complete: 404s when the video has no transcoderJobName yet', async () => {
    const { c } = build({ transcoderJobName: undefined });
    await expect(c.complete('v1' as VideoId, res() as never)).rejects.toBeInstanceOf(NotFoundException);
  });
});
