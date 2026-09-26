import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { PassThrough, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';

import type { ObjectStorageConfig } from './object-storage.config';
import type { MultipartPart, ObjectRef, ObjectStorage } from './object-storage.port';

/** The slice of S3Client the store uses; lets tests inject a fake `send`. */
export type S3Sender = Pick<S3Client, 'send'>;

const DEFAULT_PART_BYTES = 8 * 1024 * 1024;

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404;
}

function notUsed(method: string): never {
  throw new Error(`${method} is not used in s3 mode (uploads and downloads pass through the api).`);
}

export function makeS3Client(cfg: Extract<ObjectStorageConfig, { kind: 's3' }>): S3Client {
  return new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
    // MinIO and most self-hosted stores serve buckets as path segments.
    forcePathStyle: true,
  });
}

/** Any S3-compatible object store (MinIO in the Compose stack). */
export class S3ObjectStorage implements ObjectStorage {
  readonly kind = 's3' as const;

  /** `partBytes` is the multipart chunk size for putStream (S3 minimum is 5 MiB). */
  constructor(
    private readonly client: S3Sender,
    private readonly partBytes: number = DEFAULT_PART_BYTES,
  ) {}

  async putObject(input: ObjectRef & {
    body: Buffer;
    contentType: string;
    cacheControl?: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.path,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: input.cacheControl,
        Metadata: input.metadata,
      }),
    );
  }

  async putFile(input: ObjectRef & { localPath: string; contentType: string }): Promise<void> {
    const { size } = await stat(input.localPath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.path,
        Body: createReadStream(input.localPath),
        ContentLength: size,
        ContentType: input.contentType,
      }),
    );
  }

  /**
   * Unknown-length body: buffer `partBytes` at a time. A body that fits in one
   * part becomes a single PutObject; anything larger becomes a multipart
   * upload, aborted on failure so no orphan parts are billed.
   */
  async putStream(input: ObjectRef & { body: Readable; contentType: string }): Promise<void> {
    let uploadId: string | undefined;
    const parts: MultipartPart[] = [];
    let pending: Buffer[] = [];
    let pendingBytes = 0;
    const flush = async (): Promise<void> => {
      const body = Buffer.concat(pending);
      pending = [];
      pendingBytes = 0;
      uploadId ??= await this.createMultipartUpload(input);
      const partNumber = parts.length + 1;
      parts.push({ partNumber, etag: await this.uploadPart({ ...input, uploadId, partNumber, body }) });
    };
    try {
      for await (const chunk of input.body) {
        const buf = Buffer.from(chunk as Uint8Array);
        pending.push(buf);
        pendingBytes += buf.length;
        if (pendingBytes >= this.partBytes) await flush();
      }
      if (uploadId === undefined) {
        await this.putObject({ ...input, body: Buffer.concat(pending) });
        return;
      }
      if (pendingBytes > 0) await flush();
      await this.completeMultipartUpload({ ...input, uploadId, parts });
    } catch (err) {
      if (uploadId !== undefined) await this.abortMultipartUpload({ ...input, uploadId }).catch(() => undefined);
      throw err;
    }
  }

  async getObject(input: ObjectRef): Promise<Buffer> {
    const body = await this.body(input);
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks);
  }

  async downloadToFile(input: ObjectRef & { destination: string }): Promise<void> {
    await pipeline(await this.body(input), createWriteStream(input.destination));
  }

  openReadStream(input: ObjectRef): NodeJS.ReadableStream {
    // The SDK call is async but callers pipe synchronously: hand back a
    // PassThrough and wire the body (or the error) into it when it arrives.
    const out = new PassThrough();
    this.body(input)
      .then((body) => body.pipe(out))
      .catch((err: Error) => out.destroy(err));
    return out;
  }

  async headObject(input: ObjectRef): Promise<{ size: number } | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: input.bucket, Key: input.path }));
      return { size: res.ContentLength ?? 0 };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async deleteObject(input: ObjectRef): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: input.bucket, Key: input.path }));
  }

  async deletePrefix(input: { bucket: string; prefix: string }): Promise<void> {
    for await (const page of this.listPages(input.bucket, input.prefix)) {
      const keys = page.map((o) => o.Key).filter((k): k is string => Boolean(k));
      if (keys.length === 0) continue;
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: input.bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
  }

  async totalBytes(bucket: string): Promise<number> {
    let sum = 0;
    for await (const page of this.listPages(bucket)) {
      for (const o of page) sum += o.Size ?? 0;
    }
    return sum;
  }

  async signReadUrl(): Promise<string> {
    return notUsed('signReadUrl');
  }

  async signWriteUrl(): Promise<string> {
    return notUsed('signWriteUrl');
  }

  async createResumableUpload(): Promise<string> {
    return notUsed('createResumableUpload');
  }

  async createMultipartUpload(input: ObjectRef & { contentType: string }): Promise<string> {
    const res = await this.client.send(
      new CreateMultipartUploadCommand({ Bucket: input.bucket, Key: input.path, ContentType: input.contentType }),
    );
    if (!res.UploadId) throw new Error('CreateMultipartUpload returned no UploadId.');
    return res.UploadId;
  }

  async uploadPart(input: ObjectRef & { uploadId: string; partNumber: number; body: Buffer }): Promise<string> {
    const res = await this.client.send(
      new UploadPartCommand({
        Bucket: input.bucket,
        Key: input.path,
        UploadId: input.uploadId,
        PartNumber: input.partNumber,
        Body: input.body,
        ContentLength: input.body.length,
      }),
    );
    return res.ETag ?? '';
  }

  async completeMultipartUpload(input: ObjectRef & { uploadId: string; parts: MultipartPart[] }): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: input.bucket,
        Key: input.path,
        UploadId: input.uploadId,
        MultipartUpload: { Parts: input.parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
      }),
    );
  }

  async abortMultipartUpload(input: ObjectRef & { uploadId: string }): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({ Bucket: input.bucket, Key: input.path, UploadId: input.uploadId }),
    );
  }

  private async body(input: ObjectRef): Promise<Readable> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: input.bucket, Key: input.path }));
    return res.Body as Readable;
  }

  private async *listPages(bucket: string, prefix?: string): AsyncGenerator<{ Key?: string; Size?: number }[]> {
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
      );
      yield res.Contents ?? [];
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
  }
}
