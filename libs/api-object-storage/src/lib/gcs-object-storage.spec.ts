import { describe, expect, it, vi } from 'vitest';

import { GcsObjectStorage } from './gcs-object-storage';

function makeHandle(fileOverrides: Record<string, unknown> = {}, bucketOverrides: Record<string, unknown> = {}) {
  const file = {
    save: vi.fn(async () => undefined),
    download: vi.fn(async () => [Buffer.from('body')]),
    createReadStream: vi.fn(() => ({ pipe: vi.fn() })),
    getMetadata: vi.fn(async () => [{ size: '12' }]),
    delete: vi.fn(async () => undefined),
    getSignedUrl: vi.fn(async () => ['https://signed']),
    createResumableUpload: vi.fn(async () => ['https://resumable']),
    ...fileOverrides,
  };
  const bucket = {
    file: vi.fn(() => file),
    upload: vi.fn(async () => undefined),
    deleteFiles: vi.fn(async () => undefined),
    getFiles: vi.fn(async () => [[{ metadata: { size: '5' } }, { metadata: { size: 7 } }, { metadata: {} }]]),
    ...bucketOverrides,
  };
  const handle = { bucket: vi.fn(() => bucket) };
  return { handle, bucket, file, storage: new GcsObjectStorage(handle as never) };
}

const ref = { bucket: 'b', path: 'dir/obj.bin' };

