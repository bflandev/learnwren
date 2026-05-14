import { Controller, Get, Param, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { FirebaseSessionGuard } from '@learnwren/api-auth';
import type { Video } from '@learnwren/shared-data-models';

import { RenditionNotFoundException } from '../errors/video.exception';
import { VideoExceptionFilter } from '../video.exception-filter';
import { CurrentVideo } from './current-video.decorator';
import { EnrollmentOrOwnerGuard } from './enrollment-or-owner.guard';
import { KeyService } from './key.service';
import { isAllowedRendition, type RenditionName } from './manifest.rewriter';
import { ManifestService } from './manifest.service';

const M3U8_CONTENT_TYPE = 'application/vnd.apple.mpegurl; charset=utf-8';

@Controller('playback')
@UseFilters(VideoExceptionFilter)
@UseGuards(FirebaseSessionGuard, EnrollmentOrOwnerGuard)
export class PlaybackController {
  constructor(
    private readonly manifest: ManifestService,
    private readonly keys: KeyService,
  ) {}

  @Get('manifest/:vid')
  async master(@CurrentVideo() video: Video, @Res() res: Response): Promise<void> {
    const body = await this.manifest.fetchMaster(video);
    res.setHeader('Content-Type', M3U8_CONTENT_TYPE);
    res.setHeader('Cache-Control', 'no-store');
    res.send(body);
  }

  @Get('manifest/:vid/rendition/:r')
  async rendition(
    @CurrentVideo() video: Video,
    @Param('r') r: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!isAllowedRendition(r)) {
      throw new RenditionNotFoundException(r);
    }
    const body = await this.manifest.fetchRendition(video, r as RenditionName);
    res.setHeader('Content-Type', M3U8_CONTENT_TYPE);
    res.setHeader('Cache-Control', 'no-store');
    res.send(body);
  }

  @Get('keys/:vid')
  async key(@CurrentVideo() video: Video, @Res() res: Response): Promise<void> {
    const buf = await this.keys.fetch(video);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Cache-Control', 'no-store');
    res.end(buf);
  }
}
