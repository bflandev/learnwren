import { once } from 'node:events';
import { Readable } from 'node:stream';

import express from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { ObjectStorage } from '@learnwren/api-object-storage';
import type { VideoId } from '@learnwren/shared-data-models';

import { MAX_CHUNK_BYTES, MIN_PART_BYTES, parseContentRange, VideoUploadProxyController } from './video-upload-proxy.controller';
import { VideoUploadSessions } from './video-upload-sessions';

const VID = 'v1' as VideoId;
const BIG = MIN_PART_BYTES; // one full part

function makeStorage() {
  let parts = 0;
  return {
    createMultipartUpload: vi.fn(async () => 'up1'),
    uploadPart: vi.fn(async () => `"etag${++parts}"`),
    completeMultipartUpload: vi.fn(async () => undefined),
    abortMultipartUpload: vi.fn(async () => undefined),
  };
}

function makeReq(body: Buffer, range?: string) {
  const req = Readable.from([body]) as unknown as { headers: Record<string, string | undefined> };
  req.headers = { 'content-range': range };
  return req as never;
}

/** Run the app's JSON body parser over a chunk request, as main.ts does for every route. */
async function throughJsonParser(body: Buffer, contentType: string, range: string) {
  const req = Readable.from([body]) as unknown as { headers: Record<string, string | undefined> };
  req.headers = { 'content-type': contentType, 'content-length': String(body.length), 'content-range': range };
  await new Promise<void>((resolve, reject) =>
    express.json({ limit: '100kb' })(req as never, {} as never, (err?: unknown) => (err ? reject(err) : resolve())),
  );
  return req as never;
}

function makeRes() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    status: vi.fn((c: number) => { res.statusCode = c; return res; }),
    set: vi.fn((k: string, v: string) => { res.headers[k] = v; return res; }),
    send: vi.fn(() => res),
    json: vi.fn((b: unknown) => { res.body = b; return res; }),
  };
  return res;
}

function make() {
  const sessions = new VideoUploadSessions();
  sessions.open(VID, { bucket: 'src', path: 'videos/v1/source.mp4', contentType: 'video/mp4' });
  const storage = makeStorage();
  const ctrl = new VideoUploadProxyController(sessions, storage as unknown as ObjectStorage);
  return { ctrl, sessions, storage };
}

describe('parseContentRange', () => {
  it('parses a well-formed header, including a single-byte range', () => {
    expect(parseContentRange('bytes 0-99/100')).toEqual({ start: 0, last: 99, total: 100 });
    expect(parseContentRange('bytes 5-5/10')).toEqual({ start: 5, last: 5, total: 10 });
  });

  it('names the problem in the detail', () => {
    expect(() => parseContentRange('nope')).toThrow(/malformed Content-Range/);
    expect(() => parseContentRange('bytes 10-5/100')).toThrow(/Content-Range out of bounds/);
  });

  it.each([undefined, '', 'bytes */100', 'bytes 0-99', 'bytes a-b/c', 'bytes 10-5/100', 'bytes 0-100/100', 'xbytes 0-1/2', 'bytes 0-1/2junk'])(
    'rejects %j',
    (h) => {
      expect(() => parseContentRange(h as string | undefined)).toThrow(/Invalid upload chunk/);
    },
  );
});

