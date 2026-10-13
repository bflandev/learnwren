import { hlsMuxKey } from '../hls-naming';
import type { TranscoderJobInput } from './transcoder.port';

export const RENDITIONS = [
  { name: '1080p', height: 1080, bitrateBps: 5_000_000 },
  { name: '720p', height: 720, bitrateBps: 3_000_000 },
  { name: '480p', height: 480, bitrateBps: 1_500_000 },
  { name: '360p', height: 360, bitrateBps: 800_000 },
] as const;

const SEGMENT_DURATION_S = 6;
const KEY_FRAME_INTERVAL_S = 2;
const AUDIO_BITRATE_BPS = 128_000;

export interface JobConfig {
  inputs: { key: 'input0'; uri: string }[];
  output: { uri: string };
  elementaryStreams: ElementaryStream[];
  muxStreams: MuxStream[];
  manifests?: { fileName: string; type: 'HLS'; muxStreams: string[] }[];
  // Field names are the proto's (`aes_128`): the gRPC client silently DROPS
  // unknown fields, and `aes128` once vanished in transit — every job then
  // reached Google with no encryption mode and was rejected. The key itself
  // can only come from a Secret Manager version (JSON payload, see the adapter).
  encryptions: {
    id: string;
    aes_128: Record<string, never>;
    drmSystems: { clearkey: Record<string, never> };
    secretManagerKeySource: { secretVersion: string };
  }[];
  pubsubDestination?: { topic: string };
}

interface ElementaryStream {
  key: string;
  videoStream?: {
    h264: {
      heightPixels: number;
      bitrateBps: number;
      frameRate: number;
      gopDuration: { seconds: number };
    };
  };
  audioStream?: { codec: 'aac'; bitrateBps: number };
}

interface MuxStream {
  key: string;
  container: 'ts';
  elementaryStreams: string[];
  segmentSettings: { segmentDuration: { seconds: number } };
  encryptionId?: string;
}

export function buildJobConfig(input: TranscoderJobInput, keySecretVersion: string): JobConfig {
  const renditions = RENDITIONS.filter((r) => r.height <= input.sourceHeight);
  if (renditions.length === 0) {
    throw new Error(
      `sourceHeight ${input.sourceHeight}px is below the lowest supported rendition ` +
        `(${RENDITIONS[RENDITIONS.length - 1]!.height}px).`,
    );
  }

  const elementaryStreams: ElementaryStream[] = [
    ...renditions.map((r) => ({
      key: `video_${r.name}`,
      videoStream: {
        h264: {
          heightPixels: r.height,
          bitrateBps: r.bitrateBps,
          frameRate: 30,
          gopDuration: { seconds: KEY_FRAME_INTERVAL_S },
        },
      },
    })),
    { key: 'audio_aac', audioStream: { codec: 'aac', bitrateBps: AUDIO_BITRATE_BPS } },
  ];

  const muxStreams: MuxStream[] = renditions.map((r) => ({
    // GCP names the variant playlist after this key (`hls_1080p.m3u8`); the
    // playback layer recovers the rendition from it via the same helper.
    key: hlsMuxKey(r.name),
    container: 'ts',
    elementaryStreams: [`video_${r.name}`, 'audio_aac'],
    segmentSettings: { segmentDuration: { seconds: SEGMENT_DURATION_S } },
    encryptionId: input.encryptionKey.id,
  }));

  return {
    inputs: [{ key: 'input0', uri: input.sourceUri }],
    output: { uri: input.outputUriPrefix },
    elementaryStreams,
    muxStreams,
    manifests: [
      {
        fileName: 'manifest.m3u8',
        type: 'HLS',
        muxStreams: muxStreams.map((m) => m.key),
      },
    ],
    encryptions: [
      {
        id: input.encryptionKey.id,
        aes_128: {},
        drmSystems: { clearkey: {} },
        secretManagerKeySource: { secretVersion: keySecretVersion },
      },
    ],
    pubsubDestination: { topic: input.topic },
  };
}
