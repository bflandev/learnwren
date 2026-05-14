import { Inject, Injectable } from '@nestjs/common';
import * as path from 'node:path';

import type { Video } from '@learnwren/shared-data-models';

import { VIDEO_CONFIG, type VideoConfig } from '../video.config';
import { VideoStorageAdapter } from '../video-storage.adapter';
import { rewriteMaster, rewriteRendition, type RenditionName } from './manifest.rewriter';

@Injectable()
export class ManifestService {
  constructor(
    private readonly storage: VideoStorageAdapter,
    @Inject(VIDEO_CONFIG) private readonly cfg: VideoConfig,
  ) {}

  async fetchMaster(video: Video): Promise<string> {
    const body = await this.storage.readManifestObject({
      bucket: video.output!.bucket,
      path: video.output!.manifestPath,
    });
    return rewriteMaster(body, video.id);
  }

  async fetchRendition(video: Video, rendition: RenditionName): Promise<string> {
    const baseDir = path.posix.dirname(video.output!.manifestPath);
    const renditionPath = `${baseDir}/${rendition}/playlist.m3u8`;
    const body = await this.storage.readManifestObject({
      bucket: video.output!.bucket,
      path: renditionPath,
    });
    const signSegment = (filename: string) =>
      this.storage.signObjectUrl({
        bucket: video.output!.bucket,
        path: `${baseDir}/${rendition}/${filename}`,
        ttlSec: this.cfg.playbackSignedUrlTtlSec,
      });
    return rewriteRendition(body, video.id, signSegment);
  }
}
