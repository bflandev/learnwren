import type { PictureErrorCode } from './picture-error.codes';

export class PictureException extends Error {
  constructor(
    public readonly code: PictureErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PictureException';
  }
}

export class PictureDimensionsTooSmallException extends PictureException {
  constructor(dims: { width: number; height: number }, options?: ErrorOptions) {
    super(
      'PROFILE_PICTURE_DIMENSIONS_TOO_SMALL',
      'Profile picture must be JPEG or PNG, at least 256x256 pixels.',
      400,
      { width: dims.width, height: dims.height },
      options,
    );
  }
}

export class PictureDecodeFailedException extends PictureException {
  constructor(options?: ErrorOptions) {
    super(
      'PROFILE_PICTURE_DECODE_FAILED',
      'Profile picture could not be decoded.',
      400,
      undefined,
      options,
    );
  }
}

export class PictureTooLargeException extends PictureException {
  constructor(options?: ErrorOptions) {
    super(
      'PROFILE_PICTURE_TOO_LARGE',
      'Profile picture exceeds the 2 MB limit.',
      413,
      undefined,
      options,
    );
  }
}

export class UnsupportedPictureFormatException extends PictureException {
  constructor(options?: ErrorOptions) {
    super(
      'UNSUPPORTED_PROFILE_PICTURE_FORMAT',
      'Profile picture must be JPEG or PNG.',
      415,
      undefined,
      options,
    );
  }
}
