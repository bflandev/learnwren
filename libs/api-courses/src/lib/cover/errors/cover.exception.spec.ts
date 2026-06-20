import { describe, expect, it } from 'vitest';

import {
  CoverDecodeFailedException,
  CoverDimensionsTooSmallException,
  CoverException,
  CoverTooLargeException,
  UnsupportedCoverFormatException,
} from './cover.exception';

describe('CoverException hierarchy', () => {
  it('CoverDimensionsTooSmallException carries 400, code, and {width,height} details', () => {
    const e = new CoverDimensionsTooSmallException({ width: 640, height: 480 });
    expect(e).toBeInstanceOf(CoverException);
    expect(e.name).toBe('CoverException');
    expect(e.code).toBe('COVER_DIMENSIONS_TOO_SMALL');
    expect(e.status).toBe(400);
    expect(e.message).toBe(
      'Cover image must be JPEG or PNG, at least 1280x720 pixels.',
    );
    expect(e.details).toEqual({ width: 640, height: 480 });
  });

  it('CoverDecodeFailedException is a 400 with COVER_DECODE_FAILED', () => {
    const e = new CoverDecodeFailedException();
    expect(e.code).toBe('COVER_DECODE_FAILED');
    expect(e.status).toBe(400);
    expect(e.message).toBe('Cover image could not be decoded.');
  });

  it('CoverTooLargeException is a 413 with COVER_TOO_LARGE', () => {
    const e = new CoverTooLargeException();
    expect(e.code).toBe('COVER_TOO_LARGE');
    expect(e.status).toBe(413);
    expect(e.message).toBe('Cover image exceeds the 10 MB limit.');
  });

  it('UnsupportedCoverFormatException is a 415 with UNSUPPORTED_COVER_FORMAT', () => {
    const e = new UnsupportedCoverFormatException();
    expect(e.code).toBe('UNSUPPORTED_COVER_FORMAT');
    expect(e.status).toBe(415);
    expect(e.message).toBe('Cover image must be JPEG or PNG.');
  });
});
