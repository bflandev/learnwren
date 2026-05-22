import { describe, expect, it } from 'vitest';

import { readMaterialsConfigFromEnv } from './materials.config';

describe('readMaterialsConfigFromEnv', () => {
  it('defaults to fake storage and a dev bucket outside production', () => {
    const cfg = readMaterialsConfigFromEnv({});
    expect(cfg.storageImpl).toBe('fake');
    expect(cfg.materialsBucket).toBe('learnwren-dev-materials');
    expect(cfg.uploadUrlTtlSec).toBe(900);
    expect(cfg.downloadUrlTtlSec).toBe(900);
  });

  it('honours an explicit bucket name', () => {
    const cfg = readMaterialsConfigFromEnv({ LEARNWREN_MATERIALS_BUCKET: 'my-bucket' });
    expect(cfg.materialsBucket).toBe('my-bucket');
  });

  it('requires the bucket name in production', () => {
    expect(() =>
      readMaterialsConfigFromEnv({
        NODE_ENV: 'production',
        LEARNWREN_MATERIALS_STORAGE_FAKE: undefined,
      }),
    ).toThrow(/LEARNWREN_MATERIALS_BUCKET/);
  });

  it('defaults to real storage in production', () => {
    const cfg = readMaterialsConfigFromEnv({
      NODE_ENV: 'production',
      LEARNWREN_MATERIALS_BUCKET: 'prod-bucket',
    });
    expect(cfg.storageImpl).toBe('real');
  });

  it('rejects fake storage when NODE_ENV=production', () => {
    expect(() =>
      readMaterialsConfigFromEnv({
        NODE_ENV: 'production',
        LEARNWREN_MATERIALS_BUCKET: 'prod-bucket',
        LEARNWREN_MATERIALS_STORAGE_FAKE: 'true',
      }),
    ).toThrow(/production/i);
  });

  it('treats any non-"true" fake flag as real', () => {
    const cfg = readMaterialsConfigFromEnv({
      LEARNWREN_MATERIALS_BUCKET: 'b',
      LEARNWREN_MATERIALS_STORAGE_FAKE: 'yes',
    });
    expect(cfg.storageImpl).toBe('real');
  });

  it('parses TTL overrides', () => {
    const cfg = readMaterialsConfigFromEnv({
      LEARNWREN_MATERIALS_DOWNLOAD_URL_TTL_SEC: '600',
      LEARNWREN_MATERIALS_UPLOAD_URL_TTL_SEC: '120',
    });
    expect(cfg.downloadUrlTtlSec).toBe(600);
    expect(cfg.uploadUrlTtlSec).toBe(120);
  });

  it('rejects a non-positive TTL', () => {
    expect(() =>
      readMaterialsConfigFromEnv({ LEARNWREN_MATERIALS_DOWNLOAD_URL_TTL_SEC: '0' }),
    ).toThrow(/positive number/);
  });
});
