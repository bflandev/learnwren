import type { CourseId, ISODateString, LessonId, MaterialId, UserId } from './common';

export type MaterialState = 'PENDING_UPLOAD' | 'READY';

export const SUPPORTED_MATERIAL_EXTENSIONS = [
  'pdf',
  'docx',
  'pptx',
  'xlsx',
  'txt',
  'zip',
] as const;

export type SupportedMaterialExtension = (typeof SUPPORTED_MATERIAL_EXTENSIONS)[number];

/**
 * Canonical MIME type per extension. Stored as the object's content-type, used
 * to bind the signed upload URL, and applied to the download response. Browsers
 * report unreliable MIME for the Office formats, so the server derives the
 * content-type from the (reliable) file extension instead.
 */
export const MATERIAL_CONTENT_TYPE_BY_EXTENSION: Record<SupportedMaterialExtension, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  zip: 'application/zip',
};

/** Hard per-file size limit — 50 MiB. */
export const MATERIAL_MAX_SIZE_BYTES = 50 * 1024 * 1024;

export interface MaterialStorageRef {
  bucket: string;
  path: string;
}

export interface Material {
  id: MaterialId;
  ownerInstructorId: UserId; // denormalised — guard-time auth
  courseId: CourseId;        // denormalised — cascade-delete + future enrolment check
  lessonId: LessonId;
  displayName: string;       // instructor-customisable; defaults to originalFilename
  originalFilename: string;  // used for the download Content-Disposition
  extension: SupportedMaterialExtension;
  contentType: string;       // canonical MIME from MATERIAL_CONTENT_TYPE_BY_EXTENSION
  sizeBytes: number;         // actual size, set at upload-complete
  state: MaterialState;
  storage: MaterialStorageRef;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
