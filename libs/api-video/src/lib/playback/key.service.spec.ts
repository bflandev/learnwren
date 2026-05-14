import { describe, expect, it, vi } from 'vitest';

import type { Video, VideoKey, VideoKeyId } from '@learnwren/shared-data-models';

import { KeyLookupFailedException } from '../errors/video.exception';
import type { VideoRepository } from '../video.repository';
import { KeyService } from './key.service';

function makeRepo(key: VideoKey | null): VideoRepository {
  return {
    getVideoKey: vi.fn().mockResolvedValue(key),
  } as unknown as VideoRepository;
}

const KID = 'k1' as VideoKeyId;

const KEY_BYTES = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
const KEY_DOC: VideoKey = {
  id: KID,
  videoId: 'v1' as VideoKey['videoId'],
  key: Buffer.from(KEY_BYTES).toString('base64'),
  createdAt: 'now' as VideoKey['createdAt'],
};

const READY_VIDEO: Video = {
  id: 'v1' as Video['id'],
  ownerInstructorId: 'u1' as Video['ownerInstructorId'],
  courseId: 'c1' as Video['courseId'],
  lessonId: 'l1' as Video['lessonId'],
  state: 'READY',
  source: { bucket: 'src', path: 'p' },
  output: { bucket: 'out', manifestPath: 'videos/v1/hls/manifest.m3u8', durationSec: 60 },
  keyId: KID,
  createdAt: 'now' as Video['createdAt'],
  updatedAt: 'now' as Video['updatedAt'],
};

describe('KeyService.fetch', () => {
  it('returns 16-byte Buffer for a healthy video', async () => {
    const svc = new KeyService(makeRepo(KEY_DOC));
    const buf = await svc.fetch(READY_VIDEO);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(16);
    expect(Array.from(buf)).toEqual(Array.from(KEY_BYTES));
  });

  it('throws KEY_LOOKUP_FAILED when keyId is missing on the video', async () => {
    const svc = new KeyService(makeRepo(KEY_DOC));
    const noKeyVideo = { ...READY_VIDEO, keyId: undefined };
    await expect(svc.fetch(noKeyVideo)).rejects.toBeInstanceOf(
      KeyLookupFailedException,
    );
  });

  it('throws KEY_LOOKUP_FAILED when the key document is absent', async () => {
    const svc = new KeyService(makeRepo(null));
    await expect(svc.fetch(READY_VIDEO)).rejects.toBeInstanceOf(
      KeyLookupFailedException,
    );
  });

  it('looks up the key by video.keyId (not by some other field)', async () => {
    const repo = makeRepo(KEY_DOC);
    const svc = new KeyService(repo);
    await svc.fetch(READY_VIDEO);
    expect(repo.getVideoKey).toHaveBeenCalledWith(KID);
  });
});
