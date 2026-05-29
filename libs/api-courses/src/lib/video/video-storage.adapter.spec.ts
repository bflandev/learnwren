import { describe, expect, it, vi } from 'vitest';

import { type FirebaseStorageHandle } from '@learnwren/api-firebase';

import { type VideoConfig } from './video.config';
import { VideoStorageAdapter } from './video-storage.adapter';

const realCfg = { playbackStorageImpl: 'real', sourceProbeImpl: 'real' } as VideoConfig;

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
    const before = Date.now();
    const result = await adapter.probeSource({ bucket: 'b', path: 'videos/v/source.mp4' });
    const after = Date.now();
    expect(result.height).toBe(720);
    expect(result.durationSec).toBe(42.5);
    // Pin the v4 read sign with a ~60s TTL (not action-only).
    expect(file.getSignedUrl).toHaveBeenCalledOnce();
    const signArgs = file.getSignedUrl.mock.calls[0]![0] as {
      action: string;
      version: string;
      expires: number;
    };
    expect(signArgs.action).toBe('read');
    expect(signArgs.version).toBe('v4');
    expect(signArgs.expires).toBeGreaterThanOrEqual(before + 60_000);
    expect(signArgs.expires).toBeLessThanOrEqual(after + 60_000);
    // Pin the exact ffprobe arg vector: the JSON/stream/format flags drive the
    // parse below, and the signed URL must be the final positional arg. (The
    // binary path is the @ffprobe-installer resolution, so assert only args.)
    expect(runner).toHaveBeenCalledOnce();
    expect(runner.mock.calls[0]![1]).toEqual([
      '-v', 'error',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      'https://signed.example/path',
    ]);
  });

  it('selects the video stream even when it is not first in the list', async () => {
    // Kills the find-predicate mutant: with `s.codec_type === 'video'` forced
    // true, find() would return the leading audio stream (no height) and the
    // probe would throw instead of reporting 480.
    const runner = vi.fn(async () => ({
      stdout: JSON.stringify({
        streams: [
          { codec_type: 'audio' },
          { codec_type: 'video', height: 480 },
        ],
        format: { duration: '5' },
      }),
    }));
    const file = { getSignedUrl: vi.fn(async () => ['https://x']) };
    const adapter = makeAdapterWithRunner(runner, file);
    const result = await adapter.probeSource({ bucket: 'b', path: 'p' });
    expect(result.height).toBe(480);
  });

  it('defaults durationSec to 0 when ffprobe reports no format block', async () => {
    // Kills the `parsed.format?.duration` optional-chaining mutant and the
    // `?? '0'` fallback: with no `format`, durationSec must be 0, not a throw.
    const runner = vi.fn(async () => ({
      stdout: JSON.stringify({ streams: [{ codec_type: 'video', height: 720 }] }),
    }));
    const file = { getSignedUrl: vi.fn(async () => ['https://x']) };
    const adapter = makeAdapterWithRunner(runner, file);
    const result = await adapter.probeSource({ bucket: 'b', path: 'p' });
    expect(result).toEqual({ height: 720, durationSec: 0 });
  });

  it('throws when no video stream is present', async () => {
    const runner = vi.fn(async () => ({
      stdout: JSON.stringify({ streams: [{ codec_type: 'audio' }], format: { duration: '1' } }),
    }));
    const file = { getSignedUrl: vi.fn(async () => ['https://x']) };
    const adapter = makeAdapterWithRunner(runner, file);
    await expect(adapter.probeSource({ bucket: 'b', path: 'p' })).rejects.toThrow(/no video stream/i);
  });

  it('throws when the streams array is absent entirely', async () => {
    // Kills the `parsed.streams?.find` optional-chaining mutant: removing `?.`
    // would surface a TypeError; with it, we get our own "no video stream".
    const runner = vi.fn(async () => ({ stdout: JSON.stringify({ format: { duration: '1' } }) }));
    const file = { getSignedUrl: vi.fn(async () => ['https://x']) };
    const adapter = makeAdapterWithRunner(runner, file);
    await expect(adapter.probeSource({ bucket: 'b', path: 'p' })).rejects.toThrow(/no video stream/i);
  });

  it('throws when the matched video stream has a non-numeric height', async () => {
    // Kills the `typeof videoStream.height !== 'number'` half of the guard:
    // forcing the whole condition false would return a bogus height instead.
    const runner = vi.fn(async () => ({
      stdout: JSON.stringify({
        streams: [{ codec_type: 'video', height: '720' }],
        format: { duration: '1' },
      }),
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

  it('returns the static fake probe without signing or running ffprobe when sourceProbeImpl is "fake"', async () => {
    // The credential-free seam: in emulator/dev mode v4 signing throws because
    // there are no Application Default Credentials. Returning a static probe
    // (height: 240, durationSec: 1) lets the upload pipeline complete without
    // touching ffprobe or the signed-URL machinery at all.
    const runner = vi.fn();
    const getSignedUrl = vi.fn();
    const fileSpy = vi.fn(() => ({ getSignedUrl }));
    const bucketSpy = vi.fn(() => ({ file: fileSpy, deleteFiles: vi.fn(async () => [[]]) }));
    const storage = { bucket: bucketSpy };
    const fakeCfg = { playbackStorageImpl: 'real', sourceProbeImpl: 'fake' } as VideoConfig;
    const adapter = new VideoStorageAdapter(storage as never, fakeCfg);
    adapter.__setRunner(runner as never);

    const result = await adapter.probeSource({ bucket: 'b', path: 'videos/v/source.mp4' });

    expect(result).toEqual({ height: 240, durationSec: 1 });
    expect(bucketSpy).not.toHaveBeenCalled();
    expect(fileSpy).not.toHaveBeenCalled();
    expect(getSignedUrl).not.toHaveBeenCalled();
    expect(runner).not.toHaveBeenCalled();
  });
});

describe('VideoStorageAdapter.createResumableSession', () => {
  function makeAdapter(createResumableUpload: ReturnType<typeof vi.fn>) {
    const fileSpy = vi.fn(() => ({ createResumableUpload }));
    const bucketSpy = vi.fn(() => ({ file: fileSpy }));
    const storage = { bucket: bucketSpy } as unknown as FirebaseStorageHandle;
    return { adapter: new VideoStorageAdapter(storage, realCfg), bucketSpy, fileSpy };
  }

  it('creates the upload with content-type + videoId metadata scoped to the app origin', async () => {
    const createResumableUpload = vi.fn(async () => ['https://resumable.example/session']);
    const { adapter, bucketSpy, fileSpy } = makeAdapter(createResumableUpload);
    const prev = process.env['LEARNWREN_PUBLIC_URL'];
    process.env['LEARNWREN_PUBLIC_URL'] = 'https://app.learnwren.example';
    try {
      const before = Date.now();
      const session = await adapter.createResumableSession({
        bucket: 'uploads',
        path: 'videos/v1/source.mp4',
        contentType: 'video/mp4',
        videoId: 'v1',
      });
      const after = Date.now();

      expect(session.uri).toBe('https://resumable.example/session');
      expect(bucketSpy).toHaveBeenCalledWith('uploads');
      expect(fileSpy).toHaveBeenCalledWith('videos/v1/source.mp4');
      // CORS origin pinned to the configured app URL; metadata carries both the
      // content-type and the videoId tag the transcoder webhook keys off.
      expect(createResumableUpload).toHaveBeenCalledWith({
        metadata: {
          contentType: 'video/mp4',
          metadata: { videoId: 'v1' },
        },
        origin: 'https://app.learnwren.example',
      });
      // expiresAt is now + 7 days, as an ISO string.
      const expMs = Date.parse(session.expiresAt);
      expect(expMs).toBeGreaterThanOrEqual(before + 7 * 24 * 3600 * 1000);
      expect(expMs).toBeLessThanOrEqual(after + 7 * 24 * 3600 * 1000);
    } finally {
      if (prev === undefined) delete process.env['LEARNWREN_PUBLIC_URL'];
      else process.env['LEARNWREN_PUBLIC_URL'] = prev;
    }
  });

  it('falls back to the local dev origin when LEARNWREN_PUBLIC_URL is unset', async () => {
    const createResumableUpload = vi.fn(async () => ['uri']);
    const { adapter } = makeAdapter(createResumableUpload);
    const prev = process.env['LEARNWREN_PUBLIC_URL'];
    delete process.env['LEARNWREN_PUBLIC_URL'];
    try {
      await adapter.createResumableSession({
        bucket: 'b',
        path: 'p',
        contentType: 'video/mp4',
        videoId: 'v1',
      });
      expect(createResumableUpload).toHaveBeenCalledWith(
        expect.objectContaining({ origin: 'http://localhost:4200' }),
      );
    } finally {
      if (prev !== undefined) process.env['LEARNWREN_PUBLIC_URL'] = prev;
    }
  });
});

describe('VideoStorageAdapter.headObject', () => {
  function makeAdapter(getMetadata: ReturnType<typeof vi.fn>): VideoStorageAdapter {
    const file = { getMetadata };
    const storage = { bucket: () => ({ file: () => file }) } as unknown as FirebaseStorageHandle;
    return new VideoStorageAdapter(storage, realCfg);
  }

  it('parses a string size into a number', async () => {
    const getMetadata = vi.fn().mockResolvedValue([{ size: '12345' }]);
    const result = await makeAdapter(getMetadata).headObject({ bucket: 'b', path: 'p' });
    expect(result).toEqual({ size: 12345 });
  });

  it('returns a numeric size unchanged', async () => {
    const getMetadata = vi.fn().mockResolvedValue([{ size: 999 }]);
    const result = await makeAdapter(getMetadata).headObject({ bucket: 'b', path: 'p' });
    expect(result).toEqual({ size: 999 });
  });

  it('returns null on 404 ("not found") errors', async () => {
    const notFound = Object.assign(new Error('No such object'), { code: 404 });
    const getMetadata = vi.fn().mockRejectedValue(notFound);
    const result = await makeAdapter(getMetadata).headObject({ bucket: 'b', path: 'p' });
    expect(result).toBeNull();
  });

  it('rethrows non-404 storage errors', async () => {
    const boom = Object.assign(new Error('rate-limited'), { code: 429 });
    const getMetadata = vi.fn().mockRejectedValue(boom);
    await expect(makeAdapter(getMetadata).headObject({ bucket: 'b', path: 'p' })).rejects.toThrow(
      /rate-limited/,
    );
  });
});

describe('VideoStorageAdapter.deleteObject', () => {
  function makeAdapter(del: ReturnType<typeof vi.fn>): VideoStorageAdapter {
    const file = { delete: del };
    const storage = { bucket: () => ({ file: () => file }) } as unknown as FirebaseStorageHandle;
    return new VideoStorageAdapter(storage, realCfg);
  }

  it('resolves on a successful delete', async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    await expect(makeAdapter(del).deleteObject({ bucket: 'b', path: 'p' })).resolves.toBeUndefined();
    expect(del).toHaveBeenCalledOnce();
  });

  it('returns silently when the object is already gone (404)', async () => {
    const notFound = Object.assign(new Error('No such object'), { code: 404 });
    const del = vi.fn().mockRejectedValue(notFound);
    await expect(makeAdapter(del).deleteObject({ bucket: 'b', path: 'p' })).resolves.toBeUndefined();
  });

  it('rethrows non-404 delete errors', async () => {
    const boom = Object.assign(new Error('forbidden'), { code: 403 });
    const del = vi.fn().mockRejectedValue(boom);
    await expect(makeAdapter(del).deleteObject({ bucket: 'b', path: 'p' })).rejects.toThrow(
      /forbidden/,
    );
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
    // Pin the exact master playlist — every variant line and the newline join
    // matter to the downstream manifest rewriter, so assert byte-for-byte.
    expect(body).toBe(
      [
        '#EXTM3U',
        '#EXT-X-VERSION:6',
        '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080',
        '1080p/playlist.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720',
        '720p/playlist.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=854x480',
        '480p/playlist.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360',
        '360p/playlist.m3u8',
        '',
      ].join('\n'),
    );
  });

  it('readManifestObject returns a deterministic rendition m3u8 for /playlist.m3u8 paths', async () => {
    const fakeStorage = { bucket: () => ({ file: () => ({}) }) } as unknown as FirebaseStorageHandle;
    const cfg = { playbackStorageImpl: 'fake' } as VideoConfig;
    const adapter = new VideoStorageAdapter(fakeStorage, cfg);
    const body = await adapter.readManifestObject({ bucket: 'b', path: 'videos/v1/hls/720p/playlist.m3u8' });
    // Pin the exact rendition playlist — the AES-128 key line, segment names,
    // and #EXT-X-ENDLIST are all load-bearing for the player/key flow.
    expect(body).toBe(
      [
        '#EXTM3U',
        '#EXT-X-VERSION:6',
        '#EXT-X-TARGETDURATION:6',
        '#EXT-X-KEY:METHOD=AES-128,URI="https://example.invalid/k",IV=0xABCDEF0123456789ABCDEF0123456789',
        '#EXTINF:6.000,',
        'segment_001.ts',
        '#EXTINF:6.000,',
        'segment_002.ts',
        '#EXT-X-ENDLIST',
        '',
      ].join('\n'),
    );
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
