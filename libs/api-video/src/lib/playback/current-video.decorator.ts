import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import type { Video } from '@learnwren/shared-data-models';

import type { VideoScopedRequest } from '../types/loaded-video';

/**
 * Exported for unit testing. NestJS' `createParamDecorator` hides the inner
 * factory from runtime access, so we hold a separate reference here and pass
 * it to `createParamDecorator` below.
 */
export function currentVideoFactory(
  _data: unknown,
  ctx: ExecutionContext,
): Video {
  const req = ctx.switchToHttp().getRequest<VideoScopedRequest>();
  if (!req.video) {
    throw new Error(
      '@CurrentVideo() used on a route without EnrollmentOrOwnerGuard.',
    );
  }
  return req.video;
}

export const CurrentVideo = createParamDecorator(currentVideoFactory);
