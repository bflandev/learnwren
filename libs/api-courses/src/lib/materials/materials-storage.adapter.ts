import { Inject, Injectable } from '@nestjs/common';

import { OBJECT_STORAGE, type ObjectStorage } from '@learnwren/api-object-storage';
import type { ISODateString } from '@learnwren/shared-data-models';

import { MATERIALS_CONFIG, type MaterialsConfig } from './materials.config';

export interface SignedUploadUrl {
  uploadUrl: string;
  expiresAt: ISODateString;
}

export interface SignedDownloadUrl {
  downloadUrl: string;
  expiresAt: ISODateString;
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

/** Routes the browser uses when the api proxies material bytes (fake and S3 modes). */
export const MATERIAL_UPLOAD_PROXY_PATH = '/api/internal/uploads/materials';
export const MATERIAL_DOWNLOAD_PROXY_PATH = '/api/internal/downloads/materials';

function sanitizeFilename(name: string): string {
  return name.replace(/["\\\r\n]/g, '_');
}

/**
 * Lesson materials through the ObjectStorage port. GCS mints signed URLs the
 * browser uses directly; the in-memory fake and S3 mode both hand the browser
 * api routes instead (see MaterialsProxyController), so an S3 store never
 * needs to be reachable from outside.
 */
@Injectable()
export class MaterialsStorageAdapter implements MaterialsStoragePort {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(MATERIALS_CONFIG) private readonly cfg: MaterialsConfig,
  ) {}

  private get proxied(): boolean {
    return this.cfg.storageImpl === 'fake' || this.storage.kind === 's3';
  }

  async signUploadUrl(input: {
    bucket: string;
    path: string;
    contentType: string;
    materialId: string;
  }): Promise<SignedUploadUrl> {
    const expiresMs = Date.now() + this.cfg.uploadUrlTtlSec * 1000;
    const uploadUrl = this.proxied
      ? `${MATERIAL_UPLOAD_PROXY_PATH}/${input.materialId}`
      : await this.storage.signWriteUrl({
          bucket: input.bucket,
          path: input.path,
          contentType: input.contentType,
          ttlSec: this.cfg.uploadUrlTtlSec,
        });
    return { uploadUrl, expiresAt: new Date(expiresMs).toISOString() as ISODateString };
  }

  headObject(input: { bucket: string; path: string }): Promise<MaterialObjectMetadata | null> {
    return this.storage.headObject(input);
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
    const downloadUrl = this.proxied
      ? `${MATERIAL_DOWNLOAD_PROXY_PATH}/${input.materialId}`
      : await this.storage.signReadUrl({
          bucket: input.bucket,
          path: input.path,
          ttlSec: input.ttlSec,
          responseDisposition: `attachment; filename="${sanitizeFilename(input.filename)}"`,
          responseType: input.contentType,
        });
    return { downloadUrl, expiresAt: new Date(expiresMs).toISOString() as ISODateString };
  }

  deleteObject(input: { bucket: string; path: string }): Promise<void> {
    return this.storage.deleteObject(input);
  }
}
