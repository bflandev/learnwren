import { describe, expect, it } from 'vitest';
import { readPictureConfigFromEnv } from './picture.config';

describe('readPictureConfigFromEnv', () => {
  it('reads bucket, publicBaseUrl, defaults impl to fake', () => {
    const cfg = readPictureConfigFromEnv({
      LEARNWREN_PICTURE_BUCKET: 'b',
      LEARNWREN_PICTURE_PUBLIC_BASE_URL: 'https://example.com',
    });
    expect(cfg.bucket).toBe('b');
    expect(cfg.publicBaseUrl).toBe('https://example.com');
    expect(cfg.impl).toBe('fake');
  });

  it('selects firebase when LEARNWREN_PICTURE_STORAGE=firebase', () => {
    const cfg = readPictureConfigFromEnv({
      LEARNWREN_PICTURE_BUCKET: 'b',
      LEARNWREN_PICTURE_PUBLIC_BASE_URL: 'https://example.com',
      LEARNWREN_PICTURE_STORAGE: 'firebase',
    });
    expect(cfg.impl).toBe('firebase');
  });

  it('throws when LEARNWREN_PICTURE_BUCKET is missing', () => {
    expect(() => readPictureConfigFromEnv({ LEARNWREN_PICTURE_PUBLIC_BASE_URL: 'x' })).toThrow();
  });

  it('throws when LEARNWREN_PICTURE_PUBLIC_BASE_URL is missing', () => {
    expect(() => readPictureConfigFromEnv({ LEARNWREN_PICTURE_BUCKET: 'b' })).toThrow();
  });
});
