import { describe, expect, it } from 'vitest';

import { hlsMuxKey, hlsStreamInf, hlsVariantPlaylistName, RENDITION_RESOLUTIONS } from './hls-naming';

describe('hls-naming', () => {
  it('derives the mux key and flat variant playlist name', () => {
    expect(hlsMuxKey('720p')).toBe('hls_720p');
    expect(hlsVariantPlaylistName('720p')).toBe('hls_720p.m3u8');
  });

  it('emits the STREAM-INF line the GCP job and the fake both produce', () => {
    expect(hlsStreamInf('1080p', 5_000_000)).toBe(
      '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080',
    );
    expect(hlsStreamInf('480p', 1_500_000)).toBe(
      '#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=854x480',
    );
  });

  it('knows the 16:9 frame size of every ladder rendition', () => {
    expect(RENDITION_RESOLUTIONS).toEqual({
      '1080p': { width: 1920, height: 1080 },
      '720p': { width: 1280, height: 720 },
      '480p': { width: 854, height: 480 },
      '360p': { width: 640, height: 360 },
    });
  });

  it('refuses a rendition it has no resolution for', () => {
    expect(() => hlsStreamInf('4k', 1)).toThrow(/4k/);
  });
});
