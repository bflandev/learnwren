import type { CourseId, ISODateString, UserId } from './common';

export type CourseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface Course {
  id: CourseId;
  title: string;
  description: string;
  instructorId: UserId;
  status: CourseStatus;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
