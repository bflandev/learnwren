import type { UserId } from './common';
import type { UserRole } from './user';

/** What an emailed action link does; the `mode` query parameter of /auth/action. */
export type EmailActionMode = 'verify-email' | 'reset-password' | 'change-email';

/** Body of `GET /api/auth/me` — the authenticated user the server hands back. */
export interface MeResponse {
  uid: UserId;
  email: string;
  displayName: string;
  photoUrl?: string;
  role: UserRole;
  emailVerified: boolean;
}
