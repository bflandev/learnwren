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
  /**
   * Duration in seconds read from the source via ffprobe at upload-complete
   * time. Used as the authoritative `Video.output.durationSec` because the GCP
   * Transcoder Job resource exposes no reliable output-duration field. Optional:
   * absent on documents created before this field existed.
   */
  probedDurationSec?: number;
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
  /**
   * Transient server-side claim stamp written by claimUploadCompletion at the
   * start of completeUpload. Cleared when the upload-completion pipeline
   * succeeds (finalizeUploadWithJob), when the pipeline fails terminally
   * (markFailedFromSubmission), or immediately on non-terminal verify-object
   * failures (releaseUploadCompletionClaim) so the instructor can retry.
   * Never visible to clients; optional so existing documents without the field
   * remain valid.
   */
  completeClaimedAt?: ISODateString;
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
 * One caption/subtitle track for a video, one per (videoId, language). Stored in
 * the `videoCaptions` collection with document id `${videoId}_${language}`;
 * tracks written before multi-language support keep their legacy id === videoId
 * (always language 'en'), so readers find tracks by the `videoId` field, never by
 * id. `content` is raw WebVTT text (≤ 256 KB; well under Firestore's 1 MB limit).
 */
export interface VideoCaptions {
  videoId: VideoId;
  language: string; // canonical BCP-47, e.g. 'en', 'pt-BR'
  label: string; // English display name derived from `language`, e.g. 'Brazilian Portuguese'
  format: 'vtt';
  content: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Upper bound on caption tracks per video; keeps the lesson payload small. */
export const MAX_CAPTION_TRACKS = 20;

/**
 * Canonicalise a BCP-47 tag and derive its English display label, or null when
 * the tag is malformed or names no known language. Shared by the API (validation)
 * and the web (language picker) so both agree on codes and labels.
 */
export function resolveCaptionLanguage(raw: string): { language: string; label: string } | null {
  let language: string | undefined;
  try {
    [language] = Intl.getCanonicalLocales(raw);
  } catch {
    // Malformed tag: `language` stays undefined and we return null below.
  }
  const label = language
    ? // Stryker disable next-line ArrayDeclaration: equivalent under the en-US test runtime — [] falls back to the default locale, which is English there
      new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }).of(language)
    : undefined;
  return language && label ? { language, label } : null;
}

export type VideoCaptionsMeta = Pick<VideoCaptions, 'language' | 'label' | 'updatedAt'>;

/**
 * Response shape of GET /api/playback/config. `fakePlayback` is true when the
 * server runs the in-memory fake playback-storage seam (local/dev), where there
 * are no real decryptable HLS segments — the web player shows a dev placeholder
 * instead of mounting hls.js (which would flood the console with failed segment
 * fetches). Always false in production.
 */
export interface PlaybackConfig {
  fakePlayback: boolean;
}
