import { Inject, Injectable } from '@nestjs/common';

import { OBJECT_STORAGE, type ObjectStorage } from '@learnwren/api-object-storage';

import { PICTURE_CONFIG, type PictureConfig } from './picture.config';

export interface PutObjectInput {
  path: string;
  contentType: string;
  body: Buffer;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface PictureStoragePort {
  putObject(input: PutObjectInput): Promise<void>;
  deleteObject(input: { path: string }): Promise<void>;
}

/** Profile pictures in the configured bucket, through the shared ObjectStorage port. */
@Injectable()
export class PictureStorageAdapter implements PictureStoragePort {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(PICTURE_CONFIG) private readonly cfg: PictureConfig,
  ) {}

  async putObject(input: PutObjectInput): Promise<void> {
    await this.storage.putObject({ ...input, bucket: this.cfg.bucket });
  }

  async deleteObject(input: { path: string }): Promise<void> {
    await this.storage.deleteObject({ bucket: this.cfg.bucket, path: input.path });
  }
}

export const PICTURE_STORAGE = Symbol.for('learnwren.api-profile.picture.storage');
