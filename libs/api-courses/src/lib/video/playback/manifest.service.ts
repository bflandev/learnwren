import { Inject, Injectable } from '@nestjs/common';
import * as path from 'node:path';

import type { Video } from '@learnwren/shared-data-models';

import { hlsVariantPlaylistName } from '../hls-naming';
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
    // GCP writes the variant playlist and its segments FLAT at the output root
    // (alongside the master `manifest.m3u8`), named after the mux-stream key.
    // The variant playlist's segment URIs are therefore bare filenames relative
    // to that same directory — sign them against `baseDir`, not a per-rendition
    // subdirectory (which GCP never creates). See hls-naming.ts.
    const baseDir = path.posix.dirname(video.output!.manifestPath);
    const renditionPath = `${baseDir}/${hlsVariantPlaylistName(rendition)}`;
    const body = await this.storage.readManifestObject({
      bucket: video.output!.bucket,
      path: renditionPath,
    });
    const signSegment = (filename: string) =>
      this.storage.signObjectUrl({
        bucket: video.output!.bucket,
        path: `${baseDir}/${filename}`,
        ttlSec: this.cfg.playbackSignedUrlTtlSec,
      });
    return rewriteRendition(body, video.id, signSegment);
  }
}
