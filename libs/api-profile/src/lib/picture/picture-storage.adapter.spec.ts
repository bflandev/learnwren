import { describe, expect, it, vi } from 'vitest';

import type { ObjectStorage } from '@learnwren/api-object-storage';

import { PICTURE_STORAGE, PictureStorageAdapter, type PictureStoragePort } from './picture-storage.adapter';

describe('PICTURE_STORAGE token', () => {
  it('is the registered global symbol with the exact key', () => {
    expect(Symbol.keyFor(PICTURE_STORAGE)).toBe('learnwren.api-profile.picture.storage');
    expect(PICTURE_STORAGE).toBe(Symbol.for('learnwren.api-profile.picture.storage'));
  });
});

const cfg = { bucket: 'b', publicBaseUrl: 'https://example.com', impl: 'firebase' as const };

function make() {
  const storage = { putObject: vi.fn(async () => undefined), deleteObject: vi.fn(async () => undefined) };
  const adapter: PictureStoragePort = new PictureStorageAdapter(storage as unknown as ObjectStorage, cfg);
  return { storage, adapter };
}

describe('PictureStorageAdapter', () => {
  it('putObject writes to the configured bucket with every field passed through', async () => {
    const { storage, adapter } = make();
    const body = Buffer.from('image-bytes');
    await adapter.putObject({
      path: 'profile-pictures/u1/avatar.jpg',
      contentType: 'image/jpeg',
      body,
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { uid: 'u1' },
    });
    expect(storage.putObject).toHaveBeenCalledExactlyOnceWith({
      bucket: 'b',
      path: 'profile-pictures/u1/avatar.jpg',
      contentType: 'image/jpeg',
      body,
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { uid: 'u1' },
    });
  });

  it('deleteObject targets the configured bucket and path', async () => {
    const { storage, adapter } = make();
    await adapter.deleteObject({ path: 'profile-pictures/u1/avatar.jpg' });
    expect(storage.deleteObject).toHaveBeenCalledExactlyOnceWith({ bucket: 'b', path: 'profile-pictures/u1/avatar.jpg' });
  });

  it('propagates storage failures', async () => {
    const { storage, adapter } = make();
    storage.putObject.mockRejectedValueOnce(new Error('down'));
    await expect(adapter.putObject({ path: 'p', contentType: 'image/png', body: Buffer.alloc(1) })).rejects.toThrow('down');
  });
});
