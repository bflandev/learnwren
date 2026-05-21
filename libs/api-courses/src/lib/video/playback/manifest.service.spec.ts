import { describe, expect, it, vi } from 'vitest';

import type { Video } from '@learnwren/shared-data-models';

import { ManifestParseFailedException } from '../errors/video.exception';
import type { VideoConfig } from '../video.config';
import type { VideoStoragePort } from '../video-storage.adapter';
import { ManifestService } from './manifest.service';

const VIDEO: Video = {
  id: 'v1' as Video['id'],
  ownerInstructorId: 'u1' as Video['ownerInstructorId'],
  courseId: 'c1' as Video['courseId'],
  lessonId: 'l1' as Video['lessonId'],
  state: 'READY',
  source: { bucket: 'src', path: 'p' },
  output: { bucket: 'out', manifestPath: 'videos/v1/hls/manifest.m3u8', durationSec: 60 },
  keyId: 'k1' as Video['keyId'],
  createdAt: 'now' as Video['createdAt'],
  updatedAt: 'now' as Video['updatedAt'],
};

const MASTER = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-STREAM-INF:BANDWIDTH=5000000
1080p/playlist.m3u8
`;

const RENDITION_720 = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-KEY:METHOD=AES-128,URI="https://example.invalid/k",IV=0xABCD
#EXTINF:6.000,
segment_001.ts
#EXT-X-ENDLIST
`;

function makeStorage(
  read: (b: string, p: string) => Promise<string>,
  sign?: (b: string, p: string, t: number) => Promise<string>,
): VideoStoragePort {
  const port: Partial<VideoStoragePort> = {
    readManifestObject: vi.fn(async ({ bucket, path }) => read(bucket, path)),
    signObjectUrl: vi.fn(async ({ bucket, path, ttlSec }) =>
      sign ? sign(bucket, path, ttlSec) : `signed://${bucket}/${path}?ttl=${ttlSec}`,
    ),
  };
  return port as unknown as VideoStoragePort;
}

const CFG = { playbackSignedUrlTtlSec: 14400 } as VideoConfig;

describe('ManifestService.fetchMaster', () => {
  it('reads master from the output bucket and rewrites to proxy paths', async () => {
    const storage = makeStorage(async () => MASTER);
    const svc = new ManifestService(storage, CFG);
    const out = await svc.fetchMaster(VIDEO);
    expect(out).toContain(`/api/playback/manifest/${VIDEO.id}/rendition/1080p`);
    expect(out).not.toMatch(/playlist\.m3u8/);
  });

  it('reads from video.output.bucket + manifestPath', async () => {
    const read = vi.fn().mockResolvedValue(MASTER);
    const storage = makeStorage((b, p) => read(b, p));
    const svc = new ManifestService(storage, CFG);
    await svc.fetchMaster(VIDEO);
    expect(read).toHaveBeenCalledWith('out', 'videos/v1/hls/manifest.m3u8');
  });

  it('maps a non-#EXTM3U body to 502 MANIFEST_PARSE_FAILED', async () => {
    const storage = makeStorage(async () => 'oops');
    const svc = new ManifestService(storage, CFG);
    await expect(svc.fetchMaster(VIDEO)).rejects.toBeInstanceOf(ManifestParseFailedException);
  });

  it('propagates storage errors (caller maps them at the controller layer)', async () => {
    const storage = makeStorage(async () => { throw new Error('gcs down'); });
    const svc = new ManifestService(storage, CFG);
    await expect(svc.fetchMaster(VIDEO)).rejects.toThrow(/gcs down/);
  });
});

describe('ManifestService.fetchRendition', () => {
  it('reads the rendition playlist from the right path', async () => {
    const read = vi.fn().mockResolvedValue(RENDITION_720);
    const storage = makeStorage((b, p) => read(b, p));
    const svc = new ManifestService(storage, CFG);
    await svc.fetchRendition(VIDEO, '720p');
    expect(read).toHaveBeenCalledWith('out', 'videos/v1/hls/720p/playlist.m3u8');
  });

  it('signs each segment with bucket=output, path=<dir>/<rendition>/<segment>, ttl=cfg', async () => {
    const sign = vi.fn(async (b: string, p: string, t: number) => `signed:${b}|${p}|${t}`);
    const storage = makeStorage(async () => RENDITION_720, sign);
    const svc = new ManifestService(storage, CFG);
    const out = await svc.fetchRendition(VIDEO, '720p');
    expect(sign).toHaveBeenCalledWith('out', 'videos/v1/hls/720p/segment_001.ts', 14400);
    expect(out).toContain('signed:out|videos/v1/hls/720p/segment_001.ts|14400');
  });

  it('rewrites the key directive to /api/playback/keys/:vid and preserves IV', async () => {
    const storage = makeStorage(async () => RENDITION_720);
    const svc = new ManifestService(storage, CFG);
    const out = await svc.fetchRendition(VIDEO, '720p');
    expect(out).toContain(`URI="/api/playback/keys/${VIDEO.id}"`);
    expect(out).toContain('IV=0xABCD');
  });

  it('propagates storage errors from the rendition read', async () => {
    const storage = makeStorage(async () => { throw new Error('rendition gone'); });
    const svc = new ManifestService(storage, CFG);
    await expect(svc.fetchRendition(VIDEO, '720p')).rejects.toThrow(/rendition gone/);
  });
});
