import { describe, expect, it, vi } from 'vitest';

import type { Video, VideoId } from '@learnwren/shared-data-models';

import type { EnrollmentRepository } from '../../enrollment/enrollment.repository';
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

function makeEnrollment(isEnrolled: boolean): EnrollmentRepository {
  return {
    isEnrolled: vi.fn().mockResolvedValue(isEnrolled),
  } as unknown as EnrollmentRepository;
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
    const guard = new EnrollmentOrOwnerGuard(makeRepo(null), makeEnrollment(false));
    await expect(
      guard.canActivate(ctxFor({ params: {}, user: { uid: 'u1' } })),
    ).rejects.toBeInstanceOf(VideoNotFoundException);
  });

  it('throws VIDEO_NOT_FOUND when the video does not exist', async () => {
    const guard = new EnrollmentOrOwnerGuard(makeRepo(null), makeEnrollment(false));
    await expect(
      guard.canActivate(ctxFor({ params: { vid: 'v1' }, user: { uid: 'u1' } })),
    ).rejects.toBeInstanceOf(VideoNotFoundException);
  });

  it('throws VIDEO_NOT_READY when state is not READY', async () => {
    const transcoding = { ...readyVideo, state: 'TRANSCODING' as const };
    const guard = new EnrollmentOrOwnerGuard(makeRepo(transcoding), makeEnrollment(false));
    await expect(
      guard.canActivate(ctxFor({ params: { vid: 'v1' }, user: { uid: 'u1' } })),
    ).rejects.toBeInstanceOf(VideoNotReadyException);
  });

  it('attaches video and returns true when the requester is the owner', async () => {
    const enrollment = makeEnrollment(false);
    const guard = new EnrollmentOrOwnerGuard(makeRepo(readyVideo), enrollment);
    const req: Record<string, unknown> = { params: { vid: 'v1' }, user: { uid: 'u1' } };
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req['video']).toEqual(readyVideo);
    // The owner check short-circuits — no enrolment lookup needed.
    expect(enrollment.isEnrolled).not.toHaveBeenCalled();
  });

  it('attaches video and returns true for an ACTIVE-enrolled non-owner', async () => {
    const enrollment = makeEnrollment(true);
    const guard = new EnrollmentOrOwnerGuard(makeRepo(readyVideo), enrollment);
    const req: Record<string, unknown> = { params: { vid: 'v1' }, user: { uid: 'u2' } };
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req['video']).toEqual(readyVideo);
    expect(enrollment.isEnrolled).toHaveBeenCalledWith('u2', 'c1');
  });

  it('throws NOT_VIDEO_OWNER for a non-owner who is not enrolled', async () => {
    const guard = new EnrollmentOrOwnerGuard(makeRepo(readyVideo), makeEnrollment(false));
    await expect(
      guard.canActivate(ctxFor({ params: { vid: 'v1' }, user: { uid: 'u2' } })),
    ).rejects.toBeInstanceOf(NotVideoOwnerException);
  });

  it('throws NOT_VIDEO_OWNER (not TypeError) when req.user is entirely missing', async () => {
    const guard = new EnrollmentOrOwnerGuard(makeRepo(readyVideo), makeEnrollment(false));
    await expect(
      guard.canActivate(ctxFor({ params: { vid: 'v1' } })),
    ).rejects.toBeInstanceOf(NotVideoOwnerException);
  });
});
