export const VIDEO_CONFIG = Symbol.for('learnwren.api-video.config');

export type TranscoderImpl = 'gcp' | 'fake';

export interface VideoConfig {
  sourceBucket: string;
  outputBucket: string;
  stuckThresholdMinutes: number;
  pollIntervalMs: number;
  transcoderImpl: TranscoderImpl;
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
  const sourceBucket = readRequired(env, 'LEARNWREN_VIDEO_SOURCE_BUCKET');
  const outputBucket = readRequired(env, 'LEARNWREN_VIDEO_OUTPUT_BUCKET');
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

  const implRaw = env['LEARNWREN_VIDEO_TRANSCODER'] ?? 'gcp';
  if (implRaw !== 'gcp' && implRaw !== 'fake') {
    throw new Error(
      `LEARNWREN_VIDEO_TRANSCODER must be "gcp" or "fake", got "${implRaw}".`,
    );
  }
  if (implRaw === 'fake' && env['NODE_ENV'] === 'production') {
    throw new Error(
      'LEARNWREN_VIDEO_TRANSCODER=fake is rejected when NODE_ENV=production.',
    );
  }

  const base: VideoConfig = {
    sourceBucket,
    outputBucket,
    stuckThresholdMinutes,
    pollIntervalMs,
    transcoderImpl: implRaw,
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
