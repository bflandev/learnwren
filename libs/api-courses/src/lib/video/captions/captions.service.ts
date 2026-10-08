import { Injectable } from '@nestjs/common';

import { nowIso, resolveCaptionLanguage } from '@learnwren/shared-data-models';
import type { VideoCaptions, VideoCaptionsMeta, VideoId } from '@learnwren/shared-data-models';

import {
  CaptionTooLargeException,
  InvalidCaptionFileException,
  InvalidCaptionLanguageException,
} from '../errors/video.exception';
import { VideoRepository } from '../video.repository';
import { isValidWebVtt } from './webvtt.validator';

const MAX_CAPTION_BYTES = 256_000;

function requireLanguage(raw: string): { language: string; label: string } {
  const resolved = resolveCaptionLanguage(raw);
  if (!resolved) throw new InvalidCaptionLanguageException();
  return resolved;
}

function toMeta(c: VideoCaptions): VideoCaptionsMeta {
  return { language: c.language, label: c.label, updatedAt: c.updatedAt };
}

@Injectable()
export class CaptionsService {
  constructor(private readonly repo: VideoRepository) {}

  async put(videoId: VideoId, rawLanguage: string, body: Buffer): Promise<VideoCaptionsMeta> {
    const { language, label } = requireLanguage(rawLanguage);
    if (body.length > MAX_CAPTION_BYTES) throw new CaptionTooLargeException();
    const text = body.toString('utf-8');
    if (!isValidWebVtt(text)) throw new InvalidCaptionFileException();

    const now = nowIso();
    // The repo's transactional upsert checks video existence, the track cap and
    // preserves an existing track's createdAt; `createdAt: now` is the create-case fallback.
    const captions: VideoCaptions = {
      videoId, language, label, format: 'vtt', content: text, createdAt: now, updatedAt: now,
    };
    await this.repo.upsertCaptions(captions);
    return toMeta(captions);
  }

  async listMeta(videoId: VideoId): Promise<VideoCaptionsMeta[]> {
    const tracks = await this.repo.listCaptions(videoId);
    return tracks.map(toMeta).sort((a, b) => a.label.localeCompare(b.label));
  }

  getForDelivery(videoId: VideoId, rawLanguage: string): Promise<VideoCaptions | null> {
    const resolved = resolveCaptionLanguage(rawLanguage);
    return resolved ? this.repo.getCaptions(videoId, resolved.language) : Promise.resolve(null);
  }

  async remove(videoId: VideoId, rawLanguage: string): Promise<void> {
    await this.repo.deleteCaptions(videoId, requireLanguage(rawLanguage).language);
  }
}
