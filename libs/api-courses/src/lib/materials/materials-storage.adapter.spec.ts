import { describe, expect, it, vi } from 'vitest';

import type { MaterialsConfig } from './materials.config';
import { MaterialsStorageAdapter } from './materials-storage.adapter';

const fakeCfg: MaterialsConfig = {
  materialsBucket: 'b',
  storageImpl: 'fake',
  uploadUrlTtlSec: 900,
  downloadUrlTtlSec: 900,
};
const realCfg: MaterialsConfig = { ...fakeCfg, storageImpl: 'real' };

/** Minimal Cloud Storage double — one configurable `file` object per test. */
function storageWith(file: Record<string, unknown>) {
  return { bucket: () => ({ file: () => file }) } as never;
}

describe('MaterialsStorageAdapter — fake mode', () => {
  it('signUploadUrl returns an internal passthrough URL with a future expiresAt', async () => {
    const before = Date.now();
    const a = new MaterialsStorageAdapter(storageWith({}), fakeCfg);
    const r = await a.signUploadUrl({
      bucket: 'b',
      path: 'materials/m1/source.pdf',
      contentType: 'application/pdf',
      materialId: 'm1',
    });
    expect(r.uploadUrl).toBe('/api/internal/fake-materials/m1');
    // expiresAt must be in the future (now + 900s), not in the past.
    // Kills ArithmeticOperator mutants that replace `+` with `-` or `*` with `/`.
    const expiresMs = new Date(r.expiresAt).getTime();
    expect(expiresMs).toBeGreaterThan(before + 800_000);
    expect(expiresMs).toBeLessThan(before + 1_000_000);
  });

  it('signDownloadUrl returns an internal passthrough URL with a future expiresAt', async () => {
    const before = Date.now();
    const a = new MaterialsStorageAdapter(storageWith({}), fakeCfg);
    const r = await a.signDownloadUrl({
      bucket: 'b',
      path: 'materials/m1/source.pdf',
      filename: 'doc.pdf',
      contentType: 'application/pdf',
      materialId: 'm1',
      ttlSec: 900,
    });
    expect(r.downloadUrl).toBe('/api/internal/fake-materials/m1');
    const expiresMs = new Date(r.expiresAt).getTime();
    expect(expiresMs).toBeGreaterThan(before + 800_000);
    expect(expiresMs).toBeLessThan(before + 1_000_000);
  });
});

