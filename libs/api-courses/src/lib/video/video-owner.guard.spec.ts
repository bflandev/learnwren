import { describe, expect, it, vi } from 'vitest';

import type { Video, VideoId } from '@learnwren/shared-data-models';

import {
  NotVideoOwnerException,
  VideoNotFoundException,
} from './errors/video.exception';
import { VideoOwnerGuard } from './video-owner.guard';
import type { VideoRepository } from './video.repository';

function ctxFor(req: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as Parameters<VideoOwnerGuard['canActivate']>[0];
}

function makeRepo(video: Video | null): VideoRepository {
  return { getVideo: vi.fn().mockResolvedValue(video) } as unknown as VideoRepository;
}

const video: Video = {
  id: 'v1' as VideoId,
  ownerInstructorId: 'u1' as Video['ownerInstructorId'],
  courseId: 'c1' as Video['courseId'],
  lessonId: 'l1' as Video['lessonId'],
  state: 'PENDING_UPLOAD',
  source: { bucket: 'b', path: 'p' },
  createdAt: 'now' as Video['createdAt'],
  updatedAt: 'now' as Video['updatedAt'],
};

describe('VideoOwnerGuard', () => {
  it('throws VIDEO_NOT_FOUND when :vid is missing', async () => {
    const guard = new VideoOwnerGuard(makeRepo(null));
    await expect(
      guard.canActivate(ctxFor({ params: {}, user: { uid: 'u1' } })),
    ).rejects.toBeInstanceOf(VideoNotFoundException);
  });

  it('throws VIDEO_NOT_FOUND when video does not exist', async () => {
    const guard = new VideoOwnerGuard(makeRepo(null));
    await expect(
      guard.canActivate(ctxFor({ params: { vid: 'v1' }, user: { uid: 'u1' } })),
    ).rejects.toBeInstanceOf(VideoNotFoundException);
  });

  it('throws NOT_VIDEO_OWNER when owner differs', async () => {
    const guard = new VideoOwnerGuard(makeRepo(video));
    await expect(
      guard.canActivate(ctxFor({ params: { vid: 'v1' }, user: { uid: 'u2' } })),
    ).rejects.toBeInstanceOf(NotVideoOwnerException);
  });

  it('attaches video and returns true on success', async () => {
    const guard = new VideoOwnerGuard(makeRepo(video));
    const req: Record<string, unknown> = { params: { vid: 'v1' }, user: { uid: 'u1' } };
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req['video']).toEqual(video);
  });
});
