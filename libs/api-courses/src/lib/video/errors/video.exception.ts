import type { VideoErrorCode } from './video-error.codes';

export class VideoException extends Error {
  constructor(
    public readonly code: VideoErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'VideoException';
  }
}

export class VideoNotFoundException extends VideoException {
  constructor() {
    super('VIDEO_NOT_FOUND', 'Video not found.', 404);
  }
}

export class NotVideoOwnerException extends VideoException {
  constructor() {
    super('NOT_VIDEO_OWNER', 'You do not own this video.', 403);
  }
}

export class LessonAlreadyHasVideoException extends VideoException {
  constructor() {
    super(
      'LESSON_ALREADY_HAS_VIDEO',
      'This lesson already has a video. Replace flow is not yet supported.',
      409,
    );
  }
}

export class InvalidVideoStateException extends VideoException {
  constructor(currentState: string) {
    super(
      'INVALID_VIDEO_STATE',
      `Operation is not valid in state ${currentState}.`,
      409,
      { currentState },
    );
  }
}

export class UploadObjectMissingException extends VideoException {
  constructor() {
    super(
      'UPLOAD_OBJECT_MISSING',
      'No source object exists at the upload destination.',
      422,
    );
  }
}

export class UploadObjectSizeMismatchException extends VideoException {
  constructor() {
    super(
      'UPLOAD_OBJECT_SIZE_MISMATCH',
      'Uploaded object size exceeds declared size by more than the allowed tolerance.',
      422,
    );
  }
}

export class PubSubInvalidTokenException extends VideoException {
  constructor(detail?: string) {
    super(
      'PUBSUB_INVALID_TOKEN',
      detail ? `Pub/Sub OIDC token invalid: ${detail}.` : 'Pub/Sub OIDC token invalid.',
      401,
    );
  }
}

export class PubSubWrongAudienceException extends VideoException {
  constructor() {
    super(
      'PUBSUB_WRONG_AUDIENCE',
      'Pub/Sub OIDC token audience does not match the configured webhook URL.',
      403,
    );
  }
}

export class PubSubWrongInvokerException extends VideoException {
  constructor() {
    super(
      'PUBSUB_WRONG_INVOKER',
      'Pub/Sub OIDC token email does not match the configured invoker service account.',
      403,
    );
  }
}

export class RenditionNotFoundException extends VideoException {
  constructor(rendition: string) {
    super(
      'RENDITION_NOT_FOUND',
      `Rendition "${rendition}" is not available.`,
      404,
      { rendition },
    );
  }
}

export class VideoNotReadyException extends VideoException {
  constructor(currentState: string) {
    super(
      'VIDEO_NOT_READY',
      `Video is not ready for playback (current state: ${currentState}).`,
      409,
      { currentState },
    );
  }
}

export class KeyLookupFailedException extends VideoException {
  constructor(detail?: string) {
    super(
      'KEY_LOOKUP_FAILED',
      detail ? `Encryption key lookup failed: ${detail}.` : 'Encryption key lookup failed.',
      500,
    );
  }
}

export class ManifestParseFailedException extends VideoException {
  constructor(detail: string) {
    super(
      'MANIFEST_PARSE_FAILED',
      `Manifest parse failed: ${detail}.`,
      502,
    );
  }
}

export class InvalidCaptionFileException extends VideoException {
  constructor() {
    super('INVALID_CAPTION_FILE', 'Captions must be a valid WebVTT (.vtt) file.', 400);
  }
}

export class CaptionTooLargeException extends VideoException {
  constructor() {
    super('CAPTION_TOO_LARGE', 'Caption file exceeds the 256 KB limit.', 400);
  }
}

export class CaptionsNotFoundException extends VideoException {
  constructor() {
    super('CAPTIONS_NOT_FOUND', 'No captions exist for this video.', 404);
  }
}

export class UploadCompletionInProgressException extends VideoException {
  constructor() {
    super(
      'UPLOAD_COMPLETION_IN_PROGRESS',
      'Upload completion is already being processed.',
      409,
    );
  }
}
