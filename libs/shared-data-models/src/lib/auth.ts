import type { UserId } from './common';
import type { UserRole } from './user';

/** Body of `GET /api/auth/me` — the authenticated user the server hands back. */
export interface MeResponse {
  uid: UserId;
  email: string;
  displayName: string;
  photoUrl?: string;
  role: UserRole;
  emailVerified: boolean;
}
