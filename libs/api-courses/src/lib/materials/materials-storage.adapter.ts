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

/** GCS errors expose a numeric `code`; 404 is the canonical "object missing" signal. */
function isNotFound(err: unknown): boolean {
  return (err as { code?: number }).code === 404;
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
      return this.fakeSigned('uploadUrl', input.materialId, expiresMs);
    }
    const [url] = await this.fileRef(input).getSignedUrl({
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
    try {
      const [meta] = await this.fileRef(input).getMetadata();
      const size = typeof meta.size === 'string' ? Number(meta.size) : (meta.size as number);
      return { size };
    } catch (err) {
      if (isNotFound(err)) return null;
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
      return this.fakeSigned('downloadUrl', input.materialId, expiresMs);
    }
    const [url] = await this.fileRef(input).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: expiresMs,
      responseDisposition: `attachment; filename="${sanitizeFilename(input.filename)}"`,
      responseType: input.contentType,
    });
    return { downloadUrl: url, expiresAt: new Date(expiresMs).toISOString() };
  }

  async deleteObject(input: { bucket: string; path: string }): Promise<void> {
    try {
      await this.fileRef(input).delete();
    } catch (err) {
      if (isNotFound(err)) return;
      throw err;
    }
  }

  private fileRef(input: { bucket: string; path: string }) {
    return this.storage.bucket(input.bucket).file(input.path);
  }

  /**
   * Fake-mode signed-URL response: hands back a local API path the dev server
   * proxies through the internal fake-materials route. The key name is
   * parameterised so the same helper serves both upload and download flows.
   */
  private fakeSigned<K extends 'uploadUrl' | 'downloadUrl'>(
    key: K,
    materialId: string,
    expiresMs: number,
  ): { [P in K]: string } & { expiresAt: string } {
    return {
      [key]: `/api/internal/fake-materials/${materialId}`,
      expiresAt: new Date(expiresMs).toISOString(),
    } as { [P in K]: string } & { expiresAt: string };
  }
}
