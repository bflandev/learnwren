import { describe, expect, it, vi } from 'vitest';
import { FirebasePictureStorageAdapter, type PictureStoragePort } from './picture-storage.adapter';

const cfg = { bucket: 'b', publicBaseUrl: 'https://example.com', impl: 'firebase' as const };

/**
 * Build a fake Firebase Storage handle whose bucket()/file()/save()/delete()
 * are all vi.fn()s so we can assert exact call arguments.
 */
function makeStorage(overrides?: {
  save?: ReturnType<typeof vi.fn>;
  delete?: ReturnType<typeof vi.fn>;
}) {
  const save = overrides?.save ?? vi.fn().mockResolvedValue(undefined);
  const del = overrides?.delete ?? vi.fn().mockResolvedValue(undefined);
  const file = vi.fn().mockReturnValue({ save, delete: del });
  const bucket = vi.fn().mockReturnValue({ file });
  const storage = { bucket };
  return { storage, bucket, file, save, delete: del };
}

describe('FirebasePictureStorageAdapter', () => {
  it('putObject targets the configured bucket and requested path', async () => {
    const { storage, bucket, file } = makeStorage();
    const a: PictureStoragePort = new FirebasePictureStorageAdapter(storage as never, cfg);
    await a.putObject({
      path: 'profile-pictures/u1/avatar.jpg',
      contentType: 'image/jpeg',
      body: Buffer.from('x'),
    });
    expect(bucket).toHaveBeenCalledWith('b');
    expect(file).toHaveBeenCalledWith('profile-pictures/u1/avatar.jpg');
  });

  it('putObject saves the buffer with exact save options (contentType, nested metadata, resumable:false)', async () => {
    const { storage, save } = makeStorage();
    const a = new FirebasePictureStorageAdapter(storage as never, cfg);
    const body = Buffer.from('image-bytes');
    await a.putObject({
      path: 'profile-pictures/u1/avatar.jpg',
      contentType: 'image/jpeg',
      body,
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { uid: 'u1' },
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(body, {
      contentType: 'image/jpeg',
      metadata: {
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: { uid: 'u1' },
      },
      resumable: false,
    });
  });

  it('putObject forwards undefined cacheControl/metadata verbatim into the nested metadata object', async () => {
    const { storage, save } = makeStorage();
    const a = new FirebasePictureStorageAdapter(storage as never, cfg);
    const body = Buffer.from('x');
    await a.putObject({
      path: 'p',
      contentType: 'image/png',
      body,
    });
    expect(save).toHaveBeenCalledWith(body, {
      contentType: 'image/png',
      metadata: {
        cacheControl: undefined,
        metadata: undefined,
      },
      resumable: false,
    });
  });

  it('deleteObject targets the configured bucket/path and passes ignoreNotFound:true', async () => {
    const { storage, bucket, file, delete: del } = makeStorage();
    const a = new FirebasePictureStorageAdapter(storage as never, cfg);
    await a.deleteObject({ path: 'profile-pictures/u1/avatar.jpg' });
    expect(bucket).toHaveBeenCalledWith('b');
    expect(file).toHaveBeenCalledWith('profile-pictures/u1/avatar.jpg');
    expect(del).toHaveBeenCalledWith({ ignoreNotFound: true });
  });

  it('deleteObject swallows a 404 from Storage', async () => {
    const del = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('not found'), { code: 404 }));
    const { storage } = makeStorage({ delete: del });
    const a = new FirebasePictureStorageAdapter(storage as never, cfg);
    await expect(
      a.deleteObject({ path: 'profile-pictures/u1/avatar.jpg' }),
    ).resolves.toBeUndefined();
  });

  it('deleteObject re-throws a non-404 error', async () => {
    const boom = Object.assign(new Error('permission denied'), { code: 403 });
    const del = vi.fn().mockRejectedValue(boom);
    const { storage } = makeStorage({ delete: del });
    const a = new FirebasePictureStorageAdapter(storage as never, cfg);
    await expect(a.deleteObject({ path: 'p' })).rejects.toBe(boom);
  });

  it('deleteObject re-throws an error with no code (code !== 404)', async () => {
    const boom = new Error('network');
    const del = vi.fn().mockRejectedValue(boom);
    const { storage } = makeStorage({ delete: del });
    const a = new FirebasePictureStorageAdapter(storage as never, cfg);
    await expect(a.deleteObject({ path: 'p' })).rejects.toBe(boom);
  });
});
