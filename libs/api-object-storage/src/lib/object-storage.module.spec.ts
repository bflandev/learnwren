import { afterEach, describe, expect, it, vi } from 'vitest';

import { GcsObjectStorage } from './gcs-object-storage';
import { OBJECT_STORAGE_CONFIG } from './object-storage.config';
import { makeObjectStorage, ObjectStorageModule } from './object-storage.module';
import { S3ObjectStorage } from './s3-object-storage';

describe('makeObjectStorage', () => {
  it('builds the GCS store over the Firebase handle', () => {
    const handle = { bucket: () => ({}) };
    expect(makeObjectStorage({ kind: 'gcs', publicBuckets: [] }, handle as never)).toBeInstanceOf(GcsObjectStorage);
  });

  it('builds an S3 store for s3 config', () => {
    const store = makeObjectStorage(
      { kind: 's3', publicBuckets: [], endpoint: 'http://minio:9000', accessKey: 'a', secretKey: 's', region: 'us-east-1' },
      {} as never,
    );
    expect(store).toBeInstanceOf(S3ObjectStorage);
    expect(store.kind).toBe('s3');
  });
});

describe('ObjectStorageModule', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reads OBJECT_STORAGE_CONFIG from process.env', () => {
    // Arrange
    vi.stubEnv('LEARNWREN_OBJECT_STORAGE', 'gcs');
    vi.stubEnv('LEARNWREN_PUBLIC_BUCKETS', 'covers');
    const providers = Reflect.getMetadata('providers', ObjectStorageModule) as Array<{ provide: unknown; useFactory: () => unknown }>;
    const configProvider = providers.find((p) => p.provide === OBJECT_STORAGE_CONFIG);

    // Act + Assert
    expect(configProvider?.useFactory()).toEqual({ kind: 'gcs', publicBuckets: ['covers'] });
  });
});
