export const OBJECT_STORAGE_CONFIG = Symbol.for('learnwren.api-object-storage.config');

export type ObjectStorageConfig = { publicBuckets: readonly string[] } & (
  | { kind: 'gcs' }
  | { kind: 's3'; endpoint: string; accessKey: string; secretKey: string; region: string }
);

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
  // Buckets whose objects GET /api/media/:bucket/:key serves to anyone (cover
  // images, profile pictures). Empty by default: nothing is public unless named.
  const publicBuckets = (env['LEARNWREN_PUBLIC_BUCKETS'] ?? '')
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);
  const raw = env['LEARNWREN_OBJECT_STORAGE'] ?? 'gcs';
  if (raw === 'gcs') return { kind: 'gcs', publicBuckets };
  if (raw !== 's3') {
    throw new Error(`LEARNWREN_OBJECT_STORAGE must be "gcs" or "s3", got "${raw}".`);
  }
  return {
    kind: 's3',
    publicBuckets,
    endpoint: readRequired(env, 'LEARNWREN_S3_ENDPOINT'),
    accessKey: readRequired(env, 'LEARNWREN_S3_ACCESS_KEY'),
    secretKey: readRequired(env, 'LEARNWREN_S3_SECRET_KEY'),
    region: env['LEARNWREN_S3_REGION'] ?? DEFAULT_REGION,
  };
}
