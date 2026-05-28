export const PICTURE_CONFIG = Symbol.for('learnwren.api-profile.picture.config');

export type PictureStorageImpl = 'firebase' | 'fake';

export interface PictureConfig {
  bucket: string;
  publicBaseUrl: string;
  impl: PictureStorageImpl;
}

export function readPictureConfigFromEnv(
  env: Record<string, string | undefined>,
): PictureConfig {
  const bucket = env['LEARNWREN_PICTURE_BUCKET'];
  if (!bucket) {
    throw new Error('LEARNWREN_PICTURE_BUCKET is required.');
  }
  const publicBaseUrl = env['LEARNWREN_PICTURE_PUBLIC_BASE_URL'];
  if (!publicBaseUrl) {
    throw new Error('LEARNWREN_PICTURE_PUBLIC_BASE_URL is required.');
  }
  const raw = env['LEARNWREN_PICTURE_STORAGE'];
  const impl: PictureStorageImpl = raw === 'firebase' ? 'firebase' : 'fake';
  return { bucket, publicBaseUrl, impl };
}
