import { describe, expect, it, vi } from 'vitest';

import { type FirebaseStorageHandle } from '@learnwren/api-firebase';

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

describe('VideoStorageAdapter.readManifestObject', () => {
  it('downloads the object body as a UTF-8 string', async () => {
    const download = vi.fn().mockResolvedValue([Buffer.from('#EXTM3U\nbody\n', 'utf-8')]);
    const storage = {
      bucket: (_b: string) => ({ file: (_p: string) => ({ download }) }),
    } as unknown as FirebaseStorageHandle;
    const adapter = new VideoStorageAdapter(storage);
    const body = await adapter.readManifestObject({ bucket: 'b', path: 'videos/v1/hls/manifest.m3u8' });
    expect(body).toBe('#EXTM3U\nbody\n');
    expect(download).toHaveBeenCalledOnce();
  });

  it('propagates errors from the storage layer', async () => {
    const err = new Error('boom');
    const download = vi.fn().mockRejectedValue(err);
    const storage = {
      bucket: () => ({ file: () => ({ download }) }),
    } as unknown as FirebaseStorageHandle;
    const adapter = new VideoStorageAdapter(storage);
    await expect(adapter.readManifestObject({ bucket: 'b', path: 'p' })).rejects.toThrow(/boom/);
  });
});

describe('VideoStorageAdapter.signObjectUrl', () => {
  it('mints a v4 read URL with the provided TTL', async () => {
    const getSignedUrl = vi.fn().mockResolvedValue(['https://signed/url']);
    const storage = {
      bucket: () => ({ file: () => ({ getSignedUrl }) }),
    } as unknown as FirebaseStorageHandle;
    const adapter = new VideoStorageAdapter(storage);
    const before = Date.now();
    const url = await adapter.signObjectUrl({ bucket: 'b', path: 'videos/v1/hls/1080p/seg.ts', ttlSec: 14400 });
    const after = Date.now();
    expect(url).toBe('https://signed/url');
    expect(getSignedUrl).toHaveBeenCalledOnce();
    const args = getSignedUrl.mock.calls[0]![0] as { version: string; action: string; expires: number };
    expect(args.version).toBe('v4');
    expect(args.action).toBe('read');
    expect(args.expires).toBeGreaterThanOrEqual(before + 14400 * 1000);
    expect(args.expires).toBeLessThanOrEqual(after + 14400 * 1000);
  });

  it('passes the bucket and path through to the storage client', async () => {
    const fileSpy = vi.fn(() => ({ getSignedUrl: vi.fn().mockResolvedValue(['u']) }));
    const bucketSpy = vi.fn(() => ({ file: fileSpy }));
    const storage = { bucket: bucketSpy } as unknown as FirebaseStorageHandle;
    const adapter = new VideoStorageAdapter(storage);
    await adapter.signObjectUrl({ bucket: 'my-bucket', path: 'a/b/c.ts', ttlSec: 60 });
    expect(bucketSpy).toHaveBeenCalledWith('my-bucket');
    expect(fileSpy).toHaveBeenCalledWith('a/b/c.ts');
  });
});
