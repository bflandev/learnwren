import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

import type { Course, CourseId, ISODateString } from '@learnwren/shared-data-models';

import {
  CoverDecodeFailedException,
  CoverDimensionsTooSmallException,
} from './errors/cover.exception';
import { FakeCoverStorageAdapter } from './fake-cover-storage.adapter';
import { CoverImageService } from './cover-image.service';

const CID = 'c1' as CourseId;

function makeRepo() {
  const courses = new Map<CourseId, Course>();
  return {
    state: courses,
    getCourse: vi.fn(async (id: CourseId) => courses.get(id) ?? null),
    updateCourse: vi.fn(async (id: CourseId, patch: Partial<Course>) => {
      const prev = courses.get(id);
      if (!prev) return;
      const next: Course = {
        ...prev,
        ...patch,
        updatedAt: '2026-05-25T12:00:00.000Z' as ISODateString,
      };
      courses.set(id, next);
    }),
    clearCoverImageUrl: vi.fn(async (id: CourseId) => {
      const prev = courses.get(id);
      if (!prev) return;
      // Mirror FieldValue.delete() semantics: remove the field entirely.
      const { coverImageUrl: _drop, ...rest } = prev;
      courses.set(id, {
        ...(rest as Course),
        updatedAt: '2026-05-25T12:00:00.000Z' as ISODateString,
      });
    }),
  };
}

async function makeJpegBuffer(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg()
    .toBuffer();
}

describe('CoverImageService — validation', () => {
  let svc: CoverImageService;
  let storage: FakeCoverStorageAdapter;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    storage = new FakeCoverStorageAdapter();
    repo = makeRepo();
    repo.state.set(CID, {
      id: CID,
      title: 'T',
      description: 'D',
      instructorId: 'u1' as Course['instructorId'],
      status: 'DRAFT',
      createdAt: '2026-05-01T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-01T00:00:00.000Z' as ISODateString,
    });
    svc = new CoverImageService(
      storage,
      repo as unknown as import('../courses.repository').CoursesRepository,
      { bucket: 'b', publicBaseUrl: 'https://cdn.example', impl: 'fake' },
    );
  });

  it('rejects a 640x480 image with CoverDimensionsTooSmallException carrying actual dimensions', async () => {
    const buf = await makeJpegBuffer(640, 480);
    await expect(svc.uploadCover(CID, buf, 'image/jpeg')).rejects.toMatchObject({
      constructor: CoverDimensionsTooSmallException,
      details: { width: 640, height: 480 },
    });
  });

  it('rejects a non-image buffer with CoverDecodeFailedException', async () => {
    await expect(svc.uploadCover(CID, Buffer.from('not an image'), 'image/jpeg')).rejects.toBeInstanceOf(
      CoverDecodeFailedException,
    );
  });

  it('rejects a truncated image body with CoverDecodeFailedException (decode-time failure)', async () => {
    // metadata() only reads the header, so a truncated JPEG passes the first
    // gate; the actual decode (.resize().jpeg().toBuffer()) is what throws.
    // That raw sharp error must be wrapped as the typed 400, not escape as 500.
    const whole = await makeJpegBuffer(1280, 720);
    const truncated = whole.subarray(0, Math.floor(whole.length / 2));
    await expect(svc.uploadCover(CID, Buffer.from(truncated), 'image/jpeg')).rejects.toBeInstanceOf(
      CoverDecodeFailedException,
    );
  });

  it('accepts a 1280x720 image (boundary, inclusive)', async () => {
    const buf = await makeJpegBuffer(1280, 720);
    const out = await svc.uploadCover(CID, buf, 'image/jpeg');
    expect(out.coverImageUrl).toMatch(/^https:\/\/cdn\.example\/course-covers\/c1\/cover\.jpg\?v=/);
  });
});

describe('CoverImageService — happy path', () => {
  let svc: CoverImageService;
  let storage: FakeCoverStorageAdapter;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    storage = new FakeCoverStorageAdapter();
    repo = makeRepo();
    repo.state.set(CID, {
      id: CID,
      title: 'T',
      description: 'D',
      instructorId: 'u1' as Course['instructorId'],
      status: 'DRAFT',
      createdAt: '2026-05-01T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-01T00:00:00.000Z' as ISODateString,
    });
    svc = new CoverImageService(
      storage,
      repo as unknown as import('../courses.repository').CoursesRepository,
      { bucket: 'b', publicBaseUrl: 'https://cdn.example', impl: 'fake' },
    );
  });

  it('writes a single jpeg blob at course-covers/{id}/cover.jpg with cacheControl + metadata', async () => {
    const buf = await makeJpegBuffer(1920, 1080);
    await svc.uploadCover(CID, buf, 'image/jpeg');
    const blob = storage.get('course-covers/c1/cover.jpg');
    expect(blob).toBeDefined();
    expect(blob!.contentType).toBe('image/jpeg');
    expect(blob!.cacheControl).toBe('public, max-age=31536000, immutable');
    expect(blob!.metadata).toEqual({ courseId: 'c1' });
  });

  it('resizes a 3000x1500 source down within 1920x1080 preserving aspect', async () => {
    const buf = await makeJpegBuffer(3000, 1500);
    await svc.uploadCover(CID, buf, 'image/jpeg');
    const blob = storage.get('course-covers/c1/cover.jpg');
    const meta = await sharp(blob!.body).metadata();
    expect(meta.width).toBeLessThanOrEqual(1920);
    expect(meta.height).toBeLessThanOrEqual(1080);
    expect(meta.format).toBe('jpeg');
  });

  it('patches Course.coverImageUrl exactly once with the resolved URL', async () => {
    const buf = await makeJpegBuffer(1280, 720);
    const out = await svc.uploadCover(CID, buf, 'image/jpeg');
    expect(repo.updateCourse).toHaveBeenCalledTimes(1);
    const calls = repo.updateCourse.mock.calls;
    expect(calls[0][1]).toEqual({ coverImageUrl: out.coverImageUrl });
    expect(out.coverImageUrl).toBe(repo.state.get(CID)!.coverImageUrl);
  });

  it('removeCover deletes the blob and unsets coverImageUrl in a single update', async () => {
    repo.state.set(CID, {
      ...repo.state.get(CID)!,
      coverImageUrl: 'https://cdn.example/course-covers/c1/cover.jpg?v=old',
    });
    await storage.putObject({
      path: 'course-covers/c1/cover.jpg',
      contentType: 'image/jpeg',
      body: Buffer.from('x'),
    });
    await svc.removeCover(CID);
    expect(storage.has('course-covers/c1/cover.jpg')).toBe(false);
    expect(repo.clearCoverImageUrl).toHaveBeenCalledTimes(1);
    expect(repo.clearCoverImageUrl).toHaveBeenCalledWith(CID);
    expect(repo.updateCourse).not.toHaveBeenCalled();
    expect(repo.state.get(CID)!.coverImageUrl).toBeUndefined();
  });
});
