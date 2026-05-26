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

  it('accepts a 1280x720 image (boundary, inclusive)', async () => {
    const buf = await makeJpegBuffer(1280, 720);
    const out = await svc.uploadCover(CID, buf, 'image/jpeg');
    expect(out.coverImageUrl).toMatch(/^https:\/\/cdn\.example\/course-covers\/c1\/cover\.jpg\?v=/);
  });
});
