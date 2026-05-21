import type { Video } from '@learnwren/shared-data-models';

import type { AuthenticatedRequest } from '@learnwren/api-auth';

export interface VideoScopedRequest extends AuthenticatedRequest {
  video?: Video;
  params: AuthenticatedRequest['params'] & { vid?: string };
}
