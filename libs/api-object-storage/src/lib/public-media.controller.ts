import { Controller, Get, Inject, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';

import { OBJECT_STORAGE_CONFIG, type ObjectStorageConfig } from './object-storage.config';
import { OBJECT_STORAGE, type ObjectStorage } from './object-storage.port';

/** One year: the URLs the platform mints carry a `v=` version, so they can be immutable. */
const PUBLIC_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Anonymous reads for the buckets named in LEARNWREN_PUBLIC_BUCKETS (course
 * covers, profile pictures) — the self-hosted stand-in for a public bucket URL,
 * so the object store itself never has to be reachable from a browser and no
 * vendor-specific bucket policy is needed. Public by design: the allow-list is
 * the only gate, and everything outside it is a 404.
 */
@Controller('media')
export class PublicMediaController {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(OBJECT_STORAGE_CONFIG) private readonly cfg: ObjectStorageConfig,
  ) {}

  @Get(':bucket/:key')
  async serve(@Param('bucket') bucket: string, @Param('key') key: string, @Res() res: Response): Promise<void> {
    if (!this.cfg.publicBuckets.includes(bucket)) throw new NotFoundException();
    const head = await this.storage.headObject({ bucket, path: key });
    if (!head) throw new NotFoundException();
    res.setHeader('Content-Type', head.contentType ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(head.size));
    res.setHeader('Cache-Control', PUBLIC_CACHE_CONTROL);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const stream = this.storage.openReadStream({ bucket, path: key });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }
}
