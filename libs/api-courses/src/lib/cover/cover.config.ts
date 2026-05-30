export const COVER_CONFIG = Symbol.for('learnwren.api-courses.cover.config');

export type CoverStorageImpl = 'firebase' | 'fake';

export interface CoverConfig {
  bucket: string;
  publicBaseUrl: string; // e.g. https://storage.googleapis.com/<bucket>  or  https://firebasestorage.googleapis.com/v0/b/<bucket>/o
  impl: CoverStorageImpl;
}

function requireEnv(env: Record<string, string | undefined>, name: string): string {
  const v = env[name];
  if (!v) {
    throw new Error(`${name} is required.`);
  }
  return v;
}

export function readCoverConfigFromEnv(
  env: Record<string, string | undefined>,
): CoverConfig {
  // Outside production the cover stack defaults to its credential-free fake
  // mode, so `nx serve` and the e2e suite boot with no GCP project or bucket.
  // Production still requires a real bucket + public base URL.
  const isProduction = env['NODE_ENV'] === 'production';

  const bucket = isProduction
    ? requireEnv(env, 'LEARNWREN_COVER_BUCKET')
    : (env['LEARNWREN_COVER_BUCKET'] ?? 'learnwren-dev-cover');
  const publicBaseUrl = isProduction
    ? requireEnv(env, 'LEARNWREN_COVER_PUBLIC_BASE_URL')
    : (env['LEARNWREN_COVER_PUBLIC_BASE_URL'] ?? `https://storage.googleapis.com/${bucket}`);

  const raw = env['LEARNWREN_COVER_STORAGE'];
  const impl: CoverStorageImpl = raw === 'firebase' ? 'firebase' : 'fake';
  return { bucket, publicBaseUrl, impl };
}
