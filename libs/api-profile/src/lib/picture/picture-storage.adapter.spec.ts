import { describe, expect, it } from 'vitest';
import { FirebasePictureStorageAdapter, type PictureStoragePort } from './picture-storage.adapter';

describe('FirebasePictureStorageAdapter', () => {
  function makeStub() {
    const calls: Array<{ kind: 'save' | 'delete'; path: string; body?: Buffer; opts?: unknown }> = [];
    const fileApi = (path: string) => ({
      save: async (body: Buffer, opts: unknown) => { calls.push({ kind: 'save', path, body, opts }); },
      delete: async (opts: unknown) => { calls.push({ kind: 'delete', path, opts }); },
    });
    const storage = { bucket: () => ({ file: fileApi }) };
    return { calls, storage };
  }

  it('putObject saves the buffer with the right contentType + cacheControl + custom metadata', async () => {
    const { calls, storage } = makeStub();
    const cfg = { bucket: 'b', publicBaseUrl: 'https://example.com', impl: 'firebase' as const };
    const a: PictureStoragePort = new FirebasePictureStorageAdapter(storage as never, cfg);
    await a.putObject({
      path: 'profile-pictures/u1/avatar.jpg',
      contentType: 'image/jpeg',
      body: Buffer.from('x'),
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { uid: 'u1' },
    });
    expect(calls[0]).toMatchObject({
      kind: 'save',
      path: 'profile-pictures/u1/avatar.jpg',
    });
  });

  it('deleteObject swallows a 404 from Storage', async () => {
    const cfg = { bucket: 'b', publicBaseUrl: 'https://example.com', impl: 'firebase' as const };
    const storage = {
      bucket: () => ({
        file: () => ({
          delete: async () => { throw Object.assign(new Error('not found'), { code: 404 }); },
        }),
      }),
    };
    const a = new FirebasePictureStorageAdapter(storage as never, cfg);
    await expect(a.deleteObject({ path: 'profile-pictures/u1/avatar.jpg' })).resolves.toBeUndefined();
  });
});
