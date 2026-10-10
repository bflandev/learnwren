import { PassThrough, Readable } from 'node:stream';
import { setImmediate as tick } from 'node:timers/promises';

import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { ObjectStorageConfig } from './object-storage.config';
import type { ObjectStorage } from './object-storage.port';
import { PublicMediaController } from './public-media.controller';

const cfg: ObjectStorageConfig = { kind: 'gcs', publicBuckets: ['covers', 'pictures'] };

function make(head: { size: number; contentType?: string } | null = { size: 5, contentType: 'image/jpeg' }) {
  const stream = new Readable({ read() { /* driven by each test */ } });
  const storage = { headObject: vi.fn(async () => head), openReadStream: vi.fn(() => stream) };
  const headers: Record<string, string> = {};
  const res = Object.assign(new PassThrough(), { headers, setHeader: vi.fn((k: string, v: string) => { headers[k] = v; }) });
  return { ctrl: new PublicMediaController(storage as unknown as ObjectStorage, cfg), storage, stream, res };
}

describe('PublicMediaController', () => {
  it('streams an object from a public bucket with type, length and an immutable cache header', async () => {
    const { ctrl, storage, stream, res } = make();
    await ctrl.serve('covers', 'course-covers/c1/cover.jpg', res as never);
    expect(storage.headObject).toHaveBeenCalledWith({ bucket: 'covers', path: 'course-covers/c1/cover.jpg' });
    expect(storage.openReadStream).toHaveBeenCalledWith({ bucket: 'covers', path: 'course-covers/c1/cover.jpg' });
    expect(res.headers).toEqual({
      'Content-Type': 'image/jpeg',
      'Content-Length': '5',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    stream.push('bytes');
    stream.push(null);
    expect((await res.toArray()).join('')).toBe('bytes');
  });

  it('falls back to octet-stream when the store has no content type', async () => {
    const { ctrl, res } = make({ size: 1 });
    await ctrl.serve('pictures', 'p', res as never);
    expect(res.headers['Content-Type']).toBe('application/octet-stream');
  });

  it('404s for a bucket that is not public, without touching storage', async () => {
    const { ctrl, storage, res } = make();
    await expect(ctrl.serve('learnwren-source', 'videos/v/source.mp4', res as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.headObject).not.toHaveBeenCalled();
  });

  it('404s for a missing object', async () => {
    const { ctrl, storage, res } = make(null);
    await expect(ctrl.serve('covers', 'nope.jpg', res as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.openReadStream).not.toHaveBeenCalled();
  });

  it('drops the connection when the stream fails mid-flight', async () => {
    const { ctrl, stream, res } = make();
    await ctrl.serve('covers', 'k', res as never);
    stream.destroy(new Error('store reset'));
    await tick();
    expect(res.destroyed).toBe(true);
  });

  it('releases the object stream when the client hangs up', async () => {
    const { ctrl, stream, res } = make();
    await ctrl.serve('covers', 'k', res as never);
    res.destroy();
    await tick();
    expect(stream.destroyed).toBe(true);
  });

  it.each(['../learnwren-materials/x.pdf', 'a/../b', './a', 'a//b', ''])(
    '404s for a key with a dot or empty segment (%s), without touching storage',
    async (key) => {
      const { ctrl, storage, res } = make();
      await expect(ctrl.serve('covers', key, res as never)).rejects.toBeInstanceOf(NotFoundException);
      expect(storage.headObject).not.toHaveBeenCalled();
    },
  );
});
