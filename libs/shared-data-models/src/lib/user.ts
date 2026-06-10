import type { ISODateString, UserId } from './common';

export type UserRole = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';

/**
 * Account lifecycle status. Absent from a stored document means ACTIVE (backward-
 * compatible with all users created before this field was introduced).
 */
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export interface User {
  id: UserId;
  email: string;
  displayName: string;
  biography: string;
  photoUrl?: string;
  role: UserRole;
  /** Absent on pre-existing documents; treat as ACTIVE when missing. */
  status?: UserStatus;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
