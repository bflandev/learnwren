import { describe, expect, it } from 'vitest';

import {
  PictureDecodeFailedException,
  PictureDimensionsTooSmallException,
  PictureException,
  PictureTooLargeException,
  UnsupportedPictureFormatException,
} from './picture.exception';

describe('PictureException hierarchy', () => {
  it('carries code, message, status, and (optional) details on each subclass', () => {
    const a = new PictureDimensionsTooSmallException({ width: 200, height: 200 });
    expect(a.code).toBe('PROFILE_PICTURE_DIMENSIONS_TOO_SMALL');
    expect(a.status).toBe(400);
    expect(a.details).toEqual({ width: 200, height: 200 });

    const b = new PictureDecodeFailedException();
    expect(b.code).toBe('PROFILE_PICTURE_DECODE_FAILED');
    expect(b.status).toBe(400);

    const c = new PictureTooLargeException();
    expect(c.code).toBe('PROFILE_PICTURE_TOO_LARGE');
    expect(c.status).toBe(413);

    const d = new UnsupportedPictureFormatException();
    expect(d.code).toBe('UNSUPPORTED_PROFILE_PICTURE_FORMAT');
    expect(d.status).toBe(415);
  });

  it('all subclasses are instances of PictureException', () => {
    expect(new PictureDimensionsTooSmallException({ width: 1, height: 1 })).toBeInstanceOf(PictureException);
    expect(new PictureDecodeFailedException()).toBeInstanceOf(PictureException);
    expect(new PictureTooLargeException()).toBeInstanceOf(PictureException);
    expect(new UnsupportedPictureFormatException()).toBeInstanceOf(PictureException);
  });
});
