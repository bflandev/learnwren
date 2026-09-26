import { Readable } from 'node:stream';

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_PART_BYTES, makeS3Client, S3ObjectStorage, type S3Sender } from './s3-object-storage';

const ref = { bucket: 'b', path: 'dir/obj.bin' };

function make(responder: (cmd: unknown) => unknown = () => ({}), partBytes?: number) {
  const send = vi.fn(async (cmd: unknown) => responder(cmd));
  const storage = new S3ObjectStorage({ send } as unknown as S3Sender, partBytes);
  return { storage, send, cmd: <T>(i = 0) => send.mock.calls[i]![0] as T };
}

async function collect(s: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of s as AsyncIterable<Buffer>) chunks.push(c);
  return Buffer.concat(chunks).toString();
}

describe('makeS3Client', () => {
  it('builds a path-style client on the configured endpoint, region and credentials', async () => {
    const client = makeS3Client({ kind: 's3', publicBuckets: [], endpoint: 'http://objectstore:9000', accessKey: 'ak', secretKey: 'sk', region: 'eu-west-1' });
    expect(client.config.forcePathStyle).toBe(true);
    expect(await client.config.region()).toBe('eu-west-1');
    const ep = await client.config.endpoint!();
    expect(`${ep.protocol}//${ep.hostname}:${ep.port}`).toBe('http://objectstore:9000');
    const creds = await client.config.credentials();
    expect(creds).toMatchObject({ accessKeyId: 'ak', secretAccessKey: 'sk' });
  });

  it('defaults to 8 MiB multipart parts', () => {
    expect(DEFAULT_PART_BYTES).toBe(8 * 1024 * 1024);
  });
});

