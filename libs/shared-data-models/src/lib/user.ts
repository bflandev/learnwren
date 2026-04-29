import type { ISODateString, UserId } from './common';

export type UserRole = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';

export interface User {
  id: UserId;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
