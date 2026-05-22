import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { VideoId } from '@learnwren/shared-data-models';

import { EnrollmentRepository } from '../../enrollment/enrollment.repository';
import {
  NotVideoOwnerException,
  VideoNotFoundException,
  VideoNotReadyException,
} from '../errors/video.exception';
import type { VideoScopedRequest } from '../types/loaded-video';
import { VideoRepository } from '../video.repository';

@Injectable()
export class EnrollmentOrOwnerGuard implements CanActivate {
  constructor(
    private readonly repo: VideoRepository,
    private readonly enrollment: EnrollmentRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<VideoScopedRequest>();
    const vid = req.params?.['vid'] as VideoId | undefined;
    if (!vid) throw new VideoNotFoundException();

    const video = await this.repo.getVideo(vid);
    if (!video) throw new VideoNotFoundException();
    if (video.state !== 'READY') throw new VideoNotReadyException(video.state);

    if (video.ownerInstructorId === req.user?.uid) {
      req.video = video;
      return true;
    }

    if (req.user && (await this.enrollment.isEnrolled(req.user.uid, video.courseId))) {
      req.video = video;
      return true;
    }

    throw new NotVideoOwnerException();
  }
}
