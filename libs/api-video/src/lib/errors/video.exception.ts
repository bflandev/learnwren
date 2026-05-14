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
