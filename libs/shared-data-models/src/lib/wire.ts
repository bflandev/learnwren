import type { ISODateString, MaterialId, VideoId } from './common';
import type { Course } from './course';
import type { Lesson } from './lesson';
import type { Module } from './module';

/**
 * Full hierarchical view of a course (modules + lessons), as returned by
 * `GET /api/courses/:cid/tree`. Shared between api and web so the shape can
 * never drift across the wire.
 */
export interface CourseTree {
  course: Course;
  modules: Array<{ module: Module; lessons: Lesson[] }>;
}

/** Body of `POST /api/courses/:cid/modules/:mid/lessons/:lid/video/upload-session`. */
export interface CreateUploadSessionResponse {
  videoId: VideoId;
  uploadSessionUri: string;
  expiresAt: ISODateString;
}

/** Body of `POST /api/courses/:cid/modules/:mid/lessons/:lid/materials/upload-url`. */
export interface CreateMaterialUploadResponse {
  materialId: MaterialId;
  uploadUrl: string;
  expiresAt: ISODateString;
}

/** Body of `GET /api/materials/:matId/download-url`. */
export interface MaterialDownloadUrlResponse {
  downloadUrl: string;
  expiresAt: ISODateString;
}
