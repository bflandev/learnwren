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

/** Lesson title length (api DTO and web inputs share it). */
export const LESSON_TITLE_MAX_LENGTH = 100;
