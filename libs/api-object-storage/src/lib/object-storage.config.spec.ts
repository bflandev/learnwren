import { describe, expect, it } from 'vitest';

import { readObjectStorageConfigFromEnv } from './object-storage.config';

describe('readObjectStorageConfigFromEnv', () => {
  it('defaults to gcs when unset', () => {
    expect(readObjectStorageConfigFromEnv({})).toEqual({ kind: 'gcs' });
  });

  it('accepts gcs explicitly', () => {
    expect(readObjectStorageConfigFromEnv({ LEARNWREN_OBJECT_STORAGE: 'gcs' })).toEqual({ kind: 'gcs' });
  });

  it('reads a complete s3 config with the region defaulted', () => {
    expect(
      readObjectStorageConfigFromEnv({
        LEARNWREN_OBJECT_STORAGE: 's3',
        LEARNWREN_S3_ENDPOINT: 'http://minio:9000',
        LEARNWREN_S3_ACCESS_KEY: 'ak',
        LEARNWREN_S3_SECRET_KEY: 'sk',
      }),
    ).toEqual({ kind: 's3', endpoint: 'http://minio:9000', accessKey: 'ak', secretKey: 'sk', region: 'us-east-1' });
  });

  it('honours an explicit region', () => {
    const cfg = readObjectStorageConfigFromEnv({
      LEARNWREN_OBJECT_STORAGE: 's3',
      LEARNWREN_S3_ENDPOINT: 'http://minio:9000',
      LEARNWREN_S3_ACCESS_KEY: 'ak',
      LEARNWREN_S3_SECRET_KEY: 'sk',
      LEARNWREN_S3_REGION: 'eu-west-1',
    });
    expect(cfg.kind === 's3' && cfg.region).toBe('eu-west-1');
  });

  it.each(['LEARNWREN_S3_ENDPOINT', 'LEARNWREN_S3_ACCESS_KEY', 'LEARNWREN_S3_SECRET_KEY'])(
    'fails startup when %s is missing in s3 mode',
    (missing) => {
      const env: Record<string, string> = {
        LEARNWREN_OBJECT_STORAGE: 's3',
        LEARNWREN_S3_ENDPOINT: 'http://minio:9000',
        LEARNWREN_S3_ACCESS_KEY: 'ak',
        LEARNWREN_S3_SECRET_KEY: 'sk',
      };
      delete env[missing];
      expect(() => readObjectStorageConfigFromEnv(env)).toThrow(new RegExp(`${missing}.*required`));
    },
  );

  it('rejects an unknown kind', () => {
    expect(() => readObjectStorageConfigFromEnv({ LEARNWREN_OBJECT_STORAGE: 'azure' })).toThrow(
      /LEARNWREN_OBJECT_STORAGE must be "gcs" or "s3", got "azure"/,
    );
  });
});
