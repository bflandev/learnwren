import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Course, CourseId, ISODateString } from '@learnwren/shared-data-models';

// Mock sharp so we can assert the EXACT pipeline option objects (failOn, resize
// withoutEnlargement, jpeg quality/mozjpeg) and drive the metadata branch
// (`!width || !height`) with crafted dimensions that real sharp cannot produce.
const sharpCtor = vi.fn();
vi.mock('sharp', () => ({ default: (...args: unknown[]) => sharpCtor(...args) }));

import {
  CoverDecodeFailedException,
  CoverDimensionsTooSmallException,
} from './errors/cover.exception';
import { FakeCoverStorageAdapter } from './fake-cover-storage.adapter';
import { CoverImageService } from './cover-image.service';

const CID = 'c1' as CourseId;

function makeRepo() {
  const courses = new Map<CourseId, Course>();
  courses.set(CID, {
    id: CID,
    title: 'T',
    description: 'D',
    instructorId: 'u1' as Course['instructorId'],
    status: 'DRAFT',
    createdAt: '2026-05-01T00:00:00.000Z' as ISODateString,
    updatedAt: '2026-05-01T00:00:00.000Z' as ISODateString,
  });
  return {
    state: courses,
    getCourse: vi.fn(async (id: CourseId) => courses.get(id) ?? null),
    updateCourse: vi.fn(async () => undefined),
    clearCoverImageUrl: vi.fn(async () => undefined),
  };
}

/** Build a sharp-pipeline mock whose metadata returns the supplied dims. */
function mockPipeline(meta: { width?: number; height?: number }) {
  const jpeg = vi.fn().mockReturnThis();
  const resize = vi.fn().mockReturnThis();
  const toBuffer = vi.fn(async () => Buffer.from('encoded'));
  const metadata = vi.fn(async () => meta);
  const pipeline = { metadata, resize, jpeg, toBuffer };
  sharpCtor.mockReturnValue(pipeline);
  return { pipeline, jpeg, resize, toBuffer, metadata };
}

function makeService(repo: ReturnType<typeof makeRepo>) {
  return new CoverImageService(
    new FakeCoverStorageAdapter(),
    repo as unknown as import('../courses.repository').CoursesRepository,
    { bucket: 'b', publicBaseUrl: 'https://cdn.example', impl: 'fake' },
  );
}

describe('CoverImageService — sharp pipeline options (mocked)', () => {
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    sharpCtor.mockReset();
    repo = makeRepo();
  });

  it('constructs sharp with { failOn: "truncated" }', async () => {
    mockPipeline({ width: 1920, height: 1080 });
    const body = Buffer.from('src');
    await makeService(repo).uploadCover(CID, body, 'image/jpeg');
    expect(sharpCtor).toHaveBeenCalledWith(body, { failOn: 'truncated' });
  });

  it('resizes within 1920x1080 with fit:inside and withoutEnlargement:true', async () => {
    const { resize } = mockPipeline({ width: 1920, height: 1080 });
    await makeService(repo).uploadCover(CID, Buffer.from('src'), 'image/jpeg');
    expect(resize).toHaveBeenCalledWith({
      width: 1920,
      height: 1080,
      fit: 'inside',
      withoutEnlargement: true,
    });
  });

  it('encodes jpeg with { quality: 85, mozjpeg: true }', async () => {
    const { jpeg } = mockPipeline({ width: 1920, height: 1080 });
    await makeService(repo).uploadCover(CID, Buffer.from('src'), 'image/jpeg');
    expect(jpeg).toHaveBeenCalledWith({ quality: 85, mozjpeg: true });
  });

  it('throws CoverDecodeFailed when width is missing but height present (kills the !width operand)', async () => {
    mockPipeline({ width: undefined, height: 1080 });
    await expect(
      makeService(repo).uploadCover(CID, Buffer.from('src'), 'image/jpeg'),
    ).rejects.toBeInstanceOf(CoverDecodeFailedException);
  });

  it('throws CoverDecodeFailed when height is missing but width present (kills the !height operand)', async () => {
    mockPipeline({ width: 1920, height: undefined });
    await expect(
      makeService(repo).uploadCover(CID, Buffer.from('src'), 'image/jpeg'),
    ).rejects.toBeInstanceOf(CoverDecodeFailedException);
  });

  it('throws CoverDecodeFailed when metadata() rejects', async () => {
    const metadata = vi.fn(async () => {
      throw new Error('bad');
    });
    sharpCtor.mockReturnValue({ metadata });
    await expect(
      makeService(repo).uploadCover(CID, Buffer.from('src'), 'image/jpeg'),
    ).rejects.toBeInstanceOf(CoverDecodeFailedException);
  });

  it('rejects width-only too small (1279x720) — kills the width<MIN operand', async () => {
    mockPipeline({ width: 1279, height: 720 });
    await expect(
      makeService(repo).uploadCover(CID, Buffer.from('src'), 'image/jpeg'),
    ).rejects.toMatchObject({
      constructor: CoverDimensionsTooSmallException,
      details: { width: 1279, height: 720 },
    });
  });

  it('rejects height-only too small (1280x719) — kills the height<MIN operand', async () => {
    mockPipeline({ width: 1280, height: 719 });
    await expect(
      makeService(repo).uploadCover(CID, Buffer.from('src'), 'image/jpeg'),
    ).rejects.toMatchObject({
      constructor: CoverDimensionsTooSmallException,
      details: { width: 1280, height: 719 },
    });
  });

  it('accepts the inclusive 1280x720 boundary (neither operand trips)', async () => {
    mockPipeline({ width: 1280, height: 720 });
    const out = await makeService(repo).uploadCover(CID, Buffer.from('src'), 'image/jpeg');
    expect(out.coverImageUrl).toContain('course-covers/c1/cover.jpg');
  });

  it('removeCover returns an object carrying updatedAt (kills the {updatedAt} ObjectLiteral)', async () => {
    const out = await makeService(repo).removeCover(CID);
    expect(out).toHaveProperty('updatedAt');
    expect(typeof out.updatedAt).toBe('string');
    expect(out.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
