import { once } from 'node:events';
import { Readable } from 'node:stream';

import express from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { ObjectStorage } from '@learnwren/api-object-storage';
import type { Material, MaterialId } from '@learnwren/shared-data-models';

import { MaterialNotFoundException } from '../errors/material.exception';
import { MaterialsProxyController } from './materials-proxy.controller';

const material = {
  id: 'm1',
  contentType: 'application/pdf',
  originalFilename: 'doc.pdf',
  sizeBytes: 11,
  storage: { bucket: 'b', path: 'materials/m1/source.pdf' },
} as Material;

function repoReturning(value: Material | null) {
  return { get: vi.fn().mockResolvedValue(value) } as never;
}

async function drain(s: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of s) chunks.push(Buffer.from(c as Uint8Array));
  return Buffer.concat(chunks).toString();
}

/** putStream reads the body to the end before storing, like the S3 and GCS adapters. */
function makeStorage(body: Readable = Readable.from([Buffer.from('FILE-BYTES')])) {
  const stored = new Map<string, string>();
  return {
    stored,
    putStream: vi.fn(async (input: { path: string; body: Readable }) => {
      stored.set(input.path, await drain(input.body));
    }),
    openReadStream: vi.fn(() => body),
  };
}

/** Run the app's JSON body parser over an upload request, as main.ts does for every route. */
async function throughJsonParser(body: Buffer, contentType: string) {
  const req = Readable.from([body]) as unknown as { headers: Record<string, string> };
  req.headers = { 'content-type': contentType, 'content-length': String(body.length) };
  await new Promise<void>((resolve, reject) =>
    express.json({ limit: '100kb' })(req as never, {} as never, (err?: unknown) => (err ? reject(err) : resolve())),
  );
  return req as never;
}

function ctrlWith(storage: ReturnType<typeof makeStorage>) {
  return new MaterialsProxyController(repoReturning(material), storage as unknown as ObjectStorage);
}

function makeRes() {
  const headers: Record<string, string> = {};
  return { headers, set: vi.fn((k: string, v: string) => { headers[k] = v; }), destroy: vi.fn(), write: vi.fn(), end: vi.fn(), on: vi.fn(), once: vi.fn(), emit: vi.fn() };
}

