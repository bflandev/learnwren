import { Inject, Injectable } from '@nestjs/common';

import { FIREBASE_STORAGE, type FirebaseStorageHandle } from '@learnwren/api-firebase';

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

/** Firebase Storage implementation. Selected when LEARNWREN_COVER_STORAGE=firebase. */
@Injectable()
export class FirebaseCoverStorageAdapter implements CoverStoragePort {
  constructor(
    @Inject(FIREBASE_STORAGE) private readonly storage: FirebaseStorageHandle,
    @Inject(COVER_CONFIG) private readonly cfg: CoverConfig,
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

export const COVER_STORAGE = Symbol.for('learnwren.api-courses.cover.storage');
