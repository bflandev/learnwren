import { Inject, Injectable } from '@nestjs/common';

import { FIREBASE_STORAGE, type FirebaseStorageHandle } from '@learnwren/api-firebase';

export interface ResumableSession {
  uri: string;
  expiresAt: string;
}

export interface ObjectMetadata {
  size: number;
}

export interface VideoStoragePort {
  createResumableSession(input: {
    bucket: string;
    path: string;
    contentType: string;
    videoId: string;
  }): Promise<ResumableSession>;
  headObject(input: { bucket: string; path: string }): Promise<ObjectMetadata | null>;
  deleteObject(input: { bucket: string; path: string }): Promise<void>;
}

@Injectable()
export class VideoStorageAdapter implements VideoStoragePort {
  constructor(
    @Inject(FIREBASE_STORAGE) private readonly storage: FirebaseStorageHandle,
  ) {}

  async createResumableSession(input: {
    bucket: string;
    path: string;
    contentType: string;
    videoId: string;
  }): Promise<ResumableSession> {
    const file = this.storage.bucket(input.bucket).file(input.path);
    const [uri] = await file.createResumableUpload({
      metadata: {
        contentType: input.contentType,
        metadata: { videoId: input.videoId },
      },
      origin: '*',
    });
    return {
      uri,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    };
  }

  async headObject(input: {
    bucket: string;
    path: string;
  }): Promise<ObjectMetadata | null> {
    const file = this.storage.bucket(input.bucket).file(input.path);
    try {
      const [meta] = await file.getMetadata();
      const size =
        typeof meta.size === 'string' ? Number(meta.size) : (meta.size as number);
      return { size };
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 404) return null;
      throw err;
    }
  }

  async deleteObject(input: { bucket: string; path: string }): Promise<void> {
    const file = this.storage.bucket(input.bucket).file(input.path);
    try {
      await file.delete();
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 404) return; // already gone — best-effort
      throw err;
    }
  }
}
