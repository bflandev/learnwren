import { describe, expect, it } from 'vitest';

import type { VideoId, VideoKeyId } from '@learnwren/shared-data-models';

import { buildJobConfig, RENDITIONS } from './transcoder-job.builder';

const baseInput = () => ({
  videoId: 'v1' as VideoId,
  sourceUri: 'gs://src/videos/v1/source.mp4',
  outputUriPrefix: 'gs://out/videos/v1/hls/',
  encryptionKey: { id: 'k1' as VideoKeyId, bytes: new Uint8Array(16) },
  sourceHeight: 1080,
  topic: 'projects/p/topics/t',
});

describe('buildJobConfig', () => {
  it('emits one elementary video stream per applicable rendition', () => {
    const cfg = buildJobConfig(baseInput());
    const videoStreams = cfg.elementaryStreams.filter((s) => s.videoStream);
    expect(videoStreams).toHaveLength(RENDITIONS.length);
  });

  it('emits one elementary audio stream', () => {
    const cfg = buildJobConfig(baseInput());
    const audioStreams = cfg.elementaryStreams.filter((s) => s.audioStream);
    expect(audioStreams).toHaveLength(1);
    expect(audioStreams[0]!.audioStream!.bitrateBps).toBe(128_000);
  });

  it('filters renditions taller than the source', () => {
    const cfg = buildJobConfig({ ...baseInput(), sourceHeight: 480 });
    const heights = cfg.elementaryStreams
      .flatMap((s) => (s.videoStream ? [s.videoStream.h264!.heightPixels] : []))
      .sort((a, b) => a - b);
    expect(heights).toEqual([360, 480]);
  });

  it('emits one HLS mux stream per video rendition', () => {
    const cfg = buildJobConfig(baseInput());
    const hlsMux = cfg.muxStreams.filter((m) => m.container === 'ts');
    expect(hlsMux).toHaveLength(RENDITIONS.length);
  });

  it('configures AES-128 segment encryption with the supplied key bytes', () => {
    const bytes = new Uint8Array(16).fill(0x42);
    const cfg = buildJobConfig({
      ...baseInput(),
      encryptionKey: { id: 'k1' as VideoKeyId, bytes },
    });
    expect(cfg.encryptions).toBeDefined();
    expect(cfg.encryptions!).toHaveLength(1);
    const enc = cfg.encryptions![0]!;
    expect(enc.aes128).toBeDefined();
    expect(enc.secretManagerKeySource).toBeUndefined();
    expect(enc.id).toBe('k1');
  });

  it('routes job completion events to the configured Pub/Sub topic', () => {
    const cfg = buildJobConfig(baseInput());
    expect(cfg.pubsubDestination?.topic).toBe('projects/p/topics/t');
  });

  it('labels the job with the videoId for webhook correlation', () => {
    const cfg = buildJobConfig(baseInput());
    expect(cfg.labels?.['videoid']).toBe('v1');
  });

  it('wires HLS manifest at the conventional output path', () => {
    const cfg = buildJobConfig(baseInput());
    const manifest = cfg.manifests?.find((m) => m.type === 'HLS');
    expect(manifest?.fileName).toBe('manifest.m3u8');
    expect(cfg.output?.uri).toBe('gs://out/videos/v1/hls/');
  });

  it('uses 6-second segments and 2-second key-frame interval', () => {
    const cfg = buildJobConfig(baseInput());
    const muxTs = cfg.muxStreams.find((m) => m.container === 'ts')!;
    expect(muxTs.segmentSettings?.segmentDuration?.seconds).toBe(6);
    const stream = cfg.elementaryStreams.find((s) => s.videoStream)!;
    expect(stream.videoStream!.h264!.gopDuration?.seconds).toBe(2);
  });

  it('throws when sourceHeight is below the lowest rendition', () => {
    expect(() => buildJobConfig({ ...baseInput(), sourceHeight: 240 })).toThrow(
      'sourceHeight 240px is below the lowest supported rendition (360px).',
    );
  });

  it('wires input, elementary-stream, mux-stream and manifest keys consistently', () => {
    // A single rendition (sourceHeight 360) keeps the cross-references — which
    // the Transcoder API resolves by string key — exact and easy to assert.
    const cfg = buildJobConfig({ ...baseInput(), sourceHeight: 360 });

    expect(cfg.inputs).toEqual([{ key: 'input0', uri: 'gs://src/videos/v1/source.mp4' }]);

    expect(cfg.elementaryStreams.map((s) => s.key)).toEqual(['video_360p', 'audio_aac']);
    const audio = cfg.elementaryStreams.find((s) => s.audioStream)!;
    expect(audio.key).toBe('audio_aac');
    expect(audio.audioStream!.codec).toBe('aac');

    expect(cfg.muxStreams.map((m) => m.key)).toEqual(['hls_360p']);
    expect(cfg.muxStreams[0]!.elementaryStreams).toEqual(['video_360p', 'audio_aac']);

    expect(cfg.manifests![0]!.muxStreams).toEqual(['hls_360p']);
  });
});
