import { Injectable } from '@nestjs/common';

import { nowIso } from '@learnwren/shared-data-models';
import type {
  ISODateString,
  VideoCaptions,
  VideoCaptionsMeta,
  VideoId,
} from '@learnwren/shared-data-models';

import {
  CaptionTooLargeException,
  InvalidCaptionFileException,
} from '../errors/video.exception';
import { VideoRepository } from '../video.repository';
import { isValidWebVtt } from './webvtt.validator';

const MAX_CAPTION_BYTES = 256_000;
const DEFAULT_LANGUAGE = 'en';
const DEFAULT_LABEL = 'English';

@Injectable()
export class CaptionsService {
  constructor(private readonly repo: VideoRepository) {}

  async put(videoId: VideoId, body: Buffer): Promise<VideoCaptionsMeta> {
    if (body.length > MAX_CAPTION_BYTES) throw new CaptionTooLargeException();
    const text = body.toString('utf-8');
    if (!isValidWebVtt(text)) throw new InvalidCaptionFileException();

    const now = nowIso();
    // The repo's transactional upsert checks video existence and preserves an
    // existing doc's createdAt; `createdAt: now` is only the create-case fallback.
    const captions: VideoCaptions = {
      videoId,
      language: DEFAULT_LANGUAGE,
      label: DEFAULT_LABEL,
      format: 'vtt',
      content: text,
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.upsertCaptions(captions);
    return { language: captions.language, label: captions.label, updatedAt: captions.updatedAt };
  }

  getMeta(videoId: VideoId): Promise<VideoCaptionsMeta | null> {
    return this.repo.getCaptionsMeta(videoId);
  }

  getForDelivery(videoId: VideoId): Promise<VideoCaptions | null> {
    return this.repo.getCaptions(videoId);
  }

  async remove(videoId: VideoId): Promise<void> {
    await this.repo.deleteCaptions(videoId);
  }
}
