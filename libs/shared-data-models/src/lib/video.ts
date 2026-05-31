import type {
  CourseId,
  ISODateString,
  LessonId,
  UserId,
  VideoId,
  VideoKeyId,
} from './common';

export const SUPPORTED_VIDEO_CONTENT_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
] as const;

export type SupportedVideoContentType = (typeof SUPPORTED_VIDEO_CONTENT_TYPES)[number];

export type VideoState =
  | 'PENDING_UPLOAD'
  | 'UPLOADING'    // defined for future slices; not written by slice A
  | 'UPLOADED'
  | 'TRANSCODING'  // slice B
  | 'READY'        // slice B
  | 'FAILED';

export interface VideoSource {
  bucket: string;
  path: string;
  sizeBytes?: number;
}

export interface VideoOutput {
  bucket: string;
  manifestPath: string;
  durationSec: number;
}

export interface Video {
  id: VideoId;
  ownerInstructorId: UserId;
  courseId: CourseId;
  lessonId: LessonId;
  state: VideoState;
  source: VideoSource;
  output?: VideoOutput;
  transcoderJobName?: string;
  keyId?: VideoKeyId;
  failureReason?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface VideoKey {
  id: VideoKeyId;
  videoId: VideoId;
  key: string; // base64 of 16 bytes (AES-128); not written by slice A
  createdAt: ISODateString;
}

/**
 * One caption/subtitle track for a video. Stored in the `videoCaptions`
 * collection with document id === videoId (strict 1:1). `content` is raw
 * WebVTT text (≤ 256 KB; well under Firestore's 1 MB document limit).
 */
export interface VideoCaptions {
  videoId: VideoId;
  language: string; // BCP-47; fixed 'en' in the first slice
  label: string; // display label, e.g. 'English'
  format: 'vtt';
  content: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Metadata projection of VideoCaptions (no VTT body). */
export type VideoCaptionsMeta = Pick<VideoCaptions, 'language' | 'label' | 'updatedAt'>;
