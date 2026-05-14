import { describe, expect, it } from 'vitest';

import type { VideoId } from '@learnwren/shared-data-models';

import { ManifestParseFailedException } from '../errors/video.exception';
import { ALLOWED_RENDITIONS, rewriteMaster } from './manifest.rewriter';

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
});
