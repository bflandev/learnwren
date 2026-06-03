import type { CourseId, ISODateString, ModuleId } from './common';

export interface Module {
  id: ModuleId;
  courseId: CourseId;
  title: string;
  order: number;
  studentsNotifiedAt?: ISODateString; // slice C — set once when active enrollees are emailed about this module
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
