import { describe, expect, it, vi } from 'vitest';

import type { Video, VideoId } from '@learnwren/shared-data-models';

import {
  NotVideoOwnerException,
  VideoNotFoundException,
  VideoNotReadyException,
} from '../errors/video.exception';
import type { VideoRepository } from '../video.repository';
import { EnrollmentOrOwnerGuard } from './enrollment-or-owner.guard';

function ctxFor(req: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as Parameters<EnrollmentOrOwnerGuard['canActivate']>[0];
}

function makeRepo(video: Video | null): VideoRepository {
  return { getVideo: vi.fn().mockResolvedValue(video) } as unknown as VideoRepository;
}

const readyVideo: Video = {
  id: 'v1' as VideoId,
  ownerInstructorId: 'u1' as Video['ownerInstructorId'],
  courseId: 'c1' as Video['courseId'],
  lessonId: 'l1' as Video['lessonId'],
  state: 'READY',
  source: { bucket: 'src', path: 'p' },
  output: { bucket: 'out', manifestPath: 'videos/v1/hls/manifest.m3u8', durationSec: 60 },
  keyId: 'k1' as Video['keyId'],
  createdAt: 'now' as Video['createdAt'],
  updatedAt: 'now' as Video['updatedAt'],
};

describe('EnrollmentOrOwnerGuard', () => {
  it('throws VIDEO_NOT_FOUND when :vid is missing from params', async () => {
    const guard = new EnrollmentOrOwnerGuard(makeRepo(null));
    await expect(
      guard.canActivate(ctxFor({ params: {}, user: { uid: 'u1' } })),
    ).rejects.toBeInstanceOf(VideoNotFoundException);
  });

  it('short-circuits without calling the repo when :vid is missing', async () => {
    // Pins the `if (!vid)` early-throw — without it, repo.getVideo(undefined) would still run.
    const repo = makeRepo(null);
    const guard = new EnrollmentOrOwnerGuard(repo);
    await expect(
      guard.canActivate(ctxFor({ params: {}, user: { uid: 'u1' } })),
    ).rejects.toBeInstanceOf(VideoNotFoundException);
    expect(repo.getVideo).not.toHaveBeenCalled();
  });

  it('throws NOT_VIDEO_OWNER (not TypeError) when req.user is entirely missing', async () => {
    // Defends the `req.user?.uid` optional-chain mutation: without `?.`, accessing
    // `.uid` on undefined throws TypeError instead of the domain-correct exception.
    const guard = new EnrollmentOrOwnerGuard(makeRepo(readyVideo));
    await expect(
      guard.canActivate(ctxFor({ params: { vid: 'v1' } })),
    ).rejects.toBeInstanceOf(NotVideoOwnerException);
  });

  it('throws VIDEO_NOT_FOUND when the video does not exist', async () => {
    const guard = new EnrollmentOrOwnerGuard(makeRepo(null));
    await expect(
      guard.canActivate(ctxFor({ params: { vid: 'v1' }, user: { uid: 'u1' } })),
    ).rejects.toBeInstanceOf(VideoNotFoundException);
  });

  it('throws VIDEO_NOT_READY when state is not READY', async () => {
    const transcoding = { ...readyVideo, state: 'TRANSCODING' as const };
    const guard = new EnrollmentOrOwnerGuard(makeRepo(transcoding));
    await expect(
      guard.canActivate(ctxFor({ params: { vid: 'v1' }, user: { uid: 'u1' } })),
    ).rejects.toBeInstanceOf(VideoNotReadyException);
  });

  it('attaches video and returns true when requester is the owner', async () => {
    const guard = new EnrollmentOrOwnerGuard(makeRepo(readyVideo));
    const req: Record<string, unknown> = { params: { vid: 'v1' }, user: { uid: 'u1' } };
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req['video']).toEqual(readyVideo);
  });

  it('throws NOT_VIDEO_OWNER for a non-owner today (EP-06 enrolled-student branch falls through)', async () => {
    const guard = new EnrollmentOrOwnerGuard(makeRepo(readyVideo));
    await expect(
      guard.canActivate(ctxFor({ params: { vid: 'v1' }, user: { uid: 'u2' } })),
    ).rejects.toBeInstanceOf(NotVideoOwnerException);
  });

  it('does not look up enrollment yet — owner check happens first (EP-06 TODO)', async () => {
    // Today: a non-owner is rejected without any enrollment lookup. Once EP-06 wires
    // an enrollment port, this test should change to assert the lookup IS attempted.
    const repo = makeRepo(readyVideo);
    const guard = new EnrollmentOrOwnerGuard(repo);
    await expect(
      guard.canActivate(ctxFor({ params: { vid: 'v1' }, user: { uid: 'u2' } })),
    ).rejects.toBeInstanceOf(NotVideoOwnerException);
    // Single getVideo call, nothing else
    expect(repo.getVideo).toHaveBeenCalledOnce();
  });
});
