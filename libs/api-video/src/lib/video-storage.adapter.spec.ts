import { describe, expect, it, vi } from 'vitest';

import { VideoStorageAdapter } from './video-storage.adapter';

function makeAdapterWithRunner(runner: ReturnType<typeof vi.fn>, file: object): VideoStorageAdapter {
  const bucket = { file: () => file, deleteFiles: vi.fn(async () => [[]]) };
  const storage = { bucket: () => bucket };
  const adapter = new VideoStorageAdapter(storage as never);
  adapter.__setRunner(runner as never);
  return adapter;
}

describe('VideoStorageAdapter.probeSource', () => {
  it('returns height and durationSec parsed from ffprobe output', async () => {
    const runner = vi.fn(async () => ({
      stdout: JSON.stringify({
        streams: [
          { codec_type: 'video', height: 720, width: 1280 },
          { codec_type: 'audio' },
        ],
        format: { duration: '42.50' },
      }),
    }));
    const file = { getSignedUrl: vi.fn(async () => ['https://signed.example/path']) };
    const adapter = makeAdapterWithRunner(runner, file);
    const result = await adapter.probeSource({ bucket: 'b', path: 'videos/v/source.mp4' });
    expect(result.height).toBe(720);
    expect(result.durationSec).toBe(42.5);
    expect(file.getSignedUrl).toHaveBeenCalledWith(expect.objectContaining({ action: 'read' }));
  });

  it('throws when no video stream is present', async () => {
    const runner = vi.fn(async () => ({
      stdout: JSON.stringify({ streams: [{ codec_type: 'audio' }], format: { duration: '1' } }),
    }));
    const file = { getSignedUrl: vi.fn(async () => ['https://x']) };
    const adapter = makeAdapterWithRunner(runner, file);
    await expect(adapter.probeSource({ bucket: 'b', path: 'p' })).rejects.toThrow(/no video stream/i);
  });

  it('throws when the runner rejects', async () => {
    const runner = vi.fn(async () => { throw new Error('ffprobe exited with code 1'); });
    const file = { getSignedUrl: vi.fn(async () => ['https://x']) };
    const adapter = makeAdapterWithRunner(runner, file);
    await expect(adapter.probeSource({ bucket: 'b', path: 'p' })).rejects.toThrow(/ffprobe/);
  });
});

describe('VideoStorageAdapter.deletePrefix', () => {
  it('calls bucket.deleteFiles with the prefix', async () => {
    const deleteFiles = vi.fn(async () => [[]]);
    const bucket = { deleteFiles };
    const storage = { bucket: () => bucket };
    const adapter = new VideoStorageAdapter(storage as never);
    await adapter.deletePrefix({ bucket: 'b', prefix: 'videos/v1/' });
    expect(deleteFiles).toHaveBeenCalledWith({ prefix: 'videos/v1/' });
  });

  it('swallows errors (best-effort)', async () => {
    const bucket = { deleteFiles: vi.fn(async () => { throw new Error('rate-limited'); }) };
    const storage = { bucket: () => bucket };
    const adapter = new VideoStorageAdapter(storage as never);
    await expect(adapter.deletePrefix({ bucket: 'b', prefix: 'p/' })).resolves.toBeUndefined();
  });
});
