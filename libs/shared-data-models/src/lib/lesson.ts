import type { ISODateString, LessonId, ModuleId } from './common';

export interface Lesson {
  id: LessonId;
  moduleId: ModuleId;
  title: string;
  videoUrl: string;
  order: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
