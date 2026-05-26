import { Injectable } from '@nestjs/common';

import type { CoverStoragePort, PutObjectInput } from './cover-storage.adapter';

interface StoredBlob {
  contentType: string;
  body: Buffer;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

@Injectable()
export class FakeCoverStorageAdapter implements CoverStoragePort {
  private readonly blobs = new Map<string, StoredBlob>();

  constructor(private readonly opts?: { bucket?: string }) {}

  async putObject(input: PutObjectInput): Promise<void> {
    this.blobs.set(input.path, {
      contentType: input.contentType,
      body: Buffer.from(input.body),
      cacheControl: input.cacheControl,
      metadata: input.metadata,
    });
  }

  async deleteObject(input: { path: string }): Promise<void> {
    this.blobs.delete(input.path);
  }

  // Test helpers — not part of the port.
  has(path: string): boolean {
    return this.blobs.has(path);
  }
  get(path: string): StoredBlob | undefined {
    return this.blobs.get(path);
  }
  clear(): void {
    this.blobs.clear();
  }
}
