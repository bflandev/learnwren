import type { Readable } from 'node:stream';

export const OBJECT_STORAGE = Symbol.for('learnwren.api-object-storage.storage');

export type ObjectStorageKind = 'gcs' | 's3';

export interface ObjectRef {
  bucket: string;
  path: string;
}

export interface MultipartPart {
  partNumber: number;
  etag: string;
}

/**
 * The one object-storage seam (US-09-04 Slice C). Every adapter that stores
 * or serves files depends on this, never on a vendor SDK. Two backends: GCS
 * (Cloud Storage for Firebase, and its emulator) and any S3-compatible store.
 *
 * `kind` is the only vendor-specific thing an adapter may branch on, and only
 * to decide which URL it hands the browser: GCS mints signed URLs / resumable
 * sessions; S3 mode routes uploads and downloads through the api. The methods
 * that exist for one backend only throw on the other.
 */
export interface ObjectStorage {
  readonly kind: ObjectStorageKind;

  putObject(input: ObjectRef & {
    body: Buffer;
    contentType: string;
    cacheControl?: string;
    metadata?: Record<string, string>;
  }): Promise<void>;
  putFile(input: ObjectRef & { localPath: string; contentType: string }): Promise<void>;
  putStream(input: ObjectRef & { body: Readable; contentType: string }): Promise<void>;
  getObject(input: ObjectRef): Promise<Buffer>;
  downloadToFile(input: ObjectRef & { destination: string }): Promise<void>;
  openReadStream(input: ObjectRef): NodeJS.ReadableStream;
  headObject(input: ObjectRef): Promise<{ size: number; contentType?: string } | null>;
  /** Idempotent: a missing object is not an error. */
  deleteObject(input: ObjectRef): Promise<void>;
  deletePrefix(input: { bucket: string; prefix: string }): Promise<void>;
  totalBytes(bucket: string): Promise<number>;
  /** Create the bucket if it does not exist (self-hosted stores start empty); a no-op on GCS. */
  ensureBucket(bucket: string): Promise<void>;

  // GCS only
  signReadUrl(input: ObjectRef & {
    ttlSec: number;
    responseDisposition?: string;
    responseType?: string;
  }): Promise<string>;
  signWriteUrl(input: ObjectRef & { contentType: string; ttlSec: number }): Promise<string>;
  createResumableUpload(input: ObjectRef & {
    contentType: string;
    metadata: Record<string, string>;
    origin: string;
  }): Promise<string>;

  // S3 only
  createMultipartUpload(input: ObjectRef & { contentType: string }): Promise<string>;
  uploadPart(input: ObjectRef & { uploadId: string; partNumber: number; body: Buffer }): Promise<string>;
  completeMultipartUpload(input: ObjectRef & { uploadId: string; parts: MultipartPart[] }): Promise<void>;
  abortMultipartUpload(input: ObjectRef & { uploadId: string }): Promise<void>;
}
