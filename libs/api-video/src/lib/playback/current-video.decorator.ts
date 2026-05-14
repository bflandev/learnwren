import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import type { Video } from '@learnwren/shared-data-models';

import type { VideoScopedRequest } from '../types/loaded-video';

export const CurrentVideo = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Video => {
    const req = ctx.switchToHttp().getRequest<VideoScopedRequest>();
    if (!req.video) {
      throw new Error(
        '@CurrentVideo() used on a route without EnrollmentOrOwnerGuard.',
      );
    }
    return req.video;
  },
);
