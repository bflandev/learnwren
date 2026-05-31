import { describe, expect, it, vi } from 'vitest';

import type { VideoCaptions, VideoId } from '@learnwren/shared-data-models';

import {
  CaptionTooLargeException,
  InvalidCaptionFileException,
} from '../errors/video.exception';
import { CaptionsService } from './captions.service';

function makeRepo(existing: VideoCaptions | null = null) {
  return {
    getCaptions: vi.fn().mockResolvedValue(existing),
    getCaptionsMeta: vi.fn().mockResolvedValue(
      existing ? { language: existing.language, label: existing.label, updatedAt: existing.updatedAt } : null,
    ),
    upsertCaptions: vi.fn().mockResolvedValue(undefined),
    deleteCaptions: vi.fn().mockResolvedValue(undefined),
  };
}

const VALID = Buffer.from('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHi\n', 'utf-8');
const VID = 'v1' as VideoId;

describe('CaptionsService', () => {
  it('stores valid WebVTT and returns metadata', async () => {
    const repo = makeRepo();
    const svc = new CaptionsService(repo as never);
    const meta = await svc.put(VID, VALID);
    expect(meta.language).toBe('en');
    expect(meta.label).toBe('English');
    expect(repo.upsertCaptions).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: VID, format: 'vtt', content: VALID.toString('utf-8') }),
    );
  });

  it('preserves the original createdAt on replace', async () => {
    const existing = {
      videoId: VID, language: 'en', label: 'English', format: 'vtt',
      content: 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nold\n',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    } as VideoCaptions;
    const repo = makeRepo(existing);
    const svc = new CaptionsService(repo as never);
    await svc.put(VID, VALID);
    expect(repo.upsertCaptions).toHaveBeenCalledWith(
      expect.objectContaining({ createdAt: '2026-01-01T00:00:00.000Z' }),
    );
  });

  it('rejects a non-WebVTT body', async () => {
    const svc = new CaptionsService(makeRepo() as never);
    await expect(svc.put(VID, Buffer.from('not vtt', 'utf-8'))).rejects.toBeInstanceOf(
      InvalidCaptionFileException,
    );
  });

  it('rejects a body over 256 KB', async () => {
    const svc = new CaptionsService(makeRepo() as never);
    const big = Buffer.concat([VALID, Buffer.alloc(256_001)]);
    await expect(svc.put(VID, big)).rejects.toBeInstanceOf(CaptionTooLargeException);
  });

  it('getForDelivery returns the stored captions', async () => {
    const existing = { videoId: VID, content: 'WEBVTT\n', language: 'en', label: 'English', format: 'vtt', createdAt: 'x', updatedAt: 'x' } as VideoCaptions;
    const svc = new CaptionsService(makeRepo(existing) as never);
    expect(await svc.getForDelivery(VID)).toBe(existing);
  });

  it('remove delegates to the repo', async () => {
    const repo = makeRepo();
    await new CaptionsService(repo as never).remove(VID);
    expect(repo.deleteCaptions).toHaveBeenCalledWith(VID);
  });
});
