import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

import type { FirebaseStorageHandle } from '@learnwren/api-firebase';

import type { MultipartPart, ObjectRef, ObjectStorage } from './object-storage.port';

/** GCS errors expose a numeric `code`; 404 is the canonical "object missing" signal. */
function isNotFound(err: unknown): boolean {
  return (err as { code?: number }).code === 404;
}

function unsupported(method: string): never {
  throw new Error(`${method} is not supported on gcs object storage.`);
}

/** Cloud Storage for Firebase (and its emulator) through the Admin SDK handle. */
export class GcsObjectStorage implements ObjectStorage {
  readonly kind = 'gcs' as const;

  constructor(private readonly storage: FirebaseStorageHandle) {}

  async putObject(input: ObjectRef & {
    body: Buffer;
    contentType: string;
    cacheControl?: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    await this.file(input).save(input.body, {
      contentType: input.contentType,
      metadata: { cacheControl: input.cacheControl, metadata: input.metadata },
      resumable: false,
    });
  }

  async putFile(input: ObjectRef & { localPath: string; contentType: string }): Promise<void> {
    await this.storage.bucket(input.bucket).upload(input.localPath, {
      destination: input.path,
      contentType: input.contentType,
      resumable: false,
    });
  }

  async putStream(input: ObjectRef & { body: Readable; contentType: string }): Promise<void> {
    await pipeline(
      input.body,
      this.file(input).createWriteStream({ contentType: input.contentType, resumable: false }),
    );
  }

  async getObject(input: ObjectRef): Promise<Buffer> {
    const [buf] = await this.file(input).download();
    return buf;
  }

  async downloadToFile(input: ObjectRef & { destination: string }): Promise<void> {
    await this.file(input).download({ destination: input.destination });
  }

  openReadStream(input: ObjectRef): NodeJS.ReadableStream {
    return this.file(input).createReadStream();
  }

  async headObject(input: ObjectRef): Promise<{ size: number; contentType?: string } | null> {
    try {
      const [meta] = await this.file(input).getMetadata();
      // Stryker disable next-line ConditionalExpression: equivalent — Number(n) === n for a number, so forcing the string branch is unobservable
      const size = typeof meta.size === 'string' ? Number(meta.size) : (meta.size as number);
      return { size, ...(meta.contentType ? { contentType: meta.contentType } : {}) };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async deleteObject(input: ObjectRef): Promise<void> {
    try {
      await this.file(input).delete();
    } catch (err) {
      if (isNotFound(err)) return;
      throw err;
    }
  }

  async deletePrefix(input: { bucket: string; prefix: string }): Promise<void> {
    await this.storage.bucket(input.bucket).deleteFiles({ prefix: input.prefix });
  }

  async ensureBucket(): Promise<void> {
    // Cloud buckets are provisioned out of band (see docs/deployment.md).
  }

  async totalBytes(bucket: string): Promise<number> {
    const [files] = await this.storage.bucket(bucket).getFiles();
    return files.reduce((sum, f) => sum + Number(f.metadata.size ?? 0), 0);
  }

  async signReadUrl(input: ObjectRef & {
    ttlSec: number;
    responseDisposition?: string;
    responseType?: string;
  }): Promise<string> {
    const [url] = await this.file(input).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + input.ttlSec * 1000,
      ...(input.responseDisposition ? { responseDisposition: input.responseDisposition } : {}),
      ...(input.responseType ? { responseType: input.responseType } : {}),
    });
    return url;
  }

  async signWriteUrl(input: ObjectRef & { contentType: string; ttlSec: number }): Promise<string> {
    const [url] = await this.file(input).getSignedUrl({
      version: 'v4',
      action: 'write',
      contentType: input.contentType,
      expires: Date.now() + input.ttlSec * 1000,
    });
    return url;
  }

  async createResumableUpload(input: ObjectRef & {
    contentType: string;
    metadata: Record<string, string>;
    origin: string;
  }): Promise<string> {
    const [uri] = await this.file(input).createResumableUpload({
      metadata: { contentType: input.contentType, metadata: input.metadata },
      origin: input.origin,
    });
    return uri;
  }

  async createMultipartUpload(): Promise<string> {
    return unsupported('createMultipartUpload');
  }

  async uploadPart(): Promise<string> {
    return unsupported('uploadPart');
  }

  async completeMultipartUpload(): Promise<void> {
    unsupported('completeMultipartUpload');
  }

  async abortMultipartUpload(): Promise<void> {
    unsupported('abortMultipartUpload');
  }

  private file(input: ObjectRef) {
    return this.storage.bucket(input.bucket).file(input.path);
  }
}
