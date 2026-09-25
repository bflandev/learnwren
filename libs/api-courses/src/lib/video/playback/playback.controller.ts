import { Controller, Get, Inject, Param, Res, UseFilters, UseGuards } from '@nestjs/common';
import * as path from 'node:path';
import type { Response } from 'express';

import { FirebaseSessionGuard } from '@learnwren/api-auth';
import type { Video } from '@learnwren/shared-data-models';

import {
  CaptionsNotFoundException,
  RenditionNotFoundException,
  SegmentNotFoundException,
} from '../errors/video.exception';
import { CaptionsService } from '../captions/captions.service';
import { VIDEO_CONFIG, type VideoConfig } from '../video.config';
import { VideoExceptionFilter } from '../video.exception-filter';
import { VideoStorageAdapter } from '../video-storage.adapter';
import { CurrentVideo } from './current-video.decorator';
import { EnrollmentOrOwnerGuard } from './enrollment-or-owner.guard';
import { KeyService } from './key.service';
import { isAllowedRendition, SAFE_SEGMENT_NAME, type RenditionName } from './manifest.rewriter';
import { ManifestService } from './manifest.service';

const M3U8_CONTENT_TYPE = 'application/vnd.apple.mpegurl; charset=utf-8';
const MPEG_TS_CONTENT_TYPE = 'video/mp2t';

@Controller('playback')
@UseFilters(VideoExceptionFilter)
@UseGuards(FirebaseSessionGuard, EnrollmentOrOwnerGuard)
export class PlaybackController {
  constructor(
    private readonly manifest: ManifestService,
    private readonly keys: KeyService,
    private readonly captionsSvc: CaptionsService,
    private readonly storage: VideoStorageAdapter,
    @Inject(VIDEO_CONFIG) private readonly cfg: VideoConfig,
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

  /**
   * Proxied segment delivery for self-hosted stacks (no signing credentials).
   * Guards re-authorise every request; the name must be a flat segment
   * filename (the same rule the rewriter applies) so nothing outside the
   * video's output directory is reachable.
   */
  @Get('segment/:vid/:name')
  async segment(
    @CurrentVideo() video: Video,
    @Param('name') name: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!SAFE_SEGMENT_NAME.test(name)) throw new SegmentNotFoundException(name);
    const bucket = video.output!.bucket;
    const objectPath = `${path.posix.dirname(video.output!.manifestPath)}/${name}`;
    // HEAD first so a missing object renders the normal 404 envelope through
    // the filter; once streaming starts, headers are gone and the only honest
    // answer to a failure is to drop the connection.
    const head = await this.storage.headObject({ bucket, path: objectPath });
    if (!head) throw new SegmentNotFoundException(name);
    res.setHeader('Content-Type', MPEG_TS_CONTENT_TYPE);
    res.setHeader('Cache-Control', `private, max-age=${this.cfg.playbackSignedUrlTtlSec}, immutable`);
    const stream = this.storage.openObjectReadStream({ bucket, path: objectPath });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  @Get('keys/:vid')
  async key(@CurrentVideo() video: Video, @Res() res: Response): Promise<void> {
    const buf = await this.keys.fetch(video);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Cache-Control', 'no-store');
    res.end(buf);
  }

  @Get('captions/:vid')
  async captions(@CurrentVideo() video: Video, @Res() res: Response): Promise<void> {
    const captions = await this.captionsSvc.getForDelivery(video.id);
    if (!captions) throw new CaptionsNotFoundException();
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(captions.content);
  }
}
