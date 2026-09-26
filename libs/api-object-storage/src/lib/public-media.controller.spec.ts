import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { ObjectStorageConfig } from './object-storage.config';
import type { ObjectStorage } from './object-storage.port';
import { PublicMediaController } from './public-media.controller';

const cfg: ObjectStorageConfig = { kind: 'gcs', publicBuckets: ['covers', 'pictures'] };

function make(head: { size: number; contentType?: string } | null = { size: 5, contentType: 'image/jpeg' }) {
  const stream = { pipe: vi.fn(), on: vi.fn() };
  const storage = { headObject: vi.fn(async () => head), openReadStream: vi.fn(() => stream) };
  const res = { headers: {} as Record<string, string>, setHeader: vi.fn((k: string, v: string) => { res.headers[k] = v; }), destroy: vi.fn() };
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
    expect(stream.pipe).toHaveBeenCalledWith(res);
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
    const onError = (stream.on.mock.calls.find((c) => c[0] === 'error') as [string, () => void])[1];
    onError();
    expect(res.destroy).toHaveBeenCalled();
  });
});
