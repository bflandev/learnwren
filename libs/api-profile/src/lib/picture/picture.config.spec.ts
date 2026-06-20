import { describe, expect, it } from 'vitest';
import { PICTURE_CONFIG, readPictureConfigFromEnv } from './picture.config';

describe('PICTURE_CONFIG token', () => {
  it('is the registered global symbol with the exact key', () => {
    expect(Symbol.keyFor(PICTURE_CONFIG)).toBe('learnwren.api-profile.picture.config');
    expect(PICTURE_CONFIG).toBe(Symbol.for('learnwren.api-profile.picture.config'));
  });
});

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

  it('defaults the picture stack to fake mode outside production', () => {
    // With no env at all the api must still boot — `nx serve` and the e2e
    // suite run credential-free.
    const cfg = readPictureConfigFromEnv({});
    expect(cfg.bucket).toBeTruthy();
    expect(cfg.publicBaseUrl).toBeTruthy();
    expect(cfg.impl).toBe('fake');
  });

  it('throws when LEARNWREN_PICTURE_BUCKET is missing in production', () => {
    expect(() =>
      readPictureConfigFromEnv({
        NODE_ENV: 'production',
        LEARNWREN_PICTURE_PUBLIC_BASE_URL: 'x',
      }),
    ).toThrow(/LEARNWREN_PICTURE_BUCKET/);
  });

  it('throws when LEARNWREN_PICTURE_PUBLIC_BASE_URL is missing in production', () => {
    expect(() =>
      readPictureConfigFromEnv({
        NODE_ENV: 'production',
        LEARNWREN_PICTURE_BUCKET: 'b',
      }),
    ).toThrow(/LEARNWREN_PICTURE_PUBLIC_BASE_URL/);
  });

  it('defaults impl to "firebase" in production when LEARNWREN_PICTURE_STORAGE is unset', () => {
    const cfg = readPictureConfigFromEnv({
      NODE_ENV: 'production',
      LEARNWREN_PICTURE_BUCKET: 'b',
      LEARNWREN_PICTURE_PUBLIC_BASE_URL: 'https://storage.googleapis.com/b',
    });
    expect(cfg.impl).toBe('firebase');
  });

  it('rejects an explicit LEARNWREN_PICTURE_STORAGE=fake in production', () => {
    expect(() =>
      readPictureConfigFromEnv({
        NODE_ENV: 'production',
        LEARNWREN_PICTURE_BUCKET: 'b',
        LEARNWREN_PICTURE_PUBLIC_BASE_URL: 'https://storage.googleapis.com/b',
        LEARNWREN_PICTURE_STORAGE: 'fake',
      }),
    ).toThrow(/LEARNWREN_PICTURE_STORAGE=fake is rejected when NODE_ENV=production/);
  });
});
