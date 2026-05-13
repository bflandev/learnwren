import type { ISODateString, LessonId, ModuleId, VideoId } from './common';

export interface Lesson {
  id: LessonId;
  moduleId: ModuleId;
  title: string;
  description?: string;
  videoId?: VideoId;
  order: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
