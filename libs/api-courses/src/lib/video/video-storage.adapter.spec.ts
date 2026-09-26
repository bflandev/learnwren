import { describe, expect, it, vi } from 'vitest';

import type { ObjectStorage } from '@learnwren/api-object-storage';

import { hlsVariantPlaylistName } from './hls-naming';
import { VideoUploadSessions } from './upload/video-upload-sessions';
import { type VideoConfig } from './video.config';
import { VideoStorageAdapter } from './video-storage.adapter';

const realCfg = { playbackStorageImpl: 'real', sourceProbeImpl: 'real' } as VideoConfig;
const fakeCfg = { playbackStorageImpl: 'fake', sourceProbeImpl: 'fake' } as VideoConfig;
const localCfg = { playbackStorageImpl: 'real', sourceProbeImpl: 'local' } as VideoConfig;

const PROBE_JSON = JSON.stringify({
  streams: [{ codec_type: 'audio' }, { codec_type: 'video', height: 720, width: 1280 }],
  format: { duration: '42.50' },
});

function makeStorage(kind: 'gcs' | 's3' = 'gcs') {
  return {
    kind,
    createResumableUpload: vi.fn(async () => 'https://resumable.example/session'),
    headObject: vi.fn(async () => ({ size: 10 })),
    deleteObject: vi.fn(async () => undefined),
    deletePrefix: vi.fn(async () => undefined),
    signReadUrl: vi.fn(async () => 'https://signed.example/path'),
    getObject: vi.fn(async () => Buffer.from('#EXTM3U\nreal')),
    downloadToFile: vi.fn(async ({ destination }: { destination: string }) => {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(destination, 'mp4');
    }),
    putFile: vi.fn(async () => undefined),
    openReadStream: vi.fn(() => ({ pipe: vi.fn() })),
    ensureBucket: vi.fn(async () => undefined),
  };
}

function make(cfg: VideoConfig = realCfg, kind: 'gcs' | 's3' = 'gcs', runner = vi.fn(async () => ({ stdout: PROBE_JSON }))) {
  const storage = makeStorage(kind);
  const sessions = new VideoUploadSessions();
  const adapter = new VideoStorageAdapter(storage as unknown as ObjectStorage, cfg, sessions);
  adapter.__setRunner(runner as never);
  return { adapter, storage, sessions, runner };
}

const ref = { bucket: 'b', path: 'videos/v/source.mp4' };

describe('VideoStorageAdapter.createResumableSession', () => {
  it('gcs: asks the store for a resumable session scoped to the public origin, expiring in 7 days', async () => {
    const before = Date.now();
    process.env['LEARNWREN_PUBLIC_URL'] = 'https://app.example';
    try {
      const { adapter, storage, sessions } = make();
      const r = await adapter.createResumableSession({ ...ref, contentType: 'video/mp4', videoId: 'v' });
      expect(r.uri).toBe('https://resumable.example/session');
      expect(storage.createResumableUpload).toHaveBeenCalledExactlyOnceWith({
        bucket: 'b',
        path: 'videos/v/source.mp4',
        contentType: 'video/mp4',
        metadata: { videoId: 'v' },
        origin: 'https://app.example',
      });
      const expires = new Date(r.expiresAt).getTime();
      expect(expires).toBeGreaterThanOrEqual(before + 7 * 24 * 3600 * 1000 - 1000);
      expect(expires).toBeLessThanOrEqual(before + 7 * 24 * 3600 * 1000 + 5000);
      expect(sessions.get('v')).toBeUndefined();
    } finally {
      delete process.env['LEARNWREN_PUBLIC_URL'];
    }
  });

  it('gcs: falls back to the local dev origin when LEARNWREN_PUBLIC_URL is unset', async () => {
    delete process.env['LEARNWREN_PUBLIC_URL'];
    const { adapter, storage } = make();
    await adapter.createResumableSession({ ...ref, contentType: 'video/mp4', videoId: 'v' });
    expect(storage.createResumableUpload.mock.calls[0]![0]).toMatchObject({ origin: 'http://localhost:4200' });
  });

  it('s3: opens an api upload session and hands the browser the proxy route', async () => {
    const { adapter, storage, sessions } = make(realCfg, 's3');
    const r = await adapter.createResumableSession({ ...ref, contentType: 'video/quicktime', videoId: 'v' });
    expect(r.uri).toBe('/api/internal/uploads/videos/v');
    expect(sessions.get('v')).toEqual({ bucket: 'b', path: 'videos/v/source.mp4', contentType: 'video/quicktime', parts: [], received: 0 });
    expect(storage.createResumableUpload).not.toHaveBeenCalled();
  });
});

