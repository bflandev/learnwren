import { describe, expect, it, vi } from 'vitest';

import type { VideoId } from '@learnwren/shared-data-models';

import { ManifestParseFailedException } from '../errors/video.exception';
import {
  ALLOWED_RENDITIONS,
  isAllowedRendition,
  rewriteMaster,
  rewriteRendition,
} from './manifest.rewriter';

const VID = 'v123' as VideoId;

const MASTER = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"
1080p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.4d4028,mp4a.40.2"
720p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=854x480,CODECS="avc1.4d401e,mp4a.40.2"
480p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2"
360p/playlist.m3u8
`;

describe('ALLOWED_RENDITIONS', () => {
  it('is the slice B ladder', () => {
    expect(ALLOWED_RENDITIONS).toEqual(['1080p', '720p', '480p', '360p']);
  });
});

describe('rewriteMaster', () => {
  it('rewrites each rendition URI to the proxy path', () => {
    const out = rewriteMaster(MASTER, VID);
    const lines = out.split('\n');
    expect(lines).toContain(`/api/playback/manifest/${VID}/rendition/1080p`);
    expect(lines).toContain(`/api/playback/manifest/${VID}/rendition/720p`);
    expect(lines).toContain(`/api/playback/manifest/${VID}/rendition/480p`);
    expect(lines).toContain(`/api/playback/manifest/${VID}/rendition/360p`);
    expect(out).not.toMatch(/playlist\.m3u8/);
  });

  it('preserves #EXTM3U, version, and comment directives', () => {
    const out = rewriteMaster(MASTER, VID);
    expect(out).toMatch(/^#EXTM3U/);
    expect(out).toContain('#EXT-X-VERSION:6');
    expect(out).toContain('#EXT-X-INDEPENDENT-SEGMENTS');
    expect(out).toContain('#EXT-X-STREAM-INF:BANDWIDTH=5000000');
  });

  it('throws ManifestParseFailedException on missing #EXTM3U header', () => {
    expect(() => rewriteMaster('#EXT-X-VERSION:6\n', VID)).toThrow(
      ManifestParseFailedException,
    );
  });

  it('throws when #EXT-X-STREAM-INF is not followed by a URI line', () => {
    const body = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n#EXT-X-ENDLIST\n';
    expect(() => rewriteMaster(body, VID)).toThrow(ManifestParseFailedException);
  });

  it('throws when a rendition is outside the allow-list', () => {
    const body = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1
240p/playlist.m3u8
`;
    expect(() => rewriteMaster(body, VID)).toThrow(/240p/);
  });

  it('throws when the URI line starts with a leading slash (slash position 0)', () => {
    // Defends `slash <= 0` boundary in renditionNameFromUri.
    const body = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1
/playlist.m3u8
`;
    expect(() => rewriteMaster(body, VID)).toThrow(/cannot extract rendition name/);
  });

  it('throws when EXT-X-STREAM-INF is the trailing line (no next line at all)', () => {
    // Defends the `!uri` branch (undefined next line) of the lookahead check.
    const body = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1`;
    expect(() => rewriteMaster(body, VID)).toThrow(ManifestParseFailedException);
  });

  it('throws with the exact "missing #EXTM3U" message on a non-#EXTM3U start', () => {
    // Pins assertM3u8Header's error string so endsWith/== boundary mutants are killed.
    expect(() => rewriteMaster('#EXT-X-VERSION:6\n', VID)).toThrow(/missing #EXTM3U/);
  });
});

describe('isAllowedRendition', () => {
  it('returns true for each rendition in the allow-list', () => {
    expect(isAllowedRendition('1080p')).toBe(true);
    expect(isAllowedRendition('720p')).toBe(true);
    expect(isAllowedRendition('480p')).toBe(true);
    expect(isAllowedRendition('360p')).toBe(true);
  });
  it('returns false for anything outside the allow-list', () => {
    expect(isAllowedRendition('240p')).toBe(false);
    expect(isAllowedRendition('')).toBe(false);
    expect(isAllowedRendition('1080P')).toBe(false); // case-sensitive
  });
});

const RENDITION_720 = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:6
#EXT-X-KEY:METHOD=AES-128,URI="https://example.invalid/keys/abc",IV=0xABCDEF0123456789ABCDEF0123456789
#EXTINF:6.000,
segment_001.ts
#EXTINF:6.000,
segment_002.ts
#EXT-X-ENDLIST
`;

describe('rewriteRendition', () => {
  it('rewrites #EXT-X-KEY URI to /api/playback/keys/:vid and preserves IV', async () => {
    const out = await rewriteRendition(RENDITION_720, VID, async (s) => `signed://${s}`);
    expect(out).toContain(
      `#EXT-X-KEY:METHOD=AES-128,URI="/api/playback/keys/${VID}",IV=0xABCDEF0123456789ABCDEF0123456789`,
    );
  });

  it('signs each segment URI via the injected callback', async () => {
    const signed: string[] = [];
    const signer = async (s: string) => {
      signed.push(s);
      return `signed://${s}`;
    };
    const out = await rewriteRendition(RENDITION_720, VID, signer);
    expect(signed).toEqual(['segment_001.ts', 'segment_002.ts']);
    expect(out).toContain('signed://segment_001.ts');
    expect(out).toContain('signed://segment_002.ts');
  });

  it('passes through #EXT-X-KEY:METHOD=NONE unchanged (no URI substitution)', async () => {
    const body = `#EXTM3U\n#EXT-X-KEY:METHOD=NONE\n#EXT-X-ENDLIST\n`;
    const out = await rewriteRendition(body, VID, async () => 'unused');
    expect(out).toContain('#EXT-X-KEY:METHOD=NONE');
    expect(out).not.toContain('/api/playback/keys/');
  });

  it('does not double-sign already-signed URIs (http/https)', async () => {
    const body = `#EXTM3U
#EXTINF:6.000,
https://storage.googleapis.com/b/segment_001.ts?signature=xyz
#EXT-X-ENDLIST
`;
    const signer = vi.fn(async () => 'NEVER_CALLED');
    const out = await rewriteRendition(body, VID, signer);
    expect(signer).not.toHaveBeenCalled();
    expect(out).toContain('https://storage.googleapis.com/b/segment_001.ts?signature=xyz');
  });

  it('does not sign http:// URIs either', async () => {
    const body = `#EXTM3U\n#EXTINF:6.000,\nhttp://example/seg.ts\n#EXT-X-ENDLIST\n`;
    const signer = vi.fn(async () => 'X');
    const out = await rewriteRendition(body, VID, signer);
    expect(signer).not.toHaveBeenCalled();
    expect(out).toContain('http://example/seg.ts');
  });

  it('throws ManifestParseFailedException on missing #EXTM3U header', async () => {
    await expect(
      rewriteRendition('#EXT-X-VERSION:6\n', VID, async () => ''),
    ).rejects.toBeInstanceOf(ManifestParseFailedException);
  });
});