describe('GcsObjectStorage', () => {
  it('reports its kind', () => {
    expect(makeHandle().storage.kind).toBe('gcs');
  });

  it('putObject saves with content type, cache control and metadata, non-resumable', async () => {
    const { storage, handle, bucket, file } = makeHandle();
    await storage.putObject({ ...ref, body: Buffer.from('x'), contentType: 'image/jpeg', cacheControl: 'public', metadata: { a: '1' } });
    expect(handle.bucket).toHaveBeenCalledWith('b');
    expect(bucket.file).toHaveBeenCalledWith('dir/obj.bin');
    expect(file.save).toHaveBeenCalledWith(Buffer.from('x'), {
      contentType: 'image/jpeg',
      metadata: { cacheControl: 'public', metadata: { a: '1' } },
      resumable: false,
    });
  });

  it('putFile uploads a local file to the destination path', async () => {
    const { storage, bucket } = makeHandle();
    await storage.putFile({ ...ref, localPath: '/tmp/x', contentType: 'video/mp2t' });
    expect(bucket.upload).toHaveBeenCalledWith('/tmp/x', { destination: 'dir/obj.bin', contentType: 'video/mp2t', resumable: false });
  });

  it('putStream pipes into a write stream', async () => {
    const { Readable, Writable } = await import('node:stream');
    const chunks: Buffer[] = [];
    const sink = new Writable({ write(c, _e, cb) { chunks.push(c); cb(); } });
    const createWriteStream = vi.fn(() => sink);
    const { storage } = makeHandle({ createWriteStream });
    await storage.putStream({ ...ref, body: Readable.from([Buffer.from('ab'), Buffer.from('c')]), contentType: 'text/plain' });
    expect(createWriteStream).toHaveBeenCalledWith({ contentType: 'text/plain', resumable: false });
    expect(Buffer.concat(chunks).toString()).toBe('abc');
  });

  it('getObject downloads the buffer', async () => {
    const { storage } = makeHandle();
    expect((await storage.getObject(ref)).toString()).toBe('body');
  });

  it('downloadToFile passes the destination', async () => {
    const { storage, file } = makeHandle();
    await storage.downloadToFile({ ...ref, destination: '/tmp/d' });
    expect(file.download).toHaveBeenCalledWith({ destination: '/tmp/d' });
  });

  it('openReadStream returns the SDK stream', () => {
    const { storage, file } = makeHandle();
    const s = storage.openReadStream(ref);
    expect(file.createReadStream).toHaveBeenCalledOnce();
    expect(s).toBe(file.createReadStream.mock.results[0]!.value);
  });

  it('headObject returns the numeric size, and null on 404', async () => {
    expect(await makeHandle().storage.headObject(ref)).toEqual({ size: 12 });
    expect(await makeHandle({ getMetadata: vi.fn(async () => [{ size: 3 }]) }).storage.headObject(ref)).toEqual({ size: 3 });
    const notFound = makeHandle({ getMetadata: vi.fn(async () => { throw Object.assign(new Error('nf'), { code: 404 }); }) });
    expect(await notFound.storage.headObject(ref)).toBeNull();
    const boom = makeHandle({ getMetadata: vi.fn(async () => { throw Object.assign(new Error('x'), { code: 500 }); }) });
    await expect(boom.storage.headObject(ref)).rejects.toThrow('x');
  });

  it('deleteObject swallows 404 and rethrows anything else', async () => {
    await makeHandle({ delete: vi.fn(async () => { throw Object.assign(new Error('nf'), { code: 404 }); }) }).storage.deleteObject(ref);
    await expect(
      makeHandle({ delete: vi.fn(async () => { throw Object.assign(new Error('x'), { code: 403 }); }) }).storage.deleteObject(ref),
    ).rejects.toThrow('x');
  });

  it('deletePrefix delegates to deleteFiles', async () => {
    const { storage, bucket } = makeHandle();
    await storage.deletePrefix({ bucket: 'b', prefix: 'videos/v1/' });
    expect(bucket.deleteFiles).toHaveBeenCalledWith({ prefix: 'videos/v1/' });
  });

  it('totalBytes sums object sizes, treating missing sizes as 0', async () => {
    expect(await makeHandle().storage.totalBytes('b')).toBe(12);
  });

  it('signReadUrl mints a v4 read URL with disposition and type when given', async () => {
    const { storage, file } = makeHandle();
    const before = Date.now();
    const url = await storage.signReadUrl({ ...ref, ttlSec: 60, responseDisposition: 'attachment; filename="a.pdf"', responseType: 'application/pdf' });
    expect(url).toBe('https://signed');
    const arg = file.getSignedUrl.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg).toMatchObject({ version: 'v4', action: 'read', responseDisposition: 'attachment; filename="a.pdf"', responseType: 'application/pdf' });
    expect(arg['expires'] as number).toBeGreaterThanOrEqual(before + 60_000);
  });

  it('signReadUrl omits disposition and type when not given', async () => {
    const { storage, file } = makeHandle();
    await storage.signReadUrl({ ...ref, ttlSec: 60 });
    const arg = file.getSignedUrl.mock.calls[0]![0] as Record<string, unknown>;
    expect('responseDisposition' in arg).toBe(false);
    expect('responseType' in arg).toBe(false);
  });

  it('signWriteUrl mints a v4 write URL bound to the content type', async () => {
    const { storage, file } = makeHandle();
    await storage.signWriteUrl({ ...ref, contentType: 'application/pdf', ttlSec: 30 });
    expect(file.getSignedUrl.mock.calls[0]![0]).toMatchObject({ version: 'v4', action: 'write', contentType: 'application/pdf' });
  });

  it('createResumableUpload returns the session URI with metadata and origin', async () => {
    const { storage, file } = makeHandle();
    const uri = await storage.createResumableUpload({ ...ref, contentType: 'video/mp4', metadata: { videoId: 'v1' }, origin: 'http://app' });
    expect(uri).toBe('https://resumable');
    expect(file.createResumableUpload).toHaveBeenCalledWith({ metadata: { contentType: 'video/mp4', metadata: { videoId: 'v1' } }, origin: 'http://app' });
  });

  it('multipart methods are not supported on GCS', async () => {
    const { storage } = makeHandle();
    await expect(storage.createMultipartUpload({ ...ref, contentType: 'video/mp4' })).rejects.toThrow(/not supported on gcs/);
    await expect(storage.uploadPart({ ...ref, uploadId: 'u', partNumber: 1, body: Buffer.alloc(1) })).rejects.toThrow(/not supported on gcs/);
    await expect(storage.completeMultipartUpload({ ...ref, uploadId: 'u', parts: [] })).rejects.toThrow(/not supported on gcs/);
    await expect(storage.abortMultipartUpload({ ...ref, uploadId: 'u' })).rejects.toThrow(/not supported on gcs/);
  });
});
