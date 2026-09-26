export const OBJECT_STORAGE_CONFIG = Symbol.for('learnwren.api-object-storage.config');

export type ObjectStorageConfig =
  | { kind: 'gcs' }
  | { kind: 's3'; endpoint: string; accessKey: string; secretKey: string; region: string };

const DEFAULT_REGION = 'us-east-1';

function readRequired(env: Record<string, string | undefined>, name: string): string {
  const v = env[name];
  if (!v) throw new Error(`${name} is required when LEARNWREN_OBJECT_STORAGE=s3.`);
  return v;
}

/**
 * `LEARNWREN_OBJECT_STORAGE=gcs` (default: Cloud Storage for Firebase or its
 * emulator) or `s3` (any S3-compatible store; MinIO in the Compose stack).
 */
export function readObjectStorageConfigFromEnv(
  env: Record<string, string | undefined>,
): ObjectStorageConfig {
  const raw = env['LEARNWREN_OBJECT_STORAGE'] ?? 'gcs';
  if (raw === 'gcs') return { kind: 'gcs' };
  if (raw !== 's3') {
    throw new Error(`LEARNWREN_OBJECT_STORAGE must be "gcs" or "s3", got "${raw}".`);
  }
  return {
    kind: 's3',
    endpoint: readRequired(env, 'LEARNWREN_S3_ENDPOINT'),
    accessKey: readRequired(env, 'LEARNWREN_S3_ACCESS_KEY'),
    secretKey: readRequired(env, 'LEARNWREN_S3_SECRET_KEY'),
    region: env['LEARNWREN_S3_REGION'] ?? DEFAULT_REGION,
  };
}
