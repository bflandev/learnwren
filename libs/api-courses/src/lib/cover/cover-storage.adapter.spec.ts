import { describe, expect, it, vi } from 'vitest';

import type { FirebaseStorageHandle } from '@learnwren/api-firebase';

import type { CoverConfig } from './cover.config';
import {
  COVER_STORAGE,
  FirebaseCoverStorageAdapter,
} from './cover-storage.adapter';

const CFG: CoverConfig = {
  bucket: 'my-bucket',
  publicBaseUrl: 'https://cdn.example',
  impl: 'firebase',
};

function makeStorage(fileOverrides: { save?: ReturnType<typeof vi.fn>; delete?: ReturnType<typeof vi.fn> } = {}) {
  const save = fileOverrides.save ?? vi.fn(async () => undefined);
  const del = fileOverrides.delete ?? vi.fn(async () => undefined);
  const file = vi.fn((path: string) => ({ path, save, delete: del }));
  const bucket = vi.fn((name: string) => ({ name, file }));
  const storage = { bucket } as unknown as FirebaseStorageHandle;
  return { storage, bucket, file, save, delete: del };
}

describe('FirebaseCoverStorageAdapter', () => {
  describe('putObject', () => {
    it('resolves the object via bucket(cfg.bucket).file(input.path)', async () => {
      const { storage, bucket, file } = makeStorage();
      const adapter = new FirebaseCoverStorageAdapter(storage, CFG);
      await adapter.putObject({
        path: 'course-covers/c1/cover.jpg',
        contentType: 'image/jpeg',
        body: Buffer.from('img'),
      });
      expect(bucket).toHaveBeenCalledWith('my-bucket');
      expect(file).toHaveBeenCalledWith('course-covers/c1/cover.jpg');
    });

    it('calls file.save with the body and the EXACT options object (contentType, nested metadata, resumable:false)', async () => {
      const { storage, save } = makeStorage();
      const adapter = new FirebaseCoverStorageAdapter(storage, CFG);
      const body = Buffer.from('the-bytes');
      await adapter.putObject({
        path: 'course-covers/c1/cover.jpg',
        contentType: 'image/jpeg',
        body,
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: { courseId: 'c1' },
      });
      expect(save).toHaveBeenCalledTimes(1);
      // Assert the precise call shape: kills the ObjectLiteral {} mutants on the
      // options object and its nested `metadata`, and the `resumable: false`
      // BooleanLiteral mutant.
      expect(save).toHaveBeenCalledWith(body, {
        contentType: 'image/jpeg',
        metadata: {
          cacheControl: 'public, max-age=31536000, immutable',
          metadata: { courseId: 'c1' },
        },
        resumable: false,
      });
    });

    it('passes resumable:false specifically (object-mode upload, never resumable)', async () => {
      const { storage, save } = makeStorage();
      const adapter = new FirebaseCoverStorageAdapter(storage, CFG);
      await adapter.putObject({
        path: 'p',
        contentType: 'image/png',
        body: Buffer.from('x'),
      });
      const opts = save.mock.calls[0]![1] as { resumable: boolean };
      expect(opts.resumable).toBe(false);
    });
  });

  describe('deleteObject', () => {
    it('calls file.delete with { ignoreNotFound: true }', async () => {
      const { storage, file, delete: del } = makeStorage();
      const adapter = new FirebaseCoverStorageAdapter(storage, CFG);
      await adapter.deleteObject({ path: 'course-covers/c1/cover.jpg' });
      expect(file).toHaveBeenCalledWith('course-covers/c1/cover.jpg');
      expect(del).toHaveBeenCalledTimes(1);
      // ignoreNotFound:true — kills the BooleanLiteral + ObjectLiteral mutants.
      expect(del).toHaveBeenCalledWith({ ignoreNotFound: true });
    });

    it('SWALLOWS a 404 error (resolves) — the object is already gone', async () => {
      const del = vi.fn(async () => {
        throw { code: 404 };
      });
      const { storage } = makeStorage({ delete: del });
      const adapter = new FirebaseCoverStorageAdapter(storage, CFG);
      await expect(adapter.deleteObject({ path: 'p' })).resolves.toBeUndefined();
    });

    it('RETHROWS a non-404 error (e.g. 500) — kills the equality + conditional mutants', async () => {
      const boom = { code: 500 };
      const del = vi.fn(async () => {
        throw boom;
      });
      const { storage } = makeStorage({ delete: del });
      const adapter = new FirebaseCoverStorageAdapter(storage, CFG);
      await expect(adapter.deleteObject({ path: 'p' })).rejects.toBe(boom);
    });

    it('RETHROWS an error with no code (undefined !== 404)', async () => {
      const boom = new Error('network down');
      const del = vi.fn(async () => {
        throw boom;
      });
      const { storage } = makeStorage({ delete: del });
      const adapter = new FirebaseCoverStorageAdapter(storage, CFG);
      await expect(adapter.deleteObject({ path: 'p' })).rejects.toBe(boom);
    });
  });

  it('COVER_STORAGE token has the exact registered key', () => {
    expect(Symbol.keyFor(COVER_STORAGE)).toBe('learnwren.api-courses.cover.storage');
  });
});
