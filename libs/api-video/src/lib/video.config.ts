export const VIDEO_CONFIG = Symbol.for('learnwren.api-video.config');

export interface VideoConfig {
  sourceBucket: string;
  stuckThresholdMinutes: number;
}

export function readVideoConfigFromEnv(env: NodeJS.ProcessEnv): VideoConfig {
  const sourceBucket = env['LEARNWREN_VIDEO_SOURCE_BUCKET'];
  if (!sourceBucket) {
    throw new Error('LEARNWREN_VIDEO_SOURCE_BUCKET env var is required.');
  }
  const minutesRaw = env['LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES'] ?? '30';
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error(
      `LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES must be a positive number, got "${minutesRaw}".`,
    );
  }
  return { sourceBucket, stuckThresholdMinutes: minutes };
}
