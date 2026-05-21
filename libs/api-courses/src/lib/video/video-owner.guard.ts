import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { VideoId } from '@learnwren/shared-data-models';

import {
  NotVideoOwnerException,
  VideoNotFoundException,
} from './errors/video.exception';
import type { VideoScopedRequest } from './types/loaded-video';
import { VideoRepository } from './video.repository';

@Injectable()
export class VideoOwnerGuard implements CanActivate {
  constructor(private readonly repo: VideoRepository) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<VideoScopedRequest>();
    const vid = req.params?.['vid'] as VideoId | undefined;
    if (!vid) throw new VideoNotFoundException();

    const video = await this.repo.getVideo(vid);
    if (!video) throw new VideoNotFoundException();
    if (video.ownerInstructorId !== req.user?.uid) {
      throw new NotVideoOwnerException();
    }
    req.video = video;
    return true;
  }
}
