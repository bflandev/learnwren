import type { CourseId, ISODateString, ModuleId } from './common';

export interface Module {
  id: ModuleId;
  courseId: CourseId;
  title: string;
  order: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