describe('VideoStorageAdapter.onModuleInit', () => {
  it('creates the source and output buckets', async () => {
    const { adapter, storage } = make({ ...realCfg, sourceBucket: 'src-b', outputBucket: 'out-b' } as VideoConfig);
    await adapter.onModuleInit();
    expect(storage.ensureBucket.mock.calls.map((c) => c[0])).toEqual(['src-b', 'out-b']);
  });
});

describe('VideoStorageAdapter object operations delegate to the port', () => {
  it('headObject / deleteObject / downloadObject / uploadFile / openObjectReadStream', async () => {
    const { adapter, storage } = make();
    expect(await adapter.headObject(ref)).toEqual({ size: 10 });
    expect(storage.headObject).toHaveBeenCalledWith(ref);
    await adapter.deleteObject(ref);
    expect(storage.deleteObject).toHaveBeenCalledWith(ref);
    await adapter.downloadObject({ ...ref, destination: '/dev/null' });
    expect(storage.downloadToFile).toHaveBeenCalledWith({ ...ref, destination: '/dev/null' });
    await adapter.uploadFile({ ...ref, localPath: '/tmp/x', contentType: 'video/mp2t' });
    expect(storage.putFile).toHaveBeenCalledWith({ ...ref, localPath: '/tmp/x', contentType: 'video/mp2t' });
    const s = adapter.openObjectReadStream(ref);
    expect(storage.openReadStream).toHaveBeenCalledWith(ref);
    expect(s).toBe(storage.openReadStream.mock.results[0]!.value);
  });

  it('deletePrefix is best-effort: a store failure is swallowed', async () => {
    const { adapter, storage } = make();
    storage.deletePrefix.mockRejectedValueOnce(new Error('403'));
    await expect(adapter.deletePrefix({ bucket: 'b', prefix: 'videos/v/' })).resolves.toBeUndefined();
    expect(storage.deletePrefix).toHaveBeenCalledWith({ bucket: 'b', prefix: 'videos/v/' });
  });

  it('propagates headObject and deleteObject failures', async () => {
    const { adapter, storage } = make();
    storage.headObject.mockRejectedValueOnce(new Error('h'));
    await expect(adapter.headObject(ref)).rejects.toThrow('h');
    storage.deleteObject.mockRejectedValueOnce(new Error('d'));
    await expect(adapter.deleteObject(ref)).rejects.toThrow('d');
  });
});

describe('VideoStorageAdapter.probeSource', () => {
  it('fake: returns the static probe without touching storage or ffprobe', async () => {
    const { adapter, storage, runner } = make(fakeCfg);
    expect(await adapter.probeSource(ref)).toEqual({ height: 240, durationSec: 1 });
    expect(storage.signReadUrl).not.toHaveBeenCalled();
    expect(runner).not.toHaveBeenCalled();
  });

  it('real: signs a 60 s read URL and runs the pinned ffprobe arg vector against it', async () => {
    const { adapter, storage, runner } = make();
    const result = await adapter.probeSource(ref);
    expect(result).toEqual({ height: 720, durationSec: 42.5 });
    expect(storage.signReadUrl).toHaveBeenCalledExactlyOnceWith({ ...ref, ttlSec: 60 });
    const [binary, args] = runner.mock.calls[0]! as unknown as [string, string[]];
    expect(binary).toMatch(/ffprobe$/);
    expect(args).toEqual(['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', 'https://signed.example/path']);
  });

  it('local: downloads to a temp file named source, probes the path, removes the directory', async () => {
    const { adapter, storage, runner } = make(localCfg);
    const probe = await adapter.probeSource(ref);
    expect(probe).toEqual({ height: 720, durationSec: 42.5 });
    expect(storage.signReadUrl).not.toHaveBeenCalled();
    const destination = (storage.downloadToFile.mock.calls[0]![0] as { destination: string }).destination;
    const { basename, dirname } = await import('node:path');
    const { existsSync } = await import('node:fs');
    expect(basename(destination)).toBe('source');
    expect(basename(dirname(destination))).toMatch(/^lw-probe-/);
    expect((runner.mock.calls[0]! as unknown as [string, string[]])[1].at(-1)).toBe(destination);
    expect(existsSync(dirname(destination))).toBe(false);
  });

  it('local: removes the temp directory even when ffprobe fails', async () => {
    const runner = vi.fn(async () => { throw new Error('probe failed'); });
    const { adapter, storage } = make(localCfg, 'gcs', runner);
    await expect(adapter.probeSource(ref)).rejects.toThrow('probe failed');
    const destination = (storage.downloadToFile.mock.calls[0]![0] as { destination: string }).destination;
    const { existsSync } = await import('node:fs');
    const { dirname } = await import('node:path');
    expect(existsSync(dirname(destination))).toBe(false);
  });

  it('throws when ffprobe reports no video stream', async () => {
    const runner = vi.fn(async () => ({ stdout: JSON.stringify({ streams: [{ codec_type: 'audio' }] }) }));
    const { adapter } = make(realCfg, 'gcs', runner);
    await expect(adapter.probeSource(ref)).rejects.toThrow(/no video stream/);
  });

  it('throws when the video stream has no numeric height', async () => {
    const runner = vi.fn(async () => ({ stdout: JSON.stringify({ streams: [{ codec_type: 'video', height: '720' }] }) }));
    const { adapter } = make(realCfg, 'gcs', runner);
    await expect(adapter.probeSource(ref)).rejects.toThrow(/no video stream/);
  });

  it('reports duration 0 when ffprobe omits the format block', async () => {
    const runner = vi.fn(async () => ({ stdout: JSON.stringify({ streams: [{ codec_type: 'video', height: 360 }] }) }));
    const { adapter } = make(realCfg, 'gcs', runner);
    expect(await adapter.probeSource(ref)).toEqual({ height: 360, durationSec: 0 });
  });
});

