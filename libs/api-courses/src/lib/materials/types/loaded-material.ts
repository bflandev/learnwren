import type { Material } from '@learnwren/shared-data-models';

import type { AuthenticatedRequest } from '@learnwren/api-auth';

export interface MaterialScopedRequest extends AuthenticatedRequest {
  material?: Material;
  params: AuthenticatedRequest['params'] & {
    matId?: string;
    cid?: string;
    mid?: string;
    lid?: string;
  };
}
