import { describe, expect, it, vi } from 'vitest';

import type { ObjectStorage } from '@learnwren/api-object-storage';

import type { CoverConfig } from './cover.config';
import { COVER_STORAGE, CoverStorageAdapter } from './cover-storage.adapter';

const CFG: CoverConfig = { bucket: 'my-bucket', publicBaseUrl: 'https://cdn.example', impl: 'firebase' };

function makeStorage() {
  const storage = { putObject: vi.fn(async () => undefined), deleteObject: vi.fn(async () => undefined) };
  return { storage, adapter: new CoverStorageAdapter(storage as unknown as ObjectStorage, CFG) };
}

describe('CoverStorageAdapter', () => {
  it('putObject writes to the configured bucket with every field passed through', async () => {
    const { storage, adapter } = makeStorage();
    const body = Buffer.from('the-bytes');
    await adapter.putObject({
      path: 'course-covers/c1/cover.jpg',
      contentType: 'image/jpeg',
      body,
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { courseId: 'c1' },
    });
    expect(storage.putObject).toHaveBeenCalledExactlyOnceWith({
      bucket: 'my-bucket',
      path: 'course-covers/c1/cover.jpg',
      contentType: 'image/jpeg',
      body,
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { courseId: 'c1' },
    });
  });

  it('deleteObject targets the configured bucket and path', async () => {
    const { storage, adapter } = makeStorage();
    await adapter.deleteObject({ path: 'course-covers/c1/cover.jpg' });
    expect(storage.deleteObject).toHaveBeenCalledExactlyOnceWith({ bucket: 'my-bucket', path: 'course-covers/c1/cover.jpg' });
  });

  it('propagates storage failures', async () => {
    const { storage, adapter } = makeStorage();
    storage.deleteObject.mockRejectedValueOnce(new Error('down'));
    await expect(adapter.deleteObject({ path: 'p' })).rejects.toThrow('down');
  });

  it('COVER_STORAGE token has the exact registered key', () => {
    expect(Symbol.keyFor(COVER_STORAGE)).toBe('learnwren.api-courses.cover.storage');
  });
});
