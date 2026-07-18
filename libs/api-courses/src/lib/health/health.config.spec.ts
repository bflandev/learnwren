import { describe, expect, it } from 'vitest';

import { HEALTH_CONFIG, readHealthConfigFromEnv } from './health.config';

// Non-production base: video config falls back to fake mode with dev buckets.
const BASE_ENV: NodeJS.ProcessEnv = { NODE_ENV: 'test' };

describe('readHealthConfigFromEnv', () => {
  it('derives buckets and impl flags from the video config', () => {
    const cfg = readHealthConfigFromEnv({ ...BASE_ENV });
    expect(cfg.sourceBucket).toBe('learnwren-dev-source');
    expect(cfg.outputBucket).toBe('learnwren-dev-output');
    expect(cfg.storageImpl).toBe('fake');
    expect(cfg.transcoderImpl).toBe('fake');
  });

  it('leaves storageQuotaBytes undefined when the quota env var is unset', () => {
    const cfg = readHealthConfigFromEnv({ ...BASE_ENV });
    expect(cfg.storageQuotaBytes).toBeUndefined();
  });

  it('converts LEARNWREN_STORAGE_QUOTA_GB to bytes', () => {
    const cfg = readHealthConfigFromEnv({ ...BASE_ENV, LEARNWREN_STORAGE_QUOTA_GB: '2' });
    expect(cfg.storageQuotaBytes).toBe(2 * 1024 ** 3);
  });

  it('rejects a non-numeric quota', () => {
    expect(() =>
      readHealthConfigFromEnv({ ...BASE_ENV, LEARNWREN_STORAGE_QUOTA_GB: 'lots' }),
    ).toThrow(/LEARNWREN_STORAGE_QUOTA_GB/);
  });

  it('rejects a zero or negative quota', () => {
    expect(() =>
      readHealthConfigFromEnv({ ...BASE_ENV, LEARNWREN_STORAGE_QUOTA_GB: '0' }),
    ).toThrow(/LEARNWREN_STORAGE_QUOTA_GB/);
    expect(() =>
      readHealthConfigFromEnv({ ...BASE_ENV, LEARNWREN_STORAGE_QUOTA_GB: '-1' }),
    ).toThrow(/LEARNWREN_STORAGE_QUOTA_GB/);
  });

  it('treats an empty-string quota as unset', () => {
    const cfg = readHealthConfigFromEnv({ ...BASE_ENV, LEARNWREN_STORAGE_QUOTA_GB: '' });
    expect(cfg.storageQuotaBytes).toBeUndefined();
  });

  it('omits the storageQuotaBytes key entirely (not undefined-valued) when unset', () => {
    const cfg = readHealthConfigFromEnv({ ...BASE_ENV });
    expect('storageQuotaBytes' in cfg).toBe(false);
  });

  it('registers the DI token under the stable well-known key', () => {
    expect(HEALTH_CONFIG.description).toBe('learnwren.api-health.config');
  });
});