describe('VideoStorageAdapter playback reads', () => {
  it('real: readManifestObject fetches the object body; signObjectUrl signs with the TTL', async () => {
    const { adapter, storage } = make();
    expect(await adapter.readManifestObject({ bucket: 'out', path: 'videos/v/hls/manifest.m3u8' })).toBe('#EXTM3U\nreal');
    expect(storage.getObject).toHaveBeenCalledWith({ bucket: 'out', path: 'videos/v/hls/manifest.m3u8' });
    expect(await adapter.signObjectUrl({ bucket: 'out', path: 'videos/v/hls/x.ts', ttlSec: 14400 })).toBe('https://signed.example/path');
    expect(storage.signReadUrl).toHaveBeenCalledWith({ bucket: 'out', path: 'videos/v/hls/x.ts', ttlSec: 14400 });
  });

  it('fake: master mirrors the GCP layout with all four flat variant playlists', async () => {
    const { adapter, storage } = make(fakeCfg);
    const master = await adapter.readManifestObject({ bucket: 'out', path: 'videos/v/hls/manifest.m3u8' });
    expect(master.startsWith('#EXTM3U\n#EXT-X-VERSION:6\n')).toBe(true);
    for (const r of ['1080p', '720p', '480p', '360p']) {
      expect(master).toContain(`\n${hlsVariantPlaylistName(r)}\n`);
    }
    expect(master).toContain('#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080\nhls_1080p.m3u8');
    expect(master).toContain('#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360\nhls_360p.m3u8');
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it('fake: a variant playlist carries an AES-128 key line and two flat segments named after the mux key', async () => {
    const { adapter } = make(fakeCfg);
    const body = await adapter.readManifestObject({ bucket: 'out', path: `videos/v/hls/${hlsVariantPlaylistName('720p')}` });
    expect(body).toContain('#EXT-X-TARGETDURATION:6');
    expect(body).toContain('#EXT-X-KEY:METHOD=AES-128,URI="https://example.invalid/k",IV=0xABCDEF0123456789ABCDEF0123456789');
    expect(body).toContain('#EXTINF:6.000,\nhls_720p0000000000.ts\n#EXTINF:6.000,\nhls_720p0000000001.ts\n#EXT-X-ENDLIST');
  });

  it('fake: an unknown manifest path throws', async () => {
    const { adapter } = make(fakeCfg);
    await expect(adapter.readManifestObject({ bucket: 'out', path: 'videos/v/hls/other.txt' })).rejects.toThrow(/unknown manifest path/);
    await expect(adapter.readManifestObject({ bucket: 'out', path: 'videos/v/hls/weird.m3u8' })).rejects.toThrow(/unknown manifest path/);
  });

  it('fake: signObjectUrl returns a gs-stub URL carrying bucket, path and TTL', async () => {
    const { adapter, storage } = make(fakeCfg);
    expect(await adapter.signObjectUrl({ bucket: 'out', path: 'videos/v/hls/x.ts', ttlSec: 99 })).toBe('gs-stub://out/videos/v/hls/x.ts?ttl=99');
    expect(storage.signReadUrl).not.toHaveBeenCalled();
  });
});