describe('S3ObjectStorage', () => {
  it('reports its kind', () => {
    expect(make().storage.kind).toBe('s3');
  });

  it('putObject sends PutObject with type, cache control and metadata', async () => {
    const { storage, cmd } = make();
    await storage.putObject({ ...ref, body: Buffer.from('x'), contentType: 'image/jpeg', cacheControl: 'public', metadata: { a: '1' } });
    const c = cmd<PutObjectCommand>();
    expect(c).toBeInstanceOf(PutObjectCommand);
    expect(c.input).toEqual({ Bucket: 'b', Key: 'dir/obj.bin', Body: Buffer.from('x'), ContentType: 'image/jpeg', CacheControl: 'public', Metadata: { a: '1' } });
  });

  it('putFile streams the local file as a PutObject body', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(`${tmpdir()}/lw-s3-`);
    writeFileSync(`${dir}/f.ts`, 'segment');
    const { storage, cmd } = make();
    await storage.putFile({ ...ref, localPath: `${dir}/f.ts`, contentType: 'video/mp2t' });
    const c = cmd<PutObjectCommand>();
    expect(c).toBeInstanceOf(PutObjectCommand);
    expect(c.input.ContentType).toBe('video/mp2t');
    expect(c.input.ContentLength).toBe(7);
    expect(await collect(c.input.Body as Readable)).toBe('segment');
  });

  it('putStream uploads a body that fits one part as a single PutObject', async () => {
    const { storage, send, cmd } = make();
    await storage.putStream({ ...ref, body: Readable.from([Buffer.from('ab'), Buffer.from('c')]), contentType: 'text/plain' });
    expect(send).toHaveBeenCalledTimes(1);
    const put = cmd<PutObjectCommand>();
    expect(put).toBeInstanceOf(PutObjectCommand);
    expect(put.input).toMatchObject({ Bucket: 'b', Key: 'dir/obj.bin', ContentType: 'text/plain', Body: Buffer.from('abc') });
  });

  it('putStream switches to multipart once the part size is reached and completes in order', async () => {
    const { storage, send } = make((c) => {
      if (c instanceof CreateMultipartUploadCommand) return { UploadId: 'u' };
      if (c instanceof UploadPartCommand) return { ETag: `e${(c as UploadPartCommand).input.PartNumber}` };
      return {};
    }, 4);
    await storage.putStream({ ...ref, body: Readable.from([Buffer.from('abc'), Buffer.from('de'), Buffer.from('fghij'), Buffer.from('k')]), contentType: 'video/mp4' });
    const cmds = send.mock.calls.map((c) => c[0]);
    expect(cmds.map((c) => c.constructor.name)).toEqual([
      'CreateMultipartUploadCommand', 'UploadPartCommand', 'UploadPartCommand', 'UploadPartCommand', 'CompleteMultipartUploadCommand',
    ]);
    const parts = cmds.filter((c) => c instanceof UploadPartCommand) as UploadPartCommand[];
    expect(parts.map((p) => [p.input.PartNumber, (p.input.Body as Buffer).toString()])).toEqual([[1, 'abcde'], [2, 'fghij'], [3, 'k']]);
    expect((cmds[4] as CompleteMultipartUploadCommand).input.MultipartUpload).toEqual({
      Parts: [{ PartNumber: 1, ETag: 'e1' }, { PartNumber: 2, ETag: 'e2' }, { PartNumber: 3, ETag: 'e3' }],
    });
  });

  it('putStream completes with exactly the buffered parts when the body ends on a part boundary', async () => {
    const { storage, send } = make((c) => (c instanceof CreateMultipartUploadCommand ? { UploadId: 'u' } : { ETag: 'e' }), 4);
    await storage.putStream({ ...ref, body: Readable.from([Buffer.from('abcd')]), contentType: 'x' });
    expect(send.mock.calls.map((c) => c[0].constructor.name)).toEqual(['CreateMultipartUploadCommand', 'UploadPartCommand', 'CompleteMultipartUploadCommand']);
  });

  it('putStream aborts the multipart upload when a part fails, then rethrows', async () => {
    const { storage, send } = make((c) => {
      if (c instanceof CreateMultipartUploadCommand) return { UploadId: 'u' };
      if (c instanceof UploadPartCommand) throw new Error('part failed');
      return {};
    }, 2);
    await expect(storage.putStream({ ...ref, body: Readable.from([Buffer.from('abcd')]), contentType: 'x' })).rejects.toThrow('part failed');
    const abort = send.mock.calls.map((c) => c[0]).find((c) => c instanceof AbortMultipartUploadCommand) as AbortMultipartUploadCommand;
    expect(abort.input).toEqual({ Bucket: 'b', Key: 'dir/obj.bin', UploadId: 'u' });
  });

  it('putStream rethrows a single-put failure without trying to abort', async () => {
    const { storage, send } = make((c) => { if (c instanceof PutObjectCommand) throw new Error('put failed'); return {}; });
    await expect(storage.putStream({ ...ref, body: Readable.from([Buffer.from('a')]), contentType: 'x' })).rejects.toThrow('put failed');
    expect(send.mock.calls.some((c) => c[0] instanceof AbortMultipartUploadCommand)).toBe(false);
  });

  it('getObject collects the body', async () => {
    const { storage, cmd } = make(() => ({ Body: Readable.from([Buffer.from('bo'), Buffer.from('dy')]) }));
    expect((await storage.getObject(ref)).toString()).toBe('body');
    expect(cmd<GetObjectCommand>()).toBeInstanceOf(GetObjectCommand);
    expect(cmd<GetObjectCommand>().input).toEqual({ Bucket: 'b', Key: 'dir/obj.bin' });
  });

  it('downloadToFile writes the body to disk', async () => {
    const { mkdtempSync, readFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dest = `${mkdtempSync(`${tmpdir()}/lw-s3-`)}/out.bin`;
    const { storage } = make(() => ({ Body: Readable.from([Buffer.from('disk')]) }));
    await storage.downloadToFile({ ...ref, destination: dest });
    expect(readFileSync(dest, 'utf8')).toBe('disk');
  });

  it('openReadStream yields the object bytes and forwards errors', async () => {
    const ok = make(() => ({ Body: Readable.from([Buffer.from('a'), Buffer.from('b')]) }));
    expect(await collect(ok.storage.openReadStream(ref))).toBe('ab');
    const bad = make(() => { throw new Error('nope'); });
    await expect(collect(bad.storage.openReadStream(ref))).rejects.toThrow('nope');
  });

  it('ensureBucket creates the bucket only when HeadBucket says it is missing', async () => {
    const exists = make();
    await exists.storage.ensureBucket('b');
    expect(exists.send).toHaveBeenCalledOnce();
    expect(exists.cmd<HeadBucketCommand>()).toBeInstanceOf(HeadBucketCommand);
    expect(exists.cmd<HeadBucketCommand>().input).toEqual({ Bucket: 'b' });
    const missing = make((c) => { if (c instanceof HeadBucketCommand) throw Object.assign(new Error('nf'), { $metadata: { httpStatusCode: 404 } }); return {}; });
    await missing.storage.ensureBucket('b');
    expect(missing.cmd<CreateBucketCommand>(1)).toBeInstanceOf(CreateBucketCommand);
    expect(missing.cmd<CreateBucketCommand>(1).input).toEqual({ Bucket: 'b' });
    const denied = make((c) => { if (c instanceof HeadBucketCommand) throw Object.assign(new Error('denied'), { $metadata: { httpStatusCode: 403 } }); return {}; });
    await expect(denied.storage.ensureBucket('b')).rejects.toThrow('denied');
    expect(denied.send).toHaveBeenCalledOnce(); // no CreateBucket attempt on a non-404
  });

  it('headObject returns ContentLength (and ContentType when present), null on 404/NotFound, rethrows otherwise', async () => {
    const { storage, cmd } = make(() => ({ ContentLength: 9 }));
    expect(await storage.headObject(ref)).toEqual({ size: 9 });
    expect(cmd<HeadObjectCommand>().input).toEqual({ Bucket: 'b', Key: 'dir/obj.bin' });
    expect(await make(() => ({ ContentLength: 2, ContentType: 'image/png' })).storage.headObject(ref)).toEqual({ size: 2, contentType: 'image/png' });
    const plain = make(() => { throw new Error('plain failure'); });
    await expect(plain.storage.headObject(ref)).rejects.toThrow('plain failure');
    expect(cmd<HeadObjectCommand>()).toBeInstanceOf(HeadObjectCommand);
    const nf = make(() => { throw Object.assign(new Error('nf'), { $metadata: { httpStatusCode: 404 } }); });
    expect(await nf.storage.headObject(ref)).toBeNull();
    const named = make(() => { throw Object.assign(new Error('nf'), { name: 'NotFound' }); });
    expect(await named.storage.headObject(ref)).toBeNull();
    const boom = make(() => { throw Object.assign(new Error('x'), { $metadata: { httpStatusCode: 500 } }); });
    await expect(boom.storage.headObject(ref)).rejects.toThrow('x');
  });

  it('deleteObject sends DeleteObject', async () => {
    const { storage, cmd } = make();
    await storage.deleteObject(ref);
    expect(cmd<DeleteObjectCommand>()).toBeInstanceOf(DeleteObjectCommand);
    expect(cmd<DeleteObjectCommand>().input).toEqual({ Bucket: 'b', Key: 'dir/obj.bin' });
  });

  it('deletePrefix lists every page and batch-deletes, skipping empty pages', async () => {
    let page = 0;
    const { storage, send } = make((c) => {
      if (c instanceof ListObjectsV2Command) {
        page++;
        if (page === 1) return { Contents: [{ Key: 'p/1' }, { Key: 'p/2' }, {}], IsTruncated: true, NextContinuationToken: 't' };
        if (page === 2) return { IsTruncated: true, NextContinuationToken: 't2' };
        return { Contents: [{ Key: 'p/3' }] };
      }
      return {};
    });
    await storage.deletePrefix({ bucket: 'b', prefix: 'p/' });
    const lists = send.mock.calls.map((c) => c[0]).filter((c) => c instanceof ListObjectsV2Command) as ListObjectsV2Command[];
    expect(lists.map((l) => l.input.ContinuationToken)).toEqual([undefined, 't', 't2']);
    expect(lists[0]!.input).toMatchObject({ Bucket: 'b', Prefix: 'p/' });
    const dels = send.mock.calls.map((c) => c[0]).filter((c) => c instanceof DeleteObjectsCommand) as DeleteObjectsCommand[];
    expect(dels.map((d) => d.input.Delete!.Objects!.map((o) => o.Key))).toEqual([['p/1', 'p/2'], ['p/3']]);
    expect(dels.every((d) => d.input.Delete!.Quiet === true)).toBe(true);
  });

  it('totalBytes sums Size across pages', async () => {
    let page = 0;
    const { storage } = make((c) => {
      if (c instanceof ListObjectsV2Command) {
        page++;
        return page === 1
          ? { Contents: [{ Size: 5 }, { Size: 7 }], IsTruncated: true, NextContinuationToken: 't' }
          : { Contents: [{ Size: 1 }, {}] };
      }
      return {};
    });
    expect(await storage.totalBytes('b')).toBe(13);
    expect(await make(() => ({})).storage.totalBytes('empty')).toBe(0);
  });

  it('signed URLs and GCS resumable sessions are not used in s3 mode', async () => {
    const { storage } = make();
    await expect(storage.signReadUrl({ ...ref, ttlSec: 1 })).rejects.toThrow('signReadUrl is not used in s3 mode');
    await expect(storage.signWriteUrl({ ...ref, contentType: 'x', ttlSec: 1 })).rejects.toThrow('signWriteUrl is not used in s3 mode');
    await expect(storage.createResumableUpload({ ...ref, contentType: 'x', metadata: {}, origin: 'o' })).rejects.toThrow('createResumableUpload is not used in s3 mode');
  });

  it('multipart: create → part → complete → abort map to the S3 commands', async () => {
    const { storage, send, cmd } = make((c) => {
      if (c instanceof CreateMultipartUploadCommand) return { UploadId: 'up1' };
      if (c instanceof UploadPartCommand) return { ETag: '"et"' };
      return {};
    });
    expect(await storage.createMultipartUpload({ ...ref, contentType: 'video/mp4' })).toBe('up1');
    expect(cmd<CreateMultipartUploadCommand>(0).input).toEqual({ Bucket: 'b', Key: 'dir/obj.bin', ContentType: 'video/mp4' });
    expect(await storage.uploadPart({ ...ref, uploadId: 'up1', partNumber: 2, body: Buffer.from('p') })).toBe('"et"');
    expect(cmd<UploadPartCommand>(1).input).toEqual({ Bucket: 'b', Key: 'dir/obj.bin', UploadId: 'up1', PartNumber: 2, Body: Buffer.from('p'), ContentLength: 1 });
    await storage.completeMultipartUpload({ ...ref, uploadId: 'up1', parts: [{ partNumber: 1, etag: 'a' }, { partNumber: 2, etag: '"et"' }] });
    expect(cmd<CompleteMultipartUploadCommand>(2).input).toEqual({
      Bucket: 'b', Key: 'dir/obj.bin', UploadId: 'up1',
      MultipartUpload: { Parts: [{ PartNumber: 1, ETag: 'a' }, { PartNumber: 2, ETag: '"et"' }] },
    });
    await storage.abortMultipartUpload({ ...ref, uploadId: 'up1' });
    expect(cmd<AbortMultipartUploadCommand>(3).input).toEqual({ Bucket: 'b', Key: 'dir/obj.bin', UploadId: 'up1' });
    expect(send).toHaveBeenCalledTimes(4);
  });

  it('uploadPart returns an empty etag when S3 sends none', async () => {
    const { storage } = make(() => ({}));
    expect(await storage.uploadPart({ ...ref, uploadId: 'u', partNumber: 1, body: Buffer.alloc(1) })).toBe('');
  });

  it('createMultipartUpload fails loudly when S3 returns no UploadId', async () => {
    const { storage } = make(() => ({}));
    await expect(storage.createMultipartUpload({ ...ref, contentType: 'video/mp4' })).rejects.toThrow(/no UploadId/);
  });
});
