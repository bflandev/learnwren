import { describe, expect, it, vi } from 'vitest';

import type { ObjectStorage } from '@learnwren/api-object-storage';

import type { MaterialsConfig } from './materials.config';
import { MaterialsStorageAdapter } from './materials-storage.adapter';

const fakeCfg: MaterialsConfig = { materialsBucket: 'b', storageImpl: 'fake', uploadUrlTtlSec: 900, downloadUrlTtlSec: 900 };
const realCfg: MaterialsConfig = { ...fakeCfg, storageImpl: 'real' };

function storage(kind: 'gcs' | 's3' = 'gcs') {
  return {
    kind,
    signWriteUrl: vi.fn(async () => 'https://signed.example/upload'),
    signReadUrl: vi.fn(async () => 'https://signed.example/download'),
    headObject: vi.fn(async () => ({ size: 4096 })),
    deleteObject: vi.fn(async () => undefined),
    ensureBucket: vi.fn(async () => undefined),
  };
}
const asPort = (s: ReturnType<typeof storage>) => s as unknown as ObjectStorage;

const upload = { bucket: 'b', path: 'materials/m1/source.pdf', contentType: 'application/pdf', materialId: 'm1' };
const download = { ...upload, filename: 'doc.pdf', ttlSec: 900 };

function expectFuture(iso: string, before: number) {
  const ms = new Date(iso).getTime();
  expect(ms).toBeGreaterThan(before + 800_000);
  expect(ms).toBeLessThan(before + 1_000_000);
}

describe('MaterialsStorageAdapter — proxied modes (fake, or any s3 store)', () => {
  it.each([
    ['fake adapter on gcs', fakeCfg, 'gcs' as const],
    ['real adapter on s3', realCfg, 's3' as const],
    ['fake adapter on s3', fakeCfg, 's3' as const],
  ])('%s: mints api proxy URLs and never signs', async (_label, cfg, kind) => {
    const before = Date.now();
    const s = storage(kind);
    const a = new MaterialsStorageAdapter(asPort(s), cfg);
    const up = await a.signUploadUrl(upload);
    expect(up.uploadUrl).toBe('/api/internal/uploads/materials/m1');
    expectFuture(up.expiresAt, before);
    const down = await a.signDownloadUrl(download);
    expect(down.downloadUrl).toBe('/api/internal/downloads/materials/m1');
    expectFuture(down.expiresAt, before);
    expect(s.signWriteUrl).not.toHaveBeenCalled();
    expect(s.signReadUrl).not.toHaveBeenCalled();
  });
});

describe('MaterialsStorageAdapter — gcs signed mode', () => {
  it('signUploadUrl asks for a write URL bound to the content type and TTL', async () => {
    const before = Date.now();
    const s = storage();
    const r = await new MaterialsStorageAdapter(asPort(s), realCfg).signUploadUrl(upload);
    expect(r.uploadUrl).toBe('https://signed.example/upload');
    expect(s.signWriteUrl).toHaveBeenCalledExactlyOnceWith({ bucket: 'b', path: 'materials/m1/source.pdf', contentType: 'application/pdf', ttlSec: 900 });
    expectFuture(r.expiresAt, before);
  });

  it('signDownloadUrl asks for a read URL with attachment disposition and the content type', async () => {
    const before = Date.now();
    const s = storage();
    const r = await new MaterialsStorageAdapter(asPort(s), realCfg).signDownloadUrl(download);
    expect(r.downloadUrl).toBe('https://signed.example/download');
    expect(s.signReadUrl).toHaveBeenCalledExactlyOnceWith({
      bucket: 'b',
      path: 'materials/m1/source.pdf',
      ttlSec: 900,
      responseDisposition: 'attachment; filename="doc.pdf"',
      responseType: 'application/pdf',
    });
    expectFuture(r.expiresAt, before);
  });

  it('signDownloadUrl sanitizes quotes, backslashes and newlines in the filename', async () => {
    const s = storage();
    await new MaterialsStorageAdapter(asPort(s), realCfg).signDownloadUrl({ ...download, filename: 'a"b\\c\r\nd.pdf' });
    const arg = s.signReadUrl.mock.calls[0]![0] as { responseDisposition: string };
    expect(arg.responseDisposition).toBe('attachment; filename="a_b_c__d.pdf"');
  });

  it('creates the materials bucket on module init', async () => {
    const s = storage();
    await new MaterialsStorageAdapter(asPort(s), realCfg).onModuleInit();
    expect(s.ensureBucket).toHaveBeenCalledExactlyOnceWith('b');
  });

  it('headObject and deleteObject delegate to the port', async () => {
    const s = storage();
    const a = new MaterialsStorageAdapter(asPort(s), realCfg);
    expect(await a.headObject({ bucket: 'b', path: 'p' })).toEqual({ size: 4096 });
    expect(s.headObject).toHaveBeenCalledWith({ bucket: 'b', path: 'p' });
    await a.deleteObject({ bucket: 'b', path: 'p' });
    expect(s.deleteObject).toHaveBeenCalledWith({ bucket: 'b', path: 'p' });
  });
});
