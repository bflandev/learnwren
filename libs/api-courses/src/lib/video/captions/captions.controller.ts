import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Put,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { FirebaseSessionGuard, InstructorRoleGuard } from '@learnwren/api-auth';
import type { Video, VideoCaptionsMeta } from '@learnwren/shared-data-models';

import { InvalidCaptionFileException } from '../errors/video.exception';
import { CurrentVideo } from '../playback/current-video.decorator';
import { VideoExceptionFilter } from '../video.exception-filter';
import { VideoOwnerGuard } from '../video-owner.guard';
import { CaptionsService } from './captions.service';

// Hard transport cap; the 256 KB business rule (→ CAPTION_TOO_LARGE 400) lives
// in CaptionsService. Anything between 256 KB and 1 MB yields a clean 400; the
// interceptor only rejects pathological payloads.
const MAX_UPLOAD_BYTES = 1_000_000;

@Controller()
@UseFilters(VideoExceptionFilter)
@UseGuards(FirebaseSessionGuard, InstructorRoleGuard)
export class CaptionsController {
  constructor(private readonly svc: CaptionsService) {}

  @Put('videos/:vid/captions')
  @UseGuards(VideoOwnerGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentVideo() video: Video,
  ): Promise<VideoCaptionsMeta> {
    if (!file) throw new InvalidCaptionFileException();
    return this.svc.put(video.id, file.buffer);
  }

  @Get('videos/:vid/captions')
  @UseGuards(VideoOwnerGuard)
  meta(@CurrentVideo() video: Video): Promise<VideoCaptionsMeta | null> {
    return this.svc.getMeta(video.id);
  }

  @Delete('videos/:vid/captions')
  @UseGuards(VideoOwnerGuard)
  @HttpCode(204)
  async remove(@CurrentVideo() video: Video): Promise<void> {
    await this.svc.remove(video.id);
  }
}
