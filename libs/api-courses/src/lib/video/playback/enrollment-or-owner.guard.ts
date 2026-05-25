import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { VideoId } from '@learnwren/shared-data-models';

import { CoursesRepository } from '../../courses.repository';
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
    private readonly courses: CoursesRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<VideoScopedRequest>();
    const vid = req.params?.['vid'] as VideoId | undefined;
    if (!vid) throw new VideoNotFoundException();

    const video = await this.repo.getVideo(vid);
    if (!video) throw new VideoNotFoundException();
    if (video.state !== 'READY') throw new VideoNotReadyException(video.state);

    // Owners (instructors of the course) keep preview access regardless of
    // course.status — they need to verify content before re-publishing.
    if (video.ownerInstructorId === req.user?.uid) {
      req.video = video;
      return true;
    }

    // Enrolled students require the course to still be PUBLISHED. Once an
    // instructor unpublishes or archives, in-flight enrolments can no longer
    // pull new manifests or AES keys. (Active 4 h signed segment URLs expire
    // naturally; revoking them would require a separate denylist.)
    if (req.user && (await this.enrollment.isEnrolled(req.user.uid, video.courseId))) {
      const course = await this.courses.getCourse(video.courseId);
      if (course?.status === 'PUBLISHED') {
        req.video = video;
        return true;
      }
    }

    throw new NotVideoOwnerException();
  }
}
