import { describe, expect, it, vi } from 'vitest';

import type { VideoId } from '@learnwren/shared-data-models';

import {
  TranscoderEventLookupError,
  type TranscoderEvent,
  type VideoTranscoder,
} from '../transcoder/transcoder.port';
import { TranscoderEventsController } from './transcoder-events.controller';

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status: vi.fn(function (this: typeof res, c: number) {
      this.statusCode = c;
      return this;
    }),
    json: vi.fn(function (this: typeof res, b: unknown) {
      this.body = b;
      return this;
    }),
    send: vi.fn(function (this: typeof res) {
      return this;
    }),
  };
  return res;
}

function controller(
  transcoder: Partial<VideoTranscoder>,
  service: { handleTranscoderEvent: ReturnType<typeof vi.fn> },
) {
  return new TranscoderEventsController(transcoder as never, service as never);
}

const successEvent: TranscoderEvent = {
  type: 'JOB_SUCCEEDED',
  jobName: 'jobs/abc',
  videoId: 'v1' as VideoId,
  manifestPath: 'videos/v1/hls/manifest.m3u8',
  durationSec: 60,
};

describe('TranscoderEventsController.handle', () => {
  it('returns 204 when service.acted=true', async () => {
    const transcoder = { parseEvent: vi.fn(async () => successEvent) };
    const service = { handleTranscoderEvent: vi.fn(async () => ({ acted: true })) };
    const c = controller(transcoder, service);
    const res = makeRes();
    await c.handle({}, res as never);
    expect(res.statusCode).toBe(204);
  });

  it('returns 200 with structured log payload on ALREADY_APPLIED', async () => {
    const transcoder = { parseEvent: vi.fn(async () => successEvent) };
    const service = {
      handleTranscoderEvent: vi.fn(async () => ({ acted: false, reason: 'ALREADY_APPLIED' })),
    };
    const res = makeRes();
    await controller(transcoder, service).handle({}, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ acked: true, reason: 'ALREADY_APPLIED' });
  });

  it.each(['VIDEO_NOT_FOUND', 'JOB_NAME_MISMATCH', 'WRONG_STATE'] as const)(
    'returns 200 when reason is %s',
    async (reason) => {
      const transcoder = { parseEvent: vi.fn(async () => successEvent) };
      const service = { handleTranscoderEvent: vi.fn(async () => ({ acted: false, reason })) };
      const res = makeRes();
      await controller(transcoder, service).handle({}, res as never);
      expect(res.statusCode).toBe(200);
    },
  );

  it('returns 200 when payload cannot be parsed (poison-pill drop)', async () => {
    const transcoder = {
      parseEvent: vi.fn(async () => {
        throw new Error('missing videoid');
      }),
    };
    const service = { handleTranscoderEvent: vi.fn() };
    const res = makeRes();
    await controller(transcoder, service).handle({}, res as never);
    expect(res.statusCode).toBe(200);
    // Pin the full body — the `reason: 'MALFORMED'` discriminator is what lets
    // the dead-letter side tell a poison-pill drop apart from a no-op ack.
    expect(res.body).toEqual({ acked: true, reason: 'MALFORMED' });
    expect(service.handleTranscoderEvent).not.toHaveBeenCalled();
  });

  it('returns 500 (not MALFORMED ack) when parseEvent fails with a lookup I/O error', async () => {
    // A transient getJob failure must NOT be acked as MALFORMED — that would
    // permanently drop the success notification (video stuck TRANSCODING, no
    // reconciler exists). 500 makes Pub/Sub redeliver.
    const transcoder = {
      parseEvent: vi.fn(async () => {
        throw new TranscoderEventLookupError('getJob failed: transient');
      }),
    };
    const service = { handleTranscoderEvent: vi.fn() };
    const res = makeRes();
    await controller(transcoder, service).handle({}, res as never);
    expect(res.statusCode).toBe(500);
    expect(res.json).not.toHaveBeenCalled();
    expect(service.handleTranscoderEvent).not.toHaveBeenCalled();
  });

  it('returns 500 when service throws (transient — Pub/Sub will retry)', async () => {
    const transcoder = { parseEvent: vi.fn(async () => successEvent) };
    const service = {
      handleTranscoderEvent: vi.fn(async () => {
        throw new Error('firestore unavailable');
      }),
    };
    const res = makeRes();
    await controller(transcoder, service).handle({}, res as never);
    expect(res.statusCode).toBe(500);
  });
});
