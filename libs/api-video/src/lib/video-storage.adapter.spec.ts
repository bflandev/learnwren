import { describe, expect, it, vi } from 'vitest';

import { type FirebaseStorageHandle } from '@learnwren/api-firebase';

import { type VideoConfig } from './video.config';
import { VideoStorageAdapter } from './video-storage.adapter';

const realCfg = { playbackStorageImpl: 'real' } as VideoConfig;

function makeAdapterWithRunner(runner: ReturnType<typeof vi.fn>, file: object): VideoStorageAdapter {
  const bucket = { file: () => file, deleteFiles: vi.fn(async () => [[]]) };
  const storage = { bucket: () => bucket };
  const adapter = new VideoStorageAdapter(storage as never, realCfg);
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
    const adapter = new VideoStorageAdapter(storage as never, realCfg);
    await adapter.deletePrefix({ bucket: 'b', prefix: 'videos/v1/' });
    expect(deleteFiles).toHaveBeenCalledWith({ prefix: 'videos/v1/' });
  });

  it('swallows errors (best-effort)', async () => {
    const bucket = { deleteFiles: vi.fn(async () => { throw new Error('rate-limited'); }) };
    const storage = { bucket: () => bucket };
    const adapter = new VideoStorageAdapter(storage as never, realCfg);
    await expect(adapter.deletePrefix({ bucket: 'b', prefix: 'p/' })).resolves.toBeUndefined();
  });
});

describe('VideoStorageAdapter.readManifestObject', () => {
  it('downloads the object body as a UTF-8 string', async () => {
    const download = vi.fn().mockResolvedValue([Buffer.from('#EXTM3U\nbody\n', 'utf-8')]);
    const storage = {
      bucket: (_b: string) => ({ file: (_p: string) => ({ download }) }),
    } as unknown as FirebaseStorageHandle;
    const adapter = new VideoStorageAdapter(storage, realCfg);
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
    const adapter = new VideoStorageAdapter(storage, realCfg);
    await expect(adapter.readManifestObject({ bucket: 'b', path: 'p' })).rejects.toThrow(/boom/);
  });
});

describe('VideoStorageAdapter.signObjectUrl', () => {
  it('mints a v4 read URL with the provided TTL', async () => {
    const getSignedUrl = vi.fn().mockResolvedValue(['https://signed/url']);
    const storage = {
      bucket: () => ({ file: () => ({ getSignedUrl }) }),
    } as unknown as FirebaseStorageHandle;
    const adapter = new VideoStorageAdapter(storage, realCfg);
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
    const adapter = new VideoStorageAdapter(storage, realCfg);
    await adapter.signObjectUrl({ bucket: 'my-bucket', path: 'a/b/c.ts', ttlSec: 60 });
    expect(bucketSpy).toHaveBeenCalledWith('my-bucket');
    expect(fileSpy).toHaveBeenCalledWith('a/b/c.ts');
  });
});

describe('VideoStorageAdapter — playback storage fake mode', () => {
  it('readManifestObject returns a deterministic master m3u8 when cfg.playbackStorageImpl=fake', async () => {
    const fakeStorage = { bucket: () => ({ file: () => ({ /* unused */ }) }) } as unknown as FirebaseStorageHandle;
    const cfg = { playbackStorageImpl: 'fake' } as VideoConfig;
    const adapter = new VideoStorageAdapter(fakeStorage, cfg);
    const body = await adapter.readManifestObject({ bucket: 'b', path: 'videos/v1/hls/manifest.m3u8' });
    expect(body).toMatch(/^#EXTM3U/);
    expect(body).toContain('1080p/playlist.m3u8');
    expect(body).toContain('720p/playlist.m3u8');
    expect(body).toContain('480p/playlist.m3u8');
    expect(body).toContain('360p/playlist.m3u8');
  });

  it('readManifestObject returns a deterministic rendition m3u8 for /playlist.m3u8 paths', async () => {
    const fakeStorage = { bucket: () => ({ file: () => ({}) }) } as unknown as FirebaseStorageHandle;
    const cfg = { playbackStorageImpl: 'fake' } as VideoConfig;
    const adapter = new VideoStorageAdapter(fakeStorage, cfg);
    const body = await adapter.readManifestObject({ bucket: 'b', path: 'videos/v1/hls/720p/playlist.m3u8' });
    expect(body).toContain('#EXT-X-KEY:METHOD=AES-128,URI="https://example.invalid/k",IV=0xABCDEF0123456789ABCDEF0123456789');
    expect(body).toContain('segment_001.ts');
    expect(body).toContain('segment_002.ts');
  });

  it('signObjectUrl returns a gs-stub:// URL with bucket, path, and ttl', async () => {
    const fakeStorage = { bucket: () => ({ file: () => ({}) }) } as unknown as FirebaseStorageHandle;
    const cfg = { playbackStorageImpl: 'fake' } as VideoConfig;
    const adapter = new VideoStorageAdapter(fakeStorage, cfg);
    const url = await adapter.signObjectUrl({ bucket: 'b', path: 'videos/v1/hls/720p/segment_001.ts', ttlSec: 14400 });
    expect(url).toBe('gs-stub://b/videos/v1/hls/720p/segment_001.ts?ttl=14400');
  });

  it('readManifestObject throws when the path is unknown to the fake', async () => {
    const fakeStorage = { bucket: () => ({ file: () => ({}) }) } as unknown as FirebaseStorageHandle;
    const cfg = { playbackStorageImpl: 'fake' } as VideoConfig;
    const adapter = new VideoStorageAdapter(fakeStorage, cfg);
    await expect(
      adapter.readManifestObject({ bucket: 'b', path: 'videos/v1/hls/random.txt' }),
    ).rejects.toThrow(/unknown manifest path/);
  });
});
