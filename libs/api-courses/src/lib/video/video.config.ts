export const VIDEO_CONFIG = Symbol.for('learnwren.api-video.config');

export type TranscoderImpl = 'gcp' | 'fake';

export interface VideoConfig {
  sourceBucket: string;
  outputBucket: string;
  stuckThresholdMinutes: number;
  pollIntervalMs: number;
  playbackSignedUrlTtlSec: number;
  transcoderImpl: TranscoderImpl;
  playbackStorageImpl: 'real' | 'fake';
  sourceProbeImpl: 'real' | 'fake';
  // Present only when transcoderImpl === 'gcp':
  gcpProjectId?: string;
  transcoderLocation?: string;
  transcoderTopic?: string;
  webhookAudience?: string;
  invokerSaEmail?: string;
}

function readRequired(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name];
  if (!v) throw new Error(`${name} env var is required.`);
  return v;
}

function readPositiveNumber(env: NodeJS.ProcessEnv, name: string, dflt: string): number {
  const raw = env[name] ?? dflt;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive number, got "${raw}".`);
  }
  return n;
}

export function readVideoConfigFromEnv(env: NodeJS.ProcessEnv): VideoConfig {
  // Outside production the video stack defaults to its credential-free fake
  // mode, so `nx serve` and the e2e suite boot with no GCP project, buckets,
  // or secrets. Production still requires real buckets and a real transcoder.
  const isProduction = env['NODE_ENV'] === 'production';

  const sourceBucket = isProduction
    ? readRequired(env, 'LEARNWREN_VIDEO_SOURCE_BUCKET')
    : (env['LEARNWREN_VIDEO_SOURCE_BUCKET'] ?? 'learnwren-dev-source');
  const outputBucket = isProduction
    ? readRequired(env, 'LEARNWREN_VIDEO_OUTPUT_BUCKET')
    : (env['LEARNWREN_VIDEO_OUTPUT_BUCKET'] ?? 'learnwren-dev-output');
  const stuckThresholdMinutes = readPositiveNumber(
    env,
    'LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES',
    '30',
  );
  const pollIntervalMs = readPositiveNumber(
    env,
    'LEARNWREN_WEB_VIDEO_POLL_INTERVAL_MS',
    '5000',
  );
  const playbackSignedUrlTtlSec = readPositiveNumber(
    env,
    'LEARNWREN_VIDEO_PLAYBACK_SIGNED_URL_TTL_SEC',
    '14400',
  );

  const playbackFakeRaw = env['LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE'];
  let playbackStorageImpl: 'real' | 'fake';
  if (playbackFakeRaw === 'true') {
    playbackStorageImpl = 'fake';
  } else if (playbackFakeRaw === undefined) {
    playbackStorageImpl = isProduction ? 'real' : 'fake';
  } else {
    playbackStorageImpl = 'real';
  }
  if (playbackStorageImpl === 'fake' && isProduction) {
    throw new Error(
      'LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE=true is rejected when NODE_ENV=production.',
    );
  }

  const sourceProbeFakeRaw = env['LEARNWREN_VIDEO_STORAGE_SOURCE_PROBE_FAKE'];
  let sourceProbeImpl: 'real' | 'fake';
  if (sourceProbeFakeRaw === 'true') {
    sourceProbeImpl = 'fake';
  } else if (sourceProbeFakeRaw === undefined) {
    sourceProbeImpl = isProduction ? 'real' : 'fake';
  } else {
    sourceProbeImpl = 'real';
  }
  if (sourceProbeImpl === 'fake' && isProduction) {
    throw new Error(
      'LEARNWREN_VIDEO_STORAGE_SOURCE_PROBE_FAKE=true is rejected when NODE_ENV=production.',
    );
  }

  const implRaw = env['LEARNWREN_VIDEO_TRANSCODER'] ?? (isProduction ? 'gcp' : 'fake');
  if (implRaw !== 'gcp' && implRaw !== 'fake') {
    throw new Error(
      `LEARNWREN_VIDEO_TRANSCODER must be "gcp" or "fake", got "${implRaw}".`,
    );
  }
  if (implRaw === 'fake' && isProduction) {
    throw new Error(
      'LEARNWREN_VIDEO_TRANSCODER=fake is rejected when NODE_ENV=production.',
    );
  }

  const base: VideoConfig = {
    sourceBucket,
    outputBucket,
    stuckThresholdMinutes,
    pollIntervalMs,
    playbackSignedUrlTtlSec,
    transcoderImpl: implRaw,
    playbackStorageImpl,
    sourceProbeImpl,
  };

  if (implRaw === 'fake') return base;

  return {
    ...base,
    gcpProjectId: readRequired(env, 'LEARNWREN_GCP_PROJECT_ID'),
    transcoderLocation: readRequired(env, 'LEARNWREN_TRANSCODER_LOCATION'),
    transcoderTopic: readRequired(env, 'LEARNWREN_TRANSCODER_TOPIC'),
    webhookAudience: readRequired(env, 'LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE'),
    invokerSaEmail: readRequired(env, 'LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL'),
  };
}
