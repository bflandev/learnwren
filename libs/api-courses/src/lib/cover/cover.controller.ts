import {
  Controller,
  Delete,
  HttpCode,
  Param,
  Put,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { FirebaseSessionGuard, InstructorRoleGuard } from '@learnwren/api-auth';
import type { CourseId, ISODateString } from '@learnwren/shared-data-models';

import { CourseOwnerGuard } from '../course-owner.guard';
import { CoverImageService } from './cover-image.service';
import { CoverExceptionFilter } from './cover.exception-filter';
import {
  CoverTooLargeException,
  UnsupportedCoverFormatException,
} from './errors/cover.exception';

const MAX_BYTES = 10_000_000;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png']);

@Controller()
@UseFilters(CoverExceptionFilter)
@UseGuards(FirebaseSessionGuard, InstructorRoleGuard)
export class CoverController {
  constructor(private readonly svc: CoverImageService) {}

  @Put('courses/:cid/cover')
  @UseGuards(CourseOwnerGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_BYTES },
    }),
  )
  async upload(
    @Param('cid') cid: CourseId,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ coverImageUrl: string; updatedAt: ISODateString }> {
    if (!file) throw new UnsupportedCoverFormatException();
    if (!ALLOWED_MIME.has(file.mimetype)) throw new UnsupportedCoverFormatException();
    if (file.size > MAX_BYTES) throw new CoverTooLargeException();
    return this.svc.uploadCover(cid, file.buffer, file.mimetype as 'image/jpeg' | 'image/png');
  }

  @Delete('courses/:cid/cover')
  @HttpCode(204)
  @UseGuards(CourseOwnerGuard)
  async remove(@Param('cid') cid: CourseId): Promise<void> {
    await this.svc.removeCover(cid);
  }
}
