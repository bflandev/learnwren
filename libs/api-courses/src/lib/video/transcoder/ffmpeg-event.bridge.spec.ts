import { describe, expect, it, vi } from 'vitest';

import type { VideoId } from '@learnwren/shared-data-models';

import type { VideoService } from '../video.service';
import { FfmpegEventBridge } from './ffmpeg-event.bridge';
import { FfmpegTranscoderAdapter } from './ffmpeg-transcoder.adapter';
import type { VideoTranscoder } from './transcoder.port';

describe('FfmpegEventBridge', () => {
  it('wires the adapter sink to VideoService.handleTranscoderEvent on module init', async () => {
    const setSink = vi.fn();
    const adapter = Object.create(FfmpegTranscoderAdapter.prototype) as FfmpegTranscoderAdapter;
    adapter.setSink = setSink;
    const svc = { handleTranscoderEvent: vi.fn(async () => ({ acted: true })) };
    new FfmpegEventBridge(adapter, svc as unknown as VideoService).onModuleInit();
    expect(setSink).toHaveBeenCalledOnce();
    const sink = setSink.mock.calls[0]![0] as (e: unknown) => Promise<unknown>;
    const event = { type: 'JOB_FAILED', jobName: 'j', videoId: 'v' as VideoId, reason: 'r' };
    await expect(sink(event)).resolves.toEqual({ acted: true });
    expect(svc.handleTranscoderEvent).toHaveBeenCalledWith(event);
  });

  it('does nothing when the transcoder is not the ffmpeg adapter', () => {
    const other = { submitJob: vi.fn() } as unknown as VideoTranscoder;
    const svc = { handleTranscoderEvent: vi.fn() };
    expect(() => new FfmpegEventBridge(other, svc as unknown as VideoService).onModuleInit()).not.toThrow();
  });
});