describe('MaterialsStorageAdapter — real mode', () => {
  it('signUploadUrl asks Cloud Storage for a v4 write URL bound to the content-type', async () => {
    const before = Date.now();
    const getSignedUrl = vi.fn().mockResolvedValue(['https://signed.example/upload']);
    const a = new MaterialsStorageAdapter(storageWith({ getSignedUrl }), realCfg);
    const r = await a.signUploadUrl({
      bucket: 'b',
      path: 'materials/m1/source.pdf',
      contentType: 'application/pdf',
      materialId: 'm1',
    });
    expect(r.uploadUrl).toBe('https://signed.example/upload');
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ version: 'v4', action: 'write', contentType: 'application/pdf' }),
    );
    // expiresAt must be a future timestamp (now + 900s). Kills arithmetic-operator mutants.
    const expiresMs = new Date(r.expiresAt).getTime();
    expect(expiresMs).toBeGreaterThan(before + 800_000);
    expect(expiresMs).toBeLessThan(before + 1_000_000);
  });

  it('signDownloadUrl requests a read URL with attachment disposition', async () => {
    const before = Date.now();
    const getSignedUrl = vi.fn().mockResolvedValue(['https://signed.example/download']);
    const a = new MaterialsStorageAdapter(storageWith({ getSignedUrl }), realCfg);
    const r = await a.signDownloadUrl({
      bucket: 'b',
      path: 'materials/m1/source.pdf',
      filename: 'doc.pdf',
      contentType: 'application/pdf',
      materialId: 'm1',
      ttlSec: 900,
    });
    expect(r.downloadUrl).toBe('https://signed.example/download');
    const opts = getSignedUrl.mock.calls[0]![0] as Record<string, unknown>;
    expect(opts['version']).toBe('v4');
    expect(opts['action']).toBe('read');
    expect(String(opts['responseDisposition'])).toContain('attachment');
    expect(String(opts['responseDisposition'])).toContain('doc.pdf');
    expect(opts['responseType']).toBe('application/pdf');
    // expiresAt must be a future timestamp (now + 900s). Kills arithmetic-operator mutants.
    const expiresMs = new Date(r.expiresAt).getTime();
    expect(expiresMs).toBeGreaterThan(before + 800_000);
    expect(expiresMs).toBeLessThan(before + 1_000_000);
  });

  it('signDownloadUrl sanitizes special characters in the filename', async () => {
    const getSignedUrl = vi.fn().mockResolvedValue(['https://signed.example/download']);
    const a = new MaterialsStorageAdapter(storageWith({ getSignedUrl }), realCfg);
    await a.signDownloadUrl({
      bucket: 'b',
      path: 'materials/m1/source.pdf',
      filename: 'a"b\nc.pdf',
      contentType: 'application/pdf',
      materialId: 'm1',
      ttlSec: 900,
    });
    const opts = getSignedUrl.mock.calls[0]![0] as Record<string, unknown>;
    const disposition = String(opts['responseDisposition']);
    // The sanitized filename must not contain a raw " or newline from the input
    expect(disposition).not.toContain('\n');
    expect(disposition).toContain('a_b_c.pdf');
    // Ensure the original unsanitized characters are gone from the filename portion
    expect(disposition).not.toContain('"b');
  });

  it('headObject returns the numeric size when metadata size is a string', async () => {
    const getMetadata = vi.fn().mockResolvedValue([{ size: '4096' }]);
    const a = new MaterialsStorageAdapter(storageWith({ getMetadata }), realCfg);
    expect(await a.headObject({ bucket: 'b', path: 'p' })).toEqual({ size: 4096 });
  });

  it('headObject returns the numeric size when metadata size is already a number', async () => {
    // Distinguishes the ternary branch: `typeof meta.size === 'string' ? Number(meta.size) : meta.size`
    // With the mutant (hardcoded true), numeric input is still coerced via Number() which is same.
    // With hardcoded false, string inputs would be returned as-is (a string, not a number).
    // This test pins that a numeric size in metadata is returned as the same number.
    const getMetadata = vi.fn().mockResolvedValue([{ size: 8192 }]);
    const a = new MaterialsStorageAdapter(storageWith({ getMetadata }), realCfg);
    const result = await a.headObject({ bucket: 'b', path: 'p' });
    expect(result).toEqual({ size: 8192 });
    expect(typeof result!.size).toBe('number');
  });

  it('headObject returns null when the object is missing (404)', async () => {
    const getMetadata = vi.fn().mockRejectedValue({ code: 404 });
    const a = new MaterialsStorageAdapter(storageWith({ getMetadata }), realCfg);
    expect(await a.headObject({ bucket: 'b', path: 'p' })).toBeNull();
  });

  it('deleteObject swallows a 404', async () => {
    const del = vi.fn().mockRejectedValue({ code: 404 });
    const a = new MaterialsStorageAdapter(storageWith({ delete: del }), realCfg);
    await expect(a.deleteObject({ bucket: 'b', path: 'p' })).resolves.toBeUndefined();
  });

  it('headObject rethrows non-404 errors', async () => {
    const getMetadata = vi.fn().mockRejectedValue({ code: 500 });
    const a = new MaterialsStorageAdapter(storageWith({ getMetadata }), realCfg);
    await expect(a.headObject({ bucket: 'b', path: 'p' })).rejects.toMatchObject({ code: 500 });
  });

  it('deleteObject rethrows non-404 errors', async () => {
    const del = vi.fn().mockRejectedValue({ code: 500 });
    const a = new MaterialsStorageAdapter(storageWith({ delete: del }), realCfg);
    await expect(a.deleteObject({ bucket: 'b', path: 'p' })).rejects.toMatchObject({ code: 500 });
  });
});
