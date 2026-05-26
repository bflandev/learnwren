import type { CourseId, ISODateString, UserId } from './common';

export const COURSE_CATEGORIES = [
  'PROGRAMMING',
  'DESIGN',
  'BUSINESS',
  'MARKETING',
  'PERSONAL_DEVELOPMENT',
  'OTHER',
] as const;
export type CourseCategory = (typeof COURSE_CATEGORIES)[number];

export const COURSE_DIFFICULTIES = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export type CourseDifficulty = (typeof COURSE_DIFFICULTIES)[number];

export type CourseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface Course {
  id: CourseId;
  title: string;
  description: string;
  longDescription?: string;
  category?: CourseCategory;
  difficulty?: CourseDifficulty;
  instructorId: UserId;
  status: CourseStatus;
  publishedAt?: ISODateString;        // slice D — last DRAFT→PUBLISHED transition timestamp; preserved across unpublish + archive
  archivedAt?: ISODateString;         // slice D — set on archive; cleared on restore
  coverImageUrl?: string;             // public URL to canonical JPEG with ?v={updatedAt} cache-buster; absent ⇒ no cover
  enrollmentCount?: number;           // slice B — count of ACTIVE enrollments; absent on pre-Slice-B docs
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
