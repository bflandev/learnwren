export const PICTURE_CONFIG = Symbol.for('learnwren.api-profile.picture.config');

export type PictureStorageImpl = 'firebase' | 'fake';

export interface PictureConfig {
  bucket: string;
  publicBaseUrl: string;
  impl: PictureStorageImpl;
}

function requireEnv(env: Record<string, string | undefined>, name: string): string {
  const v = env[name];
  if (!v) {
    throw new Error(`${name} is required.`);
  }
  return v;
}

export function readPictureConfigFromEnv(
  env: Record<string, string | undefined>,
): PictureConfig {
  // Outside production the picture stack defaults to its credential-free fake
  // mode, so `nx serve` and the e2e suite boot with no GCP project or bucket.
  // Production still requires a real bucket + public base URL.
  const isProduction = env['NODE_ENV'] === 'production';

  const bucket = isProduction
    ? requireEnv(env, 'LEARNWREN_PICTURE_BUCKET')
    : (env['LEARNWREN_PICTURE_BUCKET'] ?? 'learnwren-dev-picture');
  const publicBaseUrl = isProduction
    ? requireEnv(env, 'LEARNWREN_PICTURE_PUBLIC_BASE_URL')
    : (env['LEARNWREN_PICTURE_PUBLIC_BASE_URL'] ?? `https://storage.googleapis.com/${bucket}`);

  const raw = env['LEARNWREN_PICTURE_STORAGE'];
  // Mirror video.config.ts: production defaults to the real adapter and
  // rejects an explicit fake; dev/test default to the credential-free fake.
  const impl: PictureStorageImpl =
    raw === 'firebase' || raw === 'fake' ? raw : isProduction ? 'firebase' : 'fake';
  if (impl === 'fake' && isProduction) {
    throw new Error('LEARNWREN_PICTURE_STORAGE=fake is rejected when NODE_ENV=production.');
  }
  return { bucket, publicBaseUrl, impl };
}
