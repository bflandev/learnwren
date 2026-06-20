import { describe, expect, it } from 'vitest';

import { COVER_CONFIG, readCoverConfigFromEnv } from './cover.config';

describe('COVER_CONFIG', () => {
  it('has the exact registered key', () => {
    expect(Symbol.keyFor(COVER_CONFIG)).toBe('learnwren.api-courses.cover.config');
  });
});

describe('readCoverConfigFromEnv', () => {
  it('reads bucket and publicBaseUrl from env', () => {
    const cfg = readCoverConfigFromEnv({
      LEARNWREN_COVER_BUCKET: 'learnwren-covers',
      LEARNWREN_COVER_PUBLIC_BASE_URL: 'https://cdn.example.com',
      LEARNWREN_COVER_STORAGE: 'firebase',
    });
    expect(cfg).toEqual({
      bucket: 'learnwren-covers',
      publicBaseUrl: 'https://cdn.example.com',
      impl: 'firebase',
    });
  });

  it('defaults impl to "fake" when unset (dev/test posture)', () => {
    const cfg = readCoverConfigFromEnv({
      LEARNWREN_COVER_BUCKET: 'b',
      LEARNWREN_COVER_PUBLIC_BASE_URL: 'http://localhost:9199/v0/b/b/o',
    });
    expect(cfg.impl).toBe('fake');
  });

  it('defaults the cover stack to fake mode outside production', () => {
    // With no env at all the api must still boot — `nx serve` and the e2e
    // suite run credential-free.
    const cfg = readCoverConfigFromEnv({});
    expect(cfg.bucket).toBeTruthy();
    expect(cfg.publicBaseUrl).toBeTruthy();
    expect(cfg.impl).toBe('fake');
  });

  it('throws when bucket is missing in production', () => {
    expect(() =>
      readCoverConfigFromEnv({
        NODE_ENV: 'production',
        LEARNWREN_COVER_PUBLIC_BASE_URL: 'x',
      }),
    ).toThrow(/LEARNWREN_COVER_BUCKET/);
  });

  it('throws when publicBaseUrl is missing in production', () => {
    expect(() =>
      readCoverConfigFromEnv({
        NODE_ENV: 'production',
        LEARNWREN_COVER_BUCKET: 'b',
      }),
    ).toThrow(/LEARNWREN_COVER_PUBLIC_BASE_URL/);
  });

  it('defaults impl to "firebase" in production when LEARNWREN_COVER_STORAGE is unset', () => {
    // Without this, production would silently run the in-memory fake adapter
    // while the public base URL points at a real bucket that never gets objects.
    const cfg = readCoverConfigFromEnv({
      NODE_ENV: 'production',
      LEARNWREN_COVER_BUCKET: 'b',
      LEARNWREN_COVER_PUBLIC_BASE_URL: 'https://storage.googleapis.com/b',
    });
    expect(cfg.impl).toBe('firebase');
  });

  it('rejects an explicit LEARNWREN_COVER_STORAGE=fake in production', () => {
    expect(() =>
      readCoverConfigFromEnv({
        NODE_ENV: 'production',
        LEARNWREN_COVER_BUCKET: 'b',
        LEARNWREN_COVER_PUBLIC_BASE_URL: 'https://storage.googleapis.com/b',
        LEARNWREN_COVER_STORAGE: 'fake',
      }),
    ).toThrow(/LEARNWREN_COVER_STORAGE=fake is rejected when NODE_ENV=production/);
  });
});
