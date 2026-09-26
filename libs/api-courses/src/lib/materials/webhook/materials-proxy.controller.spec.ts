import { Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import type { ObjectStorage } from '@learnwren/api-object-storage';
import type { Material, MaterialId } from '@learnwren/shared-data-models';

import { MaterialNotFoundException } from '../errors/material.exception';
import { MaterialsProxyController } from './materials-proxy.controller';

const material = {
  id: 'm1',
  contentType: 'application/pdf',
  originalFilename: 'doc.pdf',
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

function makeStorage(body: Readable = Readable.from([Buffer.from('FILE-BYTES')])) {
  return {
    putStream: vi.fn(async () => undefined),
    openReadStream: vi.fn(() => body),
  };
}

function makeRes() {
  const headers: Record<string, string> = {};
  return { headers, set: vi.fn((k: string, v: string) => { headers[k] = v; }), destroy: vi.fn(), write: vi.fn(), end: vi.fn(), on: vi.fn(), once: vi.fn(), emit: vi.fn() };
}

describe('MaterialsProxyController.upload', () => {
  it('streams the request body into the material object with its content type', async () => {
    const storage = makeStorage();
    const ctrl = new MaterialsProxyController(repoReturning(material), storage as unknown as ObjectStorage);
    const req = Readable.from([Buffer.from('PDF-'), Buffer.from('PAYLOAD')]);
    const r = await ctrl.upload('m1' as MaterialId, req as never);
    expect(r).toEqual({ ok: true });
    expect(storage.putStream).toHaveBeenCalledOnce();
    const arg = storage.putStream.mock.calls[0]![0] as { bucket: string; path: string; contentType: string; body: Readable };
    expect(arg).toMatchObject({ bucket: 'b', path: 'materials/m1/source.pdf', contentType: 'application/pdf' });
    expect(arg.body).toBe(req);
    expect(await drain(arg.body)).toBe('PDF-PAYLOAD');
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