describe('VideoUploadProxyController.chunk', () => {
  it('uploads sequential chunks as parts, answers 308 with the received range, then completes with 200', async () => {
    const { ctrl, sessions, storage } = make();
    const total = BIG + 10;
    const res1 = makeRes();
    await ctrl.chunk(VID, makeReq(Buffer.alloc(BIG, 1), `bytes 0-${BIG - 1}/${total}`), res1 as never);
    expect(res1.statusCode).toBe(308);
    expect(res1.headers['Range']).toBe(`bytes=0-${BIG - 1}`);
    expect(storage.createMultipartUpload).toHaveBeenCalledExactlyOnceWith({ bucket: 'src', path: 'videos/v1/source.mp4', contentType: 'video/mp4' });
    expect(storage.uploadPart.mock.calls[0]![0]).toMatchObject({ uploadId: 'up1', partNumber: 1 });

    const res2 = makeRes();
    await ctrl.chunk(VID, makeReq(Buffer.alloc(10, 2), `bytes ${BIG}-${total - 1}/${total}`), res2 as never);
    expect(res2.statusCode).toBe(200);
    expect(res2.body).toEqual({ ok: true });
    expect(storage.uploadPart.mock.calls[1]![0]).toMatchObject({ uploadId: 'up1', partNumber: 2 });
    expect(storage.completeMultipartUpload).toHaveBeenCalledExactlyOnceWith({
      bucket: 'src',
      path: 'videos/v1/source.mp4',
      uploadId: 'up1',
      parts: [{ partNumber: 1, etag: '"etag1"' }, { partNumber: 2, etag: '"etag2"' }],
    });
    expect(sessions.get(VID)).toMatchObject({ completed: true });
  });

  it('answers 200 again for a retried final chunk after completion (the first 200 was lost), storing nothing', async () => {
    const { ctrl, storage } = make();
    await ctrl.chunk(VID, makeReq(Buffer.alloc(3), 'bytes 0-2/3'), makeRes() as never);
    const res = makeRes();
    await ctrl.chunk(VID, makeReq(Buffer.alloc(3), 'bytes 0-2/3'), res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(storage.uploadPart).toHaveBeenCalledOnce();
    expect(storage.completeMultipartUpload).toHaveBeenCalledOnce();
  });

  it('a single-chunk upload completes without a 308', async () => {
    const { ctrl, storage } = make();
    const res = makeRes();
    await ctrl.chunk(VID, makeReq(Buffer.alloc(3), 'bytes 0-2/3'), res as never);
    expect(res.statusCode).toBe(200);
    expect(storage.uploadPart).toHaveBeenCalledOnce();
    expect(storage.completeMultipartUpload).toHaveBeenCalledOnce();
  });

  it('re-acknowledges an already-received chunk without uploading it again', async () => {
    const { ctrl, storage } = make();
    const total = BIG * 2;
    await ctrl.chunk(VID, makeReq(Buffer.alloc(BIG), `bytes 0-${BIG - 1}/${total}`), makeRes() as never);
    const res = makeRes();
    await ctrl.chunk(VID, makeReq(Buffer.alloc(BIG), `bytes 0-${BIG - 1}/${total}`), res as never);
    expect(res.statusCode).toBe(308);
    expect(res.headers['Range']).toBe(`bytes=0-${BIG - 1}`);
    expect(storage.uploadPart).toHaveBeenCalledOnce();
  });

  it('a single-byte final chunk right at the received offset completes the upload (not a re-ack)', async () => {
    const { ctrl, storage } = make();
    const total = BIG + 1;
    await ctrl.chunk(VID, makeReq(Buffer.alloc(BIG), `bytes 0-${BIG - 1}/${total}`), makeRes() as never);
    const res = makeRes();
    await ctrl.chunk(VID, makeReq(Buffer.alloc(1), `bytes ${BIG}-${BIG}/${total}`), res as never);
    expect(res.statusCode).toBe(200);
    expect(storage.completeMultipartUpload).toHaveBeenCalledOnce();
  });

  it('rejects when the request stream errors while reading the body', async () => {
    const { ctrl } = make();
    const req = new Readable({ read() { /* driven manually */ } }) as unknown as { headers: Record<string, string | undefined> };
    req.headers = { 'content-range': 'bytes 0-2/3' };
    const pending = ctrl.chunk(VID, req as never, makeRes() as never);
    (req as unknown as Readable).emit('error', new Error('socket reset'));
    await expect(pending).rejects.toThrow('socket reset');
  });

  it('accepts an application/octet-stream chunk: the JSON body parser leaves it unread', async () => {
    const { ctrl, storage } = make();
    const req = await throughJsonParser(Buffer.from('abc'), 'application/octet-stream', 'bytes 0-2/3');
    const res = makeRes();
    await ctrl.chunk(VID, req, res as never);
    expect(res.statusCode).toBe(200);
    expect((storage.uploadPart.mock.calls[0]![0] as { body: Buffer }).body).toEqual(Buffer.from('abc'));
  });

  it('rejects at once (no hang) a chunk whose body a body parser already consumed, and stores nothing', async () => {
    const { ctrl, sessions, storage } = make();
    const req = await throughJsonParser(Buffer.from('{"a":1}'), 'application/json', 'bytes 0-6/7');
    await expect(ctrl.chunk(VID, req, makeRes() as never)).rejects.toMatchObject({
      code: 'UPLOAD_CHUNK_INVALID',
      status: 400,
      details: { detail: 'request body was already read; send the chunk as application/octet-stream' },
    });
    expect(storage.createMultipartUpload).not.toHaveBeenCalled();
    expect(sessions.get(VID)?.received).toBe(0);
  });

  it('rejects a Content-Range longer than MAX_CHUNK_BYTES before reading the body', async () => {
    const { ctrl, storage } = make();
    const req = Readable.from([Buffer.alloc(3)]) as unknown as Readable & { headers: Record<string, string> };
    req.headers = { 'content-range': `bytes 0-${MAX_CHUNK_BYTES}/${MAX_CHUNK_BYTES + 1}` };
    await expect(ctrl.chunk(VID, req as never, makeRes() as never)).rejects.toMatchObject({
      code: 'UPLOAD_CHUNK_INVALID',
      details: { detail: `chunk must be at most ${MAX_CHUNK_BYTES} bytes` },
    });
    expect(req.readableFlowing).toBeNull();
    expect(storage.createMultipartUpload).not.toHaveBeenCalled();
  });

  it('allows a Content-Range of exactly MAX_CHUNK_BYTES past the size cap', async () => {
    const { ctrl } = make();
    await expect(
      ctrl.chunk(VID, makeReq(Buffer.alloc(0), `bytes 0-${MAX_CHUNK_BYTES - 1}/${MAX_CHUNK_BYTES}`), makeRes() as never),
    ).rejects.toMatchObject({ details: { detail: 'body length does not match Content-Range' } });
  });

  it('stops reading and rejects once the body runs past the Content-Range, storing nothing', async () => {
    const { ctrl, storage } = make();
    const req = Readable.from([Buffer.alloc(2), Buffer.alloc(2), Buffer.alloc(2)]) as unknown as Readable & { headers: Record<string, string> };
    req.headers = { 'content-range': 'bytes 0-2/3' };
    await expect(ctrl.chunk(VID, req as never, makeRes() as never)).rejects.toMatchObject({
      code: 'UPLOAD_CHUNK_INVALID',
      details: { detail: 'body is longer than Content-Range' },
    });
    expect(req.destroyed).toBe(true);
    expect(storage.createMultipartUpload).not.toHaveBeenCalled();
  });

  it('accepts a body that fills the Content-Range exactly across several data events', async () => {
    const { ctrl, storage } = make();
    const req = Readable.from([Buffer.from('ab'), Buffer.from('c')]) as unknown as Readable & { headers: Record<string, string> };
    req.headers = { 'content-range': 'bytes 0-2/3' };
    const res = makeRes();
    await ctrl.chunk(VID, req as never, res as never);
    expect(res.statusCode).toBe(200);
    expect((storage.uploadPart.mock.calls[0]![0] as { body: Buffer }).body).toEqual(Buffer.from('abc'));
  });

  it('rejects when the client aborts mid-chunk, storing nothing', async () => {
    const { ctrl, storage } = make();
    const req = new Readable({ read() { /* driven manually */ } }) as Readable & { headers: Record<string, string> };
    req.headers = { 'content-range': 'bytes 0-2/3' };
    const pending = ctrl.chunk(VID, req as never, makeRes() as never);
    const firstData = once(req, 'data');
    req.push(Buffer.alloc(1));
    await firstData;
    req.destroy();
    await expect(pending).rejects.toMatchObject({ code: 'UPLOAD_CHUNK_INVALID', details: { detail: 'request aborted' } });
    expect(storage.createMultipartUpload).not.toHaveBeenCalled();
  });

  it('rejects at once a request the client hung up on before the handler ran', async () => {
    const { ctrl, storage } = make();
    const req = new Readable({ read() { /* never produces */ } }) as Readable & { headers: Record<string, string> };
    req.headers = { 'content-range': 'bytes 0-2/3' };
    req.destroy();
    await once(req, 'close');
    await expect(ctrl.chunk(VID, req as never, makeRes() as never)).rejects.toMatchObject({
      code: 'UPLOAD_CHUNK_INVALID',
      details: { detail: 'request aborted' },
    });
    expect(storage.createMultipartUpload).not.toHaveBeenCalled();
  });

  it('409s when no session is open', async () => {
    const storage = makeStorage();
    const ctrl = new VideoUploadProxyController(new VideoUploadSessions(), storage as unknown as ObjectStorage);
    await expect(ctrl.chunk(VID, makeReq(Buffer.alloc(3), 'bytes 0-2/3'), makeRes() as never)).rejects.toMatchObject({ code: 'UPLOAD_SESSION_MISSING', status: 409 });
    expect(storage.createMultipartUpload).not.toHaveBeenCalled();
  });

  it('400s on a malformed Content-Range before reading the body', async () => {
    const { ctrl, storage } = make();
    await expect(ctrl.chunk(VID, makeReq(Buffer.alloc(3), 'nope'), makeRes() as never)).rejects.toMatchObject({ code: 'UPLOAD_CHUNK_INVALID' });
    expect(storage.createMultipartUpload).not.toHaveBeenCalled();
  });

  it('400s when the body length disagrees with the range', async () => {
    const { ctrl } = make();
    await expect(ctrl.chunk(VID, makeReq(Buffer.alloc(2), 'bytes 0-2/3'), makeRes() as never)).rejects.toMatchObject({
      code: 'UPLOAD_CHUNK_INVALID',
      details: { detail: 'body length does not match Content-Range' },
    });
  });

  it('400s on a gap (chunk starts past the received offset)', async () => {
    const { ctrl } = make();
    await expect(ctrl.chunk(VID, makeReq(Buffer.alloc(3), 'bytes 5-7/100'), makeRes() as never)).rejects.toMatchObject({
      details: { detail: 'expected chunk to start at byte 0' },
    });
  });

  it('400s on an undersized non-final chunk', async () => {
    const { ctrl, storage } = make();
    await expect(ctrl.chunk(VID, makeReq(Buffer.alloc(10), 'bytes 0-9/100'), makeRes() as never)).rejects.toMatchObject({
      details: { detail: `non-final chunk must be at least ${MIN_PART_BYTES} bytes` },
    });
    expect(storage.createMultipartUpload).not.toHaveBeenCalled();
  });

  it('keeps the session after a transient part failure so the client retry succeeds', async () => {
    const { ctrl, sessions, storage } = make();
    const total = BIG * 2;
    await ctrl.chunk(VID, makeReq(Buffer.alloc(BIG), `bytes 0-${BIG - 1}/${total}`), makeRes() as never);
    storage.uploadPart.mockRejectedValueOnce(new Error('part failed'));
    const second = () => makeReq(Buffer.alloc(BIG), `bytes ${BIG}-${total - 1}/${total}`);
    await expect(ctrl.chunk(VID, second(), makeRes() as never)).rejects.toThrow('part failed');
    expect(storage.abortMultipartUpload).not.toHaveBeenCalled();
    expect(sessions.get(VID)).toMatchObject({ uploadId: 'up1', received: BIG, parts: [{ partNumber: 1 }] });

    const res = makeRes();
    await ctrl.chunk(VID, second(), res as never);
    expect(res.statusCode).toBe(200);
    expect(storage.uploadPart.mock.calls.at(-1)![0]).toMatchObject({ partNumber: 2 });
    expect(storage.completeMultipartUpload.mock.calls[0]![0]).toMatchObject({
      parts: [{ partNumber: 1 }, { partNumber: 2 }],
    });
  });

  it('a failed completion rolls the final part back so the retried final chunk completes', async () => {
    const { ctrl, storage } = make();
    storage.completeMultipartUpload.mockRejectedValueOnce(new Error('complete failed'));
    await expect(ctrl.chunk(VID, makeReq(Buffer.alloc(3), 'bytes 0-2/3'), makeRes() as never)).rejects.toThrow('complete failed');
    const res = makeRes();
    await ctrl.chunk(VID, makeReq(Buffer.alloc(3), 'bytes 0-2/3'), res as never);
    expect(res.statusCode).toBe(200);
    expect(storage.completeMultipartUpload.mock.calls[1]![0]).toMatchObject({ parts: [{ partNumber: 1 }] });
  });

  it('aborts a multipart upload created for a session that was discarded meanwhile, storing nothing', async () => {
    const { ctrl, sessions, storage } = make();
    let created!: (id: string) => void;
    storage.createMultipartUpload.mockReturnValueOnce(new Promise<string>((r) => (created = r)));
    const pending = ctrl.chunk(VID, makeReq(Buffer.alloc(3), 'bytes 0-2/3'), makeRes() as never);
    await new Promise((r) => setImmediate(r));
    sessions.close(VID); // video deleted / marked failed while the create was in flight
    created('late-upload');
    await expect(pending).rejects.toMatchObject({ code: 'UPLOAD_SESSION_MISSING' });
    expect(storage.abortMultipartUpload).toHaveBeenCalledWith({ bucket: 'src', path: 'videos/v1/source.mp4', uploadId: 'late-upload' });
    expect(storage.uploadPart).not.toHaveBeenCalled();
  });

  it('still answers UPLOAD_SESSION_MISSING when aborting the orphaned multipart upload fails', async () => {
    const { ctrl, sessions, storage } = make();
    let created!: (id: string) => void;
    storage.createMultipartUpload.mockReturnValueOnce(new Promise<string>((r) => (created = r)));
    storage.abortMultipartUpload.mockRejectedValueOnce(new Error('abort boom'));
    const pending = ctrl.chunk(VID, makeReq(Buffer.alloc(3), 'bytes 0-2/3'), makeRes() as never);
    await new Promise((r) => setImmediate(r));
    sessions.close(VID);
    created('late-upload');
    await expect(pending).rejects.toMatchObject({ code: 'UPLOAD_SESSION_MISSING' });
    expect(storage.abortMultipartUpload).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when the multipart upload cannot be created, so a retry creates it', async () => {
    const { ctrl, sessions, storage } = make();
    storage.createMultipartUpload.mockRejectedValueOnce(new Error('no store'));
    await expect(ctrl.chunk(VID, makeReq(Buffer.alloc(3), 'bytes 0-2/3'), makeRes() as never)).rejects.toThrow('no store');
    expect(storage.abortMultipartUpload).not.toHaveBeenCalled();
    expect(sessions.get(VID)).toMatchObject({ received: 0, parts: [] });
    const res = makeRes();
    await ctrl.chunk(VID, makeReq(Buffer.alloc(3), 'bytes 0-2/3'), res as never);
    expect(res.statusCode).toBe(200);
  });
});

describe('VideoUploadProxyController rate limiting', () => {
  it('is exempt from both per-IP throttler tiers (an upload at LAN speed sends ~12 chunks/s; the session + owner guards gate it)', () => {
    const handler = VideoUploadProxyController.prototype.chunk;
    expect(Reflect.getMetadata('THROTTLER:SKIPburst', handler)).toBe(true);
    expect(Reflect.getMetadata('THROTTLER:SKIPsustained', handler)).toBe(true);
  });
});

describe('VideoUploadProxyController concurrent chunks', () => {
  it('serialises a retried chunk that arrives while the first is still storing: one multipart upload, one part', async () => {
    const { ctrl, storage } = make();
    let release!: () => void;
    storage.uploadPart.mockImplementationOnce(
      () => new Promise<string>((r) => (release = () => r('"etag1"'))),
    );
    const total = BIG * 2;
    const req = () => makeReq(Buffer.alloc(BIG), `bytes 0-${BIG - 1}/${total}`);
    const first = makeRes();
    const retry = makeRes();
    const a = ctrl.chunk(VID, req(), first as never);
    const b = ctrl.chunk(VID, req(), retry as never);
    await new Promise((r) => setImmediate(r));
    release();
    await Promise.all([a, b]);
    expect(storage.createMultipartUpload).toHaveBeenCalledOnce();
    expect(storage.uploadPart).toHaveBeenCalledOnce();
    expect(first.statusCode).toBe(308);
    expect(retry.statusCode).toBe(308);
  });

  it('a failed chunk does not wedge the queue for the next one', async () => {
    const { ctrl, storage } = make();
    storage.uploadPart.mockRejectedValueOnce(new Error('part failed'));
    await expect(ctrl.chunk(VID, makeReq(Buffer.alloc(3), 'bytes 0-2/3'), makeRes() as never)).rejects.toThrow('part failed');
    const res = makeRes();
    await ctrl.chunk(VID, makeReq(Buffer.alloc(3), 'bytes 0-2/3'), res as never);
    expect(res.statusCode).toBe(200);
  });
});

describe('VideoUploadSessions', () => {
  it('lists sessions opened before a cutoff', () => {
    const s = new VideoUploadSessions();
    s.open('old', { bucket: 'b', path: 'p', contentType: 'video/mp4' }, 1_000);
    s.open('new', { bucket: 'b', path: 'p', contentType: 'video/mp4' }, 5_000);
    expect(s.openedBefore(5_000)).toEqual(['old']);
  });

  it('opens, reads and closes sessions', () => {
    const s = new VideoUploadSessions();
    expect(s.get('x')).toBeUndefined();
    s.open('x', { bucket: 'b', path: 'p', contentType: 'video/mp4' }, 42);
    expect(s.get('x')).toEqual({ bucket: 'b', path: 'p', contentType: 'video/mp4', parts: [], received: 0, openedAt: 42, tail: expect.any(Promise) });
    s.close('x');
    expect(s.get('x')).toBeUndefined();
  });
});
