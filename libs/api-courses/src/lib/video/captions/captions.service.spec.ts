import { describe, expect, it, vi } from 'vitest';

import type { VideoCaptions, VideoId } from '@learnwren/shared-data-models';

import {
  CaptionTooLargeException,
  InvalidCaptionFileException,
  InvalidCaptionLanguageException,
} from '../errors/video.exception';
import { CaptionsService } from './captions.service';

const VID = 'v1' as VideoId;

function track(language: string, label: string, updatedAt = '2026-02-02T00:00:00.000Z'): VideoCaptions {
  return {
    videoId: VID, language, label, format: 'vtt', content: `WEBVTT\n\n${language}`,
    createdAt: 'x' as VideoCaptions['createdAt'], updatedAt: updatedAt as VideoCaptions['updatedAt'],
  };
}

function makeRepo(tracks: VideoCaptions[] = []) {
  return {
    listCaptions: vi.fn().mockResolvedValue(tracks),
    getCaptions: vi.fn(async (_vid: VideoId, lang: string) => tracks.find((t) => t.language === lang) ?? null),
    upsertCaptions: vi.fn().mockResolvedValue(undefined),
    deleteCaptions: vi.fn().mockResolvedValue(undefined),
  };
}

const VALID = Buffer.from('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHi\n', 'utf-8');

describe('CaptionsService', () => {
  it('stores valid WebVTT under the canonical language with a derived label', async () => {
    const repo = makeRepo();
    const svc = new CaptionsService(repo as never);
    const meta = await svc.put(VID, 'PT-br', VALID);
    expect(meta).toEqual({ language: 'pt-BR', label: 'Brazilian Portuguese', updatedAt: expect.any(String) });
    expect(repo.upsertCaptions).toHaveBeenCalledWith(
      expect.objectContaining({
        videoId: VID, language: 'pt-BR', label: 'Brazilian Portuguese', format: 'vtt',
        content: VALID.toString('utf-8'), updatedAt: meta.updatedAt,
      }),
    );
  });

  it('rejects an unknown language before touching the repo', async () => {
    const repo = makeRepo();
    const svc = new CaptionsService(repo as never);
    await expect(svc.put(VID, 'xx', VALID)).rejects.toBeInstanceOf(InvalidCaptionLanguageException);
    expect(repo.upsertCaptions).not.toHaveBeenCalled();
  });

  it('rejects a non-WebVTT body', async () => {
    const svc = new CaptionsService(makeRepo() as never);
    await expect(svc.put(VID, 'en', Buffer.from('not vtt', 'utf-8'))).rejects.toBeInstanceOf(
      InvalidCaptionFileException,
    );
  });

  it('rejects a body over 256 KB', async () => {
    const svc = new CaptionsService(makeRepo() as never);
    const big = Buffer.concat([VALID, Buffer.alloc(256_001)]);
    await expect(svc.put(VID, 'en', big)).rejects.toBeInstanceOf(CaptionTooLargeException);
  });

  it('accepts a body of exactly 256_000 bytes (boundary is inclusive)', async () => {
    const repo = makeRepo();
    const svc = new CaptionsService(repo as never);
    const exact = Buffer.concat([VALID, Buffer.from('\n'.repeat(256_000 - VALID.length), 'utf-8')]);
    expect(exact.length).toBe(256_000);
    await svc.put(VID, 'en', exact);
    expect(repo.upsertCaptions).toHaveBeenCalledOnce();
  });

  it('listMeta returns every track without bodies, sorted by label', async () => {
    const svc = new CaptionsService(makeRepo([track('fr', 'French'), track('en', 'English')]) as never);
    expect(await svc.listMeta(VID)).toEqual([
      { language: 'en', label: 'English', updatedAt: '2026-02-02T00:00:00.000Z' },
      { language: 'fr', label: 'French', updatedAt: '2026-02-02T00:00:00.000Z' },
    ]);
  });

  it('listMeta returns [] when the video has no captions', async () => {
    expect(await new CaptionsService(makeRepo() as never).listMeta(VID)).toEqual([]);
  });

  it('getForDelivery looks the track up by canonical language', async () => {
    const fr = track('fr', 'French');
    const repo = makeRepo([fr]);
    const svc = new CaptionsService(repo as never);
    expect(await svc.getForDelivery(VID, 'FR')).toBe(fr);
    expect(repo.getCaptions).toHaveBeenCalledWith(VID, 'fr');
  });

  it('getForDelivery returns null for an invalid language without querying', async () => {
    const repo = makeRepo();
    expect(await new CaptionsService(repo as never).getForDelivery(VID, 'a/b')).toBeNull();
    expect(repo.getCaptions).not.toHaveBeenCalled();
  });

  it('remove deletes the canonical language', async () => {
    const repo = makeRepo();
    await new CaptionsService(repo as never).remove(VID, 'EN');
    expect(repo.deleteCaptions).toHaveBeenCalledWith(VID, 'en');
  });

  it('remove rejects an invalid language', async () => {
    const repo = makeRepo();
    await expect(new CaptionsService(repo as never).remove(VID, 'xx')).rejects.toBeInstanceOf(
      InvalidCaptionLanguageException,
    );
    expect(repo.deleteCaptions).not.toHaveBeenCalled();
  });
});
