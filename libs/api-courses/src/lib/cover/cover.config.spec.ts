import { describe, expect, it } from 'vitest';

import { readCoverConfigFromEnv } from './cover.config';

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

  it('throws when bucket is missing', () => {
    expect(() =>
      readCoverConfigFromEnv({ LEARNWREN_COVER_PUBLIC_BASE_URL: 'x' }),
    ).toThrow(/LEARNWREN_COVER_BUCKET/);
  });

  it('throws when publicBaseUrl is missing', () => {
    expect(() =>
      readCoverConfigFromEnv({ LEARNWREN_COVER_BUCKET: 'b' }),
    ).toThrow(/LEARNWREN_COVER_PUBLIC_BASE_URL/);
  });
});
