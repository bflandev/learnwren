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

    const jpeg = await pipeline
      .resize({ width: MAX_WIDTH, height: MAX_HEIGHT, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    const path = `course-covers/${courseId}/cover.jpg`;
    await this.storage.putObject({
      path,
      contentType: 'image/jpeg',
      body: jpeg,
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { courseId: String(courseId) },
    });

    await this.courses.updateCourse(courseId, {
      coverImageUrl: '__placeholder__',
    } as Partial<Course>);
    const updated = await this.courses.getCourse(courseId);
    const updatedAt = updated!.updatedAt;
    const coverImageUrl = `${this.cfg.publicBaseUrl}/${path}?v=${encodeURIComponent(updatedAt)}`;
    await this.courses.updateCourse(courseId, { coverImageUrl } as Partial<Course>);
    return { coverImageUrl, updatedAt };
  }

  async removeCover(courseId: CourseId): Promise<{ updatedAt: Course['updatedAt'] }> {
    const path = `course-covers/${courseId}/cover.jpg`;
    await this.storage.deleteObject({ path });
    await this.courses.updateCourse(courseId, { coverImageUrl: undefined } as Partial<Course>);
    const updated = await this.courses.getCourse(courseId);
    return { updatedAt: updated!.updatedAt };
  }
}
