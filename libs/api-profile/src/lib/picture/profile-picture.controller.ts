import {
  Controller,
  Delete,
  Put,
  Req,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { FirebaseSessionGuard, type AuthenticatedRequest } from '@learnwren/api-auth';
import type { MeResponse } from '@learnwren/shared-data-models';

import {
  PictureTooLargeException,
  UnsupportedPictureFormatException,
} from './errors/picture.exception';
import { PictureExceptionFilter } from './picture.exception-filter';
import { ProfilePictureService } from './profile-picture.service';

const MAX_BYTES = 2_000_000;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png']);

@Controller('profile')
@UseFilters(PictureExceptionFilter)
@UseGuards(FirebaseSessionGuard)
export class ProfilePictureController {
  constructor(private readonly svc: ProfilePictureService) {}

  @Put('picture')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_BYTES },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthenticatedRequest,
  ): Promise<MeResponse> {
    if (!file) throw new UnsupportedPictureFormatException();
    if (!ALLOWED_MIME.has(file.mimetype)) throw new UnsupportedPictureFormatException();
    if (file.size > MAX_BYTES) throw new PictureTooLargeException();
    const user = req.user!;
    return this.svc.uploadPicture(
      user.uid,
      file.buffer,
      file.mimetype as 'image/jpeg' | 'image/png',
      { email: user.email, emailVerified: user.emailVerified },
    );
  }

  @Delete('picture')
  async remove(@Req() req: AuthenticatedRequest): Promise<MeResponse> {
    const user = req.user!;
    return this.svc.removePicture(user.uid, {
      email: user.email,
      emailVerified: user.emailVerified,
    });
  }
}
