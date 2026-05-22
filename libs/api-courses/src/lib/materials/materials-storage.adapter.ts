import { Inject, Injectable } from '@nestjs/common';

import { FIREBASE_STORAGE, type FirebaseStorageHandle } from '@learnwren/api-firebase';

import { MATERIALS_CONFIG, type MaterialsConfig } from './materials.config';

export interface SignedUploadUrl {
  uploadUrl: string;
  expiresAt: string;
}

export interface SignedDownloadUrl {
  downloadUrl: string;
  expiresAt: string;
}

export interface MaterialObjectMetadata {
  size: number;
}

export interface MaterialsStoragePort {
  signUploadUrl(input: {
    bucket: string;
    path: string;
    contentType: string;
    materialId: string;
  }): Promise<SignedUploadUrl>;
  headObject(input: { bucket: string; path: string }): Promise<MaterialObjectMetadata | null>;
  signDownloadUrl(input: {
    bucket: string;
    path: string;
    filename: string;
    contentType: string;
    materialId: string;
    ttlSec: number;
  }): Promise<SignedDownloadUrl>;
  deleteObject(input: { bucket: string; path: string }): Promise<void>;
}

/** Strip characters that would break an HTTP Content-Disposition header value. */
function sanitizeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/["\\\r\n]/g, '_');
}

@Injectable()
export class MaterialsStorageAdapter implements MaterialsStoragePort {
  constructor(
    @Inject(FIREBASE_STORAGE) private readonly storage: FirebaseStorageHandle,
    @Inject(MATERIALS_CONFIG) private readonly cfg: MaterialsConfig,
  ) {}

  async signUploadUrl(input: {
    bucket: string;
    path: string;
    contentType: string;
    materialId: string;
  }): Promise<SignedUploadUrl> {
    const expiresMs = Date.now() + this.cfg.uploadUrlTtlSec * 1000;
    if (this.cfg.storageImpl === 'fake') {
      return {
        uploadUrl: `/api/internal/fake-materials/${input.materialId}`,
        expiresAt: new Date(expiresMs).toISOString(),
      };
    }
    const file = this.storage.bucket(input.bucket).file(input.path);
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      contentType: input.contentType,
      expires: expiresMs,
    });
    return { uploadUrl: url, expiresAt: new Date(expiresMs).toISOString() };
  }

  async headObject(input: {
    bucket: string;
    path: string;
  }): Promise<MaterialObjectMetadata | null> {
    const file = this.storage.bucket(input.bucket).file(input.path);
    try {
      const [meta] = await file.getMetadata();
      const size = typeof meta.size === 'string' ? Number(meta.size) : (meta.size as number);
      return { size };
    } catch (err) {
      if ((err as { code?: number }).code === 404) return null;
      throw err;
    }
  }

  async signDownloadUrl(input: {
    bucket: string;
    path: string;
    filename: string;
    contentType: string;
    materialId: string;
    ttlSec: number;
  }): Promise<SignedDownloadUrl> {
    const expiresMs = Date.now() + input.ttlSec * 1000;
    if (this.cfg.storageImpl === 'fake') {
      return {
        downloadUrl: `/api/internal/fake-materials/${input.materialId}`,
        expiresAt: new Date(expiresMs).toISOString(),
      };
    }
    const file = this.storage.bucket(input.bucket).file(input.path);
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: expiresMs,
      responseDisposition: `attachment; filename="${sanitizeFilename(input.filename)}"`,
      responseType: input.contentType,
    });
    return { downloadUrl: url, expiresAt: new Date(expiresMs).toISOString() };
  }

  async deleteObject(input: { bucket: string; path: string }): Promise<void> {
    const file = this.storage.bucket(input.bucket).file(input.path);
    try {
      await file.delete();
    } catch (err) {
      if ((err as { code?: number }).code === 404) return;
      throw err;
    }
  }
}
