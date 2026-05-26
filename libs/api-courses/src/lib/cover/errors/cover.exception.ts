import type { CoverErrorCode } from './cover-error.codes';

export class CoverException extends Error {
  constructor(
    public readonly code: CoverErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CoverException';
  }
}

export class CoverDimensionsTooSmallException extends CoverException {
  constructor(dims: { width: number; height: number }) {
    super(
      'COVER_DIMENSIONS_TOO_SMALL',
      'Cover image must be JPEG or PNG, at least 1280x720 pixels.',
      400,
      { width: dims.width, height: dims.height },
    );
  }
}

export class CoverDecodeFailedException extends CoverException {
  constructor() {
    super('COVER_DECODE_FAILED', 'Cover image could not be decoded.', 400);
  }
}

export class CoverTooLargeException extends CoverException {
  constructor() {
    super('COVER_TOO_LARGE', 'Cover image exceeds the 10 MB limit.', 413);
  }
}

export class UnsupportedCoverFormatException extends CoverException {
  constructor() {
    super(
      'UNSUPPORTED_COVER_FORMAT',
      'Cover image must be JPEG or PNG.',
      415,
    );
  }
}