describe('MaterialsProxyController.upload', () => {
  it('streams the request body into the material object with its content type', async () => {
    const storage = makeStorage();
    const req = Readable.from([Buffer.from('PDF-'), Buffer.from('PAYLOAD')]);
    const r = await ctrlWith(storage).upload('m1' as MaterialId, req as never);
    expect(r).toEqual({ ok: true });
    expect(storage.putStream).toHaveBeenCalledOnce();
    expect(storage.putStream.mock.calls[0]![0]).toMatchObject({ bucket: 'b', path: 'materials/m1/source.pdf', contentType: 'application/pdf' });
    expect(storage.stored.get('materials/m1/source.pdf')).toBe('PDF-PAYLOAD');
  });

  it('accepts the material content type the browser sends: the JSON body parser leaves it unread', async () => {
    const storage = makeStorage();
    const req = await throughJsonParser(Buffer.from('PDF-PAYLOAD'), 'application/pdf');
    await expect(ctrlWith(storage).upload('m1' as MaterialId, req)).resolves.toEqual({ ok: true });
    expect(storage.stored.get('materials/m1/source.pdf')).toBe('PDF-PAYLOAD');
  });

  it('rejects at once a body a body parser already consumed, and stores nothing', async () => {
    const storage = makeStorage();
    const req = await throughJsonParser(Buffer.from('{"a":"PAYLOAD"}'), 'application/json');
    await expect(ctrlWith(storage).upload('m1' as MaterialId, req)).rejects.toMatchObject({
      code: 'UPLOAD_BODY_INVALID',
      status: 400,
      details: { detail: 'request body was already read; send the file with its own content type' },
    });
    expect(storage.putStream).not.toHaveBeenCalled();
  });

  it('rejects an empty body and stores nothing', async () => {
    const storage = makeStorage();
    const pending = ctrlWith(storage).upload('m1' as MaterialId, Readable.from([]) as never);
    await expect(pending).rejects.toMatchObject({
      code: 'UPLOAD_BODY_INVALID',
      status: 400,
      details: { detail: 'body is shorter than the declared size' },
    });
    await expect(pending).rejects.toThrow('Invalid upload body: body is shorter than the declared size.');
    expect(storage.stored.size).toBe(0);
  });

  it('rejects a body one byte short of the declared size and stores nothing', async () => {
    const storage = makeStorage();
    await expect(ctrlWith(storage).upload('m1' as MaterialId, Readable.from([Buffer.from('PDF-PAYLOA')]) as never)).rejects.toMatchObject({
      details: { detail: 'body is shorter than the declared size' },
    });
    expect(storage.stored.size).toBe(0);
  });

  it('stops reading a body that runs past the declared size and stores nothing', async () => {
    const storage = makeStorage();
    const req = Readable.from([Buffer.from('PDF-PAYLOAD'), Buffer.from('X'), Buffer.from('MORE')]);
    await expect(ctrlWith(storage).upload('m1' as MaterialId, req as never)).rejects.toMatchObject({
      code: 'UPLOAD_BODY_INVALID',
      status: 400,
      details: { detail: 'body is longer than the declared size' },
    });
    expect(req.destroyed).toBe(true);
    expect(storage.stored.size).toBe(0);
  });

  it('rejects when the client aborts mid-upload and stores nothing', async () => {
    const storage = makeStorage();
    const req = new Readable({ read() { /* driven manually */ } });
    const pending = ctrlWith(storage).upload('m1' as MaterialId, req as never);
    await vi.waitFor(() => expect(storage.putStream).toHaveBeenCalled());
    const firstData = once(req, 'data');
    req.push(Buffer.from('PDF-'));
    await firstData;
    req.destroy();
    await expect(pending).rejects.toMatchObject({
      code: 'UPLOAD_BODY_INVALID',
      status: 400,
      details: { detail: 'request aborted' },
    });
    expect(storage.stored.size).toBe(0);
  });

  it('rejects at once a request the client hung up on before the handler ran', async () => {
    const storage = makeStorage();
    const req = new Readable({ read() { /* never produces */ } });
    req.destroy();
    await once(req, 'close');
    await expect(ctrlWith(storage).upload('m1' as MaterialId, req as never)).rejects.toMatchObject({
      code: 'UPLOAD_BODY_INVALID',
      details: { detail: 'request aborted' },
    });
    expect(storage.putStream).not.toHaveBeenCalled();
  });

  it('404s when the material does not exist and touches no storage', async () => {
    const storage = makeStorage();
    const ctrl = new MaterialsProxyController(repoReturning(null), storage as unknown as ObjectStorage);
    await expect(ctrl.upload('m1' as MaterialId, Readable.from([]) as never)).rejects.toBeInstanceOf(MaterialNotFoundException);
    expect(storage.putStream).not.toHaveBeenCalled();
  });

  it('propagates a storage failure', async () => {
    const storage = makeStorage();
    storage.putStream.mockRejectedValueOnce(new Error('store down'));
    const ctrl = new MaterialsProxyController(repoReturning(material), storage as unknown as ObjectStorage);
    await expect(ctrl.upload('m1' as MaterialId, Readable.from([]) as never)).rejects.toThrow('store down');
  });
});

describe('MaterialsProxyController.download', () => {
  it('sets the type and attachment disposition and pipes the object stream', async () => {
    const body = Readable.from([Buffer.from('FILE-BYTES')]);
    const pipe = vi.spyOn(body, 'pipe').mockImplementation((dest) => dest as never);
    const storage = makeStorage(body);
    const ctrl = new MaterialsProxyController(repoReturning(material), storage as unknown as ObjectStorage);
    const res = makeRes();
    await ctrl.download('m1' as MaterialId, res as never);
    expect(res.headers).toEqual({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="doc.pdf"' });
    expect(storage.openReadStream).toHaveBeenCalledWith({ bucket: 'b', path: 'materials/m1/source.pdf' });
    expect(pipe).toHaveBeenCalledWith(res);
  });

  it('sanitizes the filename in the disposition', async () => {
    const body = Readable.from([]);
    vi.spyOn(body, 'pipe').mockImplementation((dest) => dest as never);
    const ctrl = new MaterialsProxyController(
      repoReturning({ ...material, originalFilename: 'a"b\\c\r\nd.pdf' } as Material),
      makeStorage(body) as unknown as ObjectStorage,
    );
    const res = makeRes();
    await ctrl.download('m1' as MaterialId, res as never);
    expect(res.headers['Content-Disposition']).toBe('attachment; filename="a_b_c__d.pdf"');
  });

  it('destroys the response when the object stream errors mid-flight', async () => {
    const body = new Readable({ read() { /* driven manually */ } });
    vi.spyOn(body, 'pipe').mockImplementation((dest) => dest as never);
    const ctrl = new MaterialsProxyController(repoReturning(material), makeStorage(body) as unknown as ObjectStorage);
    const res = makeRes();
    await ctrl.download('m1' as MaterialId, res as never);
    body.emit('error', new Error('boom'));
    expect(res.destroy).toHaveBeenCalled();
  });

  it('404s when the material does not exist', async () => {
    const ctrl = new MaterialsProxyController(repoReturning(null), makeStorage() as unknown as ObjectStorage);
    await expect(ctrl.download('m1' as MaterialId, makeRes() as never)).rejects.toBeInstanceOf(MaterialNotFoundException);
  });
});
