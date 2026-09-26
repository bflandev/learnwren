import { describe, expect, it } from 'vitest';

import { GcsObjectStorage } from './gcs-object-storage';
import { makeObjectStorage } from './object-storage.module';
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
