import { Injectable } from '@nestjs/common';

import type { Video } from '@learnwren/shared-data-models';

import { KeyLookupFailedException } from '../errors/video.exception';
import { VideoRepository } from '../video.repository';

@Injectable()
export class KeyService {
  constructor(private readonly repo: VideoRepository) {}

  async fetch(video: Video): Promise<Buffer> {
    if (!video.keyId) {
      throw new KeyLookupFailedException('video has no keyId');
    }
    const doc = await this.repo.getVideoKey(video.keyId);
    if (!doc) {
      throw new KeyLookupFailedException(`videoKeys/${video.keyId} missing`);
    }
    return Buffer.from(doc.key, 'base64');
  }
}
