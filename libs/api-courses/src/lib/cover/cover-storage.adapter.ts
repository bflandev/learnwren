import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';

import { OBJECT_STORAGE, type ObjectStorage } from '@learnwren/api-object-storage';

import { COVER_CONFIG, type CoverConfig } from './cover.config';

export interface PutObjectInput {
  path: string;                          // e.g. course-covers/{courseId}/cover.jpg
  contentType: string;                   // e.g. image/jpeg
  body: Buffer;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface CoverStoragePort {
  putObject(input: PutObjectInput): Promise<void>;
  deleteObject(input: { path: string }): Promise<void>;
}

/** Cover images in the configured bucket, through the shared ObjectStorage port. */
@Injectable()
export class CoverStorageAdapter implements CoverStoragePort, OnModuleInit {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(COVER_CONFIG) private readonly cfg: CoverConfig,
  ) {}

  onModuleInit(): Promise<void> {
    return this.storage.ensureBucket(this.cfg.bucket);
  }

  async putObject(input: PutObjectInput): Promise<void> {
    await this.storage.putObject({ ...input, bucket: this.cfg.bucket });
  }

  async deleteObject(input: { path: string }): Promise<void> {
    await this.storage.deleteObject({ bucket: this.cfg.bucket, path: input.path });
  }
}

export const COVER_STORAGE = Symbol.for('learnwren.api-courses.cover.storage');
