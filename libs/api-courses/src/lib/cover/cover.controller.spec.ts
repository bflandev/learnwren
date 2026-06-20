import { describe, expect, it, vi } from 'vitest';
import type { CourseId, ISODateString } from '@learnwren/shared-data-models';

import { CoverController } from './cover.controller';
import {
  CoverTooLargeException,
  UnsupportedCoverFormatException,
} from './errors/cover.exception';
import type { CoverImageService } from './cover-image.service';

const CID = 'c1' as CourseId;

function makeSvc() {
  return {
    uploadCover: vi.fn(async () => ({
      coverImageUrl: 'https://cdn.example/course-covers/c1/cover.jpg?v=2026',
      updatedAt: '2026-05-25T12:00:00.000Z' as ISODateString,
    })),
    removeCover: vi.fn(async () => ({ updatedAt: '2026-05-25T12:00:00.000Z' as ISODateString })),
  };
}

function makeFile(mimetype: string, size = 100): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'cover.jpg',
    encoding: '7bit',
    mimetype,
    size,
    buffer: Buffer.alloc(size, 1),
    destination: '',
    filename: '',
    path: '',
    stream: undefined as never,
  };
}

describe('CoverController', () => {
  it('returns 200 { coverImageUrl, updatedAt } on PUT happy path', async () => {
    const svc = makeSvc();
    const ctl = new CoverController(svc as unknown as CoverImageService);
    const out = await ctl.upload(CID, makeFile('image/jpeg'));
    expect(svc.uploadCover).toHaveBeenCalledWith(CID, expect.any(Buffer), 'image/jpeg');
    expect(out).toEqual({
      coverImageUrl: 'https://cdn.example/course-covers/c1/cover.jpg?v=2026',
      updatedAt: '2026-05-25T12:00:00.000Z',
    });
  });

  it('throws UnsupportedCoverFormatException when MIME is not jpeg/png', async () => {
    const svc = makeSvc();
    const ctl = new CoverController(svc as unknown as CoverImageService);
    await expect(ctl.upload(CID, makeFile('image/gif'))).rejects.toBeInstanceOf(
      UnsupportedCoverFormatException,
    );
  });

  it('accepts image/png (ALLOWED_MIME contains both jpeg and png)', async () => {
    const svc = makeSvc();
    const ctl = new CoverController(svc as unknown as CoverImageService);
    await ctl.upload(CID, makeFile('image/png'));
    expect(svc.uploadCover).toHaveBeenCalledWith(CID, expect.any(Buffer), 'image/png');
  });

  it('throws CoverTooLargeException when file exceeds 10 MB', async () => {
    const svc = makeSvc();
    const ctl = new CoverController(svc as unknown as CoverImageService);
    await expect(ctl.upload(CID, makeFile('image/jpeg', 10_000_001))).rejects.toBeInstanceOf(
      CoverTooLargeException,
    );
  });

  it('accepts a file at exactly MAX_BYTES (10 MB) — boundary is inclusive, kills > vs >=', async () => {
    const svc = makeSvc();
    const ctl = new CoverController(svc as unknown as CoverImageService);
    // size === 10_000_000 must NOT throw: `file.size > MAX_BYTES` is false at the
    // boundary. A `>=` mutant would reject this and fail the test.
    await expect(ctl.upload(CID, makeFile('image/jpeg', 10_000_000))).resolves.toBeDefined();
    expect(svc.uploadCover).toHaveBeenCalled();
  });

  it('throws UnsupportedCoverFormatException when no file is provided', async () => {
    const svc = makeSvc();
    const ctl = new CoverController(svc as unknown as CoverImageService);
    await expect(ctl.upload(CID, undefined as unknown as Express.Multer.File)).rejects.toBeInstanceOf(
      UnsupportedCoverFormatException,
    );
  });

  it('returns no content (void) on DELETE', async () => {
    const svc = makeSvc();
    const ctl = new CoverController(svc as unknown as CoverImageService);
    await expect(ctl.remove(CID)).resolves.toBeUndefined();
    expect(svc.removeCover).toHaveBeenCalledWith(CID);
  });
});
