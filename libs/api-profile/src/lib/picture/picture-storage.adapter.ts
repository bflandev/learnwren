import { Inject, Injectable } from '@nestjs/common';

import { FIREBASE_STORAGE, type FirebaseStorageHandle } from '@learnwren/api-firebase';

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

@Injectable()
export class FirebasePictureStorageAdapter implements PictureStoragePort {
  constructor(
    @Inject(FIREBASE_STORAGE) private readonly storage: FirebaseStorageHandle,
    @Inject(PICTURE_CONFIG) private readonly cfg: PictureConfig,
  ) {}

  async putObject(input: PutObjectInput): Promise<void> {
    const file = this.storage.bucket(this.cfg.bucket).file(input.path);
    await file.save(input.body, {
      contentType: input.contentType,
      metadata: {
        cacheControl: input.cacheControl,
        metadata: input.metadata,
      },
      resumable: false,
    });
  }

  async deleteObject(input: { path: string }): Promise<void> {
    const file = this.storage.bucket(this.cfg.bucket).file(input.path);
    try {
      await file.delete({ ignoreNotFound: true });
    } catch (err) {
      if ((err as { code?: number }).code === 404) return;
      throw err;
    }
  }
}

export const PICTURE_STORAGE = Symbol.for('learnwren.api-profile.picture.storage');
