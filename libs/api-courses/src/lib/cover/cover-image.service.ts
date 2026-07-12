import { Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';

import type { Course, CourseId } from '@learnwren/shared-data-models';

import { CoursesRepository } from '../courses.repository';
import { COVER_CONFIG, type CoverConfig } from './cover.config';
import { COVER_STORAGE, type CoverStoragePort } from './cover-storage.adapter';
import {
  CoverDecodeFailedException,
  CoverDimensionsTooSmallException,
} from './errors/cover.exception';

const MIN_WIDTH = 1280;
const MIN_HEIGHT = 720;
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;

export interface UploadCoverResult {
  coverImageUrl: string;
  updatedAt: Course['updatedAt'];
}

@Injectable()
export class CoverImageService {
  constructor(
    @Inject(COVER_STORAGE) private readonly storage: CoverStoragePort,
    private readonly courses: CoursesRepository,
    @Inject(COVER_CONFIG) private readonly cfg: CoverConfig,
  ) {}

  async uploadCover(
    courseId: CourseId,
    body: Buffer,
    _contentType: 'image/jpeg' | 'image/png',
  ): Promise<UploadCoverResult> {
    const pipeline = sharp(body, { failOn: 'truncated' });
    let meta: sharp.Metadata;
    try {
      meta = await pipeline.metadata();
    } catch {
      throw new CoverDecodeFailedException();
    }
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) throw new CoverDecodeFailedException();
    if (width < MIN_WIDTH || height < MIN_HEIGHT) {
      throw new CoverDimensionsTooSmallException({ width, height });
    }

    // metadata() only reads the header; the full decode happens here and can
    // still fail on truncated/corrupt bodies. Wrap it so the raw sharp error
    // renders as the typed 400 instead of escaping the filter as a 500.
    let jpeg: Buffer;
    try {
      jpeg = await pipeline
        .resize({ width: MAX_WIDTH, height: MAX_HEIGHT, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
    } catch {
      throw new CoverDecodeFailedException();
    }

    const path = `course-covers/${courseId}/cover.jpg`;
    await this.storage.putObject({
      path,
      contentType: 'image/jpeg',
      body: jpeg,
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { courseId: String(courseId) },
    });

    // Pre-compute the next updatedAt locally so we can write the final URL in
    // a single repository.updateCourse call. CoursesRepository.updateCourse
    // overwrites updatedAt internally; we mirror its clock by formatting now()
    // the same way (UTC ISO string).
    const updatedAt = new Date().toISOString() as Course['updatedAt'];
    const coverImageUrl = `${this.cfg.publicBaseUrl}/${path}?v=${encodeURIComponent(updatedAt)}`;
    await this.courses.updateCourse(courseId, { coverImageUrl } as Partial<Course>);
    return { coverImageUrl, updatedAt };
  }

  async removeCover(courseId: CourseId): Promise<{ updatedAt: Course['updatedAt'] }> {
    const path = `course-covers/${courseId}/cover.jpg`;
    await this.storage.deleteObject({ path });
    const updatedAt = new Date().toISOString() as Course['updatedAt'];
    // Use the dedicated field-delete path: a plain updateCourse with
    // `coverImageUrl: undefined` is a no-op in Firebase Admin because
    // `.update()` strips undefined keys, leaving the URL in place.
    await this.courses.clearCoverImageUrl(courseId);
    return { updatedAt };
  }
}
