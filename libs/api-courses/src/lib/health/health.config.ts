import { readVideoConfigFromEnv } from '../video/video.config';

export const HEALTH_CONFIG = Symbol.for('learnwren.api-health.config');

const BYTES_PER_GB = 1024 ** 3;

export interface HealthConfig {
  sourceBucket: string;
  outputBucket: string;
  storageImpl: 'real' | 'fake';
  transcoderImpl: 'gcp' | 'fake';
  /** Absent when LEARNWREN_STORAGE_QUOTA_GB is not configured. */
  storageQuotaBytes?: number;
}

export function readHealthConfigFromEnv(env: NodeJS.ProcessEnv): HealthConfig {
  const video = readVideoConfigFromEnv(env);

  const raw = env['LEARNWREN_STORAGE_QUOTA_GB'];
  let storageQuotaBytes: number | undefined;
  if (raw !== undefined && raw !== '') {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`LEARNWREN_STORAGE_QUOTA_GB must be a positive number, got "${raw}".`);
    }
    storageQuotaBytes = n * BYTES_PER_GB;
  }

  return {
    sourceBucket: video.sourceBucket,
    outputBucket: video.outputBucket,
    storageImpl: video.playbackStorageImpl,
    transcoderImpl: video.transcoderImpl,
    ...(storageQuotaBytes !== undefined ? { storageQuotaBytes } : {}),
  };
}
