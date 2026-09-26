import { Global, Module } from '@nestjs/common';

import { FIREBASE_STORAGE, type FirebaseStorageHandle } from '@learnwren/api-firebase';

import { GcsObjectStorage } from './gcs-object-storage';
import {
  OBJECT_STORAGE_CONFIG,
  readObjectStorageConfigFromEnv,
  type ObjectStorageConfig,
} from './object-storage.config';
import { OBJECT_STORAGE, type ObjectStorage } from './object-storage.port';
import { PublicMediaController } from './public-media.controller';
import { makeS3Client, S3ObjectStorage } from './s3-object-storage';

export function makeObjectStorage(cfg: ObjectStorageConfig, gcs: FirebaseStorageHandle): ObjectStorage {
  return cfg.kind === 's3' ? new S3ObjectStorage(makeS3Client(cfg)) : new GcsObjectStorage(gcs);
}

/** Global: every feature module injects OBJECT_STORAGE, none imports a vendor SDK. */
@Global()
@Module({
  controllers: [PublicMediaController],
  providers: [
    { provide: OBJECT_STORAGE_CONFIG, useFactory: () => readObjectStorageConfigFromEnv(process.env) },
    {
      provide: OBJECT_STORAGE,
      inject: [OBJECT_STORAGE_CONFIG, FIREBASE_STORAGE],
      useFactory: makeObjectStorage,
    },
  ],
  exports: [OBJECT_STORAGE, OBJECT_STORAGE_CONFIG],
})
export class ObjectStorageModule {}
