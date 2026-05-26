export const COVER_CONFIG = Symbol.for('learnwren.api-courses.cover.config');

export type CoverStorageImpl = 'firebase' | 'fake';

export interface CoverConfig {
  bucket: string;
  publicBaseUrl: string; // e.g. https://storage.googleapis.com/<bucket>  or  https://firebasestorage.googleapis.com/v0/b/<bucket>/o
  impl: CoverStorageImpl;
}

export function readCoverConfigFromEnv(
  env: Record<string, string | undefined>,
): CoverConfig {
  const bucket = env['LEARNWREN_COVER_BUCKET'];
  if (!bucket) {
    throw new Error('LEARNWREN_COVER_BUCKET is required.');
  }
  const publicBaseUrl = env['LEARNWREN_COVER_PUBLIC_BASE_URL'];
  if (!publicBaseUrl) {
    throw new Error('LEARNWREN_COVER_PUBLIC_BASE_URL is required.');
  }
  const raw = env['LEARNWREN_COVER_STORAGE'];
  const impl: CoverStorageImpl = raw === 'firebase' ? 'firebase' : 'fake';
  return { bucket, publicBaseUrl, impl };
}
