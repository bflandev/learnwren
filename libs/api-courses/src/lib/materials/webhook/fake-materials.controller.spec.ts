import { Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import type { Material, MaterialId } from '@learnwren/shared-data-models';

import { MaterialNotFoundException } from '../errors/material.exception';
import { FakeMaterialsController } from './fake-materials.controller';

const material = {
  id: 'm1',
  contentType: 'application/pdf',
  originalFilename: 'doc.pdf',
  storage: { bucket: 'b', path: 'materials/m1/source.pdf' },
} as Material;

function repoReturning(value: Material | null) {
  return { get: vi.fn().mockResolvedValue(value) } as never;
}

/** Cloud Storage double capturing save()/download() calls. */
function fakeStorage() {
  const saved: { buf: Buffer }[] = [];
  const file = {
    save: vi.fn(async (buf: Buffer) => void saved.push({ buf })),
    download: vi.fn(async () => [Buffer.from('FILE-BYTES')]),
  };
  return {
    saved,
    file,
    handle: { bucket: () => ({ file: () => file }) } as never,
  };
}

describe('FakeMaterialsController', () => {
  it('upload writes the request body to storage', async () => {
    const storage = fakeStorage();
    const ctrl = new FakeMaterialsController(repoReturning(material), storage.handle);
    const req = Readable.from([Buffer.from('PDF-PAYLOAD')]) as never;
    const r = await ctrl.upload('m1' as MaterialId, req);
    expect(r).toEqual({ ok: true });
    expect(storage.saved[0]!.buf.toString()).toBe('PDF-PAYLOAD');
    expect(storage.file.save).toHaveBeenCalledWith(expect.any(Buffer), {
      contentType: 'application/pdf',
      resumable: false,
    });
  });

  it('upload throws MATERIAL_NOT_FOUND for an unknown material', async () => {
    const ctrl = new FakeMaterialsController(repoReturning(null), fakeStorage().handle);
    await expect(
      ctrl.upload('nope' as MaterialId, Readable.from([]) as never),
    ).rejects.toBeInstanceOf(MaterialNotFoundException);
  });

  it('download streams the object back with attachment headers', async () => {
    const storage = fakeStorage();
    const ctrl = new FakeMaterialsController(repoReturning(material), storage.handle);
    const headers: Record<string, string> = {};
    let sent: Buffer | undefined;
    const res = {
      set: (k: string, v: string) => void (headers[k] = v),
      send: (b: Buffer) => void (sent = b),
    } as never;
    await ctrl.download('m1' as MaterialId, res);
    expect(sent?.toString()).toBe('FILE-BYTES');
    expect(headers['Content-Type']).toBe('application/pdf');
    expect(headers['Content-Disposition']).toContain('doc.pdf');
  });

  it('download throws MATERIAL_NOT_FOUND for an unknown material', async () => {
    const ctrl = new FakeMaterialsController(repoReturning(null), fakeStorage().handle);
    const res = { set: () => undefined, send: () => undefined } as never;
    await expect(
      ctrl.download('nope' as MaterialId, res),
    ).rejects.toBeInstanceOf(MaterialNotFoundException);
  });
});
