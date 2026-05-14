import { describe, expect, it, vi } from 'vitest';

import type { VideoId } from '@learnwren/shared-data-models';

import { FakeTranscoderController } from './fake-transcoder.controller';

function build() {
  const eventsController = { handle: vi.fn(async () => undefined) };
  const c = new FakeTranscoderController(eventsController as never);
  return { c, eventsController };
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

describe('FakeTranscoderController', () => {
  it('complete: builds a SUCCEEDED Pub/Sub envelope and delegates to the real handler', async () => {
    const { c, eventsController } = build();
    const r = res();
    await c.complete('v1' as VideoId, r as never);
    expect(eventsController.handle).toHaveBeenCalledTimes(1);
    const envelope = eventsController.handle.mock.calls[0]![0] as { message: { data: string } };
    const decoded = JSON.parse(Buffer.from(envelope.message.data, 'base64').toString());
    expect(decoded.job.state).toBe('SUCCEEDED');
    expect(decoded.job.labels.videoid).toBe('v1');
  });

  it('fail: builds a FAILED envelope and passes the reason', async () => {
    const { c, eventsController } = build();
    const r = res();
    await c.fail('v1' as VideoId, { reason: 'codec failure' }, r as never);
    const envelope = eventsController.handle.mock.calls[0]![0] as { message: { data: string } };
    const decoded = JSON.parse(Buffer.from(envelope.message.data, 'base64').toString());
    expect(decoded.job.state).toBe('FAILED');
    expect(decoded.job.error.message).toBe('codec failure');
  });

  it('fail: uses a default reason when none is provided', async () => {
    const { c, eventsController } = build();
    const r = res();
    await c.fail('v1' as VideoId, {}, r as never);
    const envelope = eventsController.handle.mock.calls[0]![0] as { message: { data: string } };
    const decoded = JSON.parse(Buffer.from(envelope.message.data, 'base64').toString());
    expect(decoded.job.error.message).toBe('fake-transcoder synthetic failure');
  });
});
