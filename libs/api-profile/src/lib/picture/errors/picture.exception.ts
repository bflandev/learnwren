import type { PictureErrorCode } from './picture-error.codes';

export class PictureException extends Error {
  constructor(
    public readonly code: PictureErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PictureException';
  }
}

export class PictureDimensionsTooSmallException extends PictureException {
  constructor(dims: { width: number; height: number }) {
    super(
      'PROFILE_PICTURE_DIMENSIONS_TOO_SMALL',
      'Profile picture must be JPEG or PNG, at least 256x256 pixels.',
      400,
      { width: dims.width, height: dims.height },
    );
  }
}

export class PictureDecodeFailedException extends PictureException {
  constructor() {
    super('PROFILE_PICTURE_DECODE_FAILED', 'Profile picture could not be decoded.', 400);
  }
}

export class PictureTooLargeException extends PictureException {
  constructor() {
    super('PROFILE_PICTURE_TOO_LARGE', 'Profile picture exceeds the 2 MB limit.', 413);
  }
}

export class UnsupportedPictureFormatException extends PictureException {
  constructor() {
    super(
      'UNSUPPORTED_PROFILE_PICTURE_FORMAT',
      'Profile picture must be JPEG or PNG.',
      415,
    );
  }
}
