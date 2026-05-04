export type WebUserRole = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';

export interface AuthenticatedUser {
  uid: string;
  email: string;
  displayName: string;
  role: WebUserRole;
  emailVerified: boolean;
}
