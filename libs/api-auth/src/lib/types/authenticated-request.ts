import type { Request } from 'express';

import type { UserId, UserRole } from '@learnwren/shared-data-models';

export interface AuthenticatedUser {
  uid: UserId;
  email: string;
  role: UserRole;
  emailVerified: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
