import { describe, expect, it, vi } from 'vitest';
import { ArgumentsHost, HttpException } from '@nestjs/common';
import {
  PictureDecodeFailedException,
  PictureDimensionsTooSmallException,
  PictureTooLargeException,
  UnsupportedPictureFormatException,
} from './errors/picture.exception';
import { PictureExceptionFilter } from './picture.exception-filter';

function makeHost(): {
  host: ArgumentsHost;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('PictureExceptionFilter', () => {
  it('maps PictureDimensionsTooSmallException → 400 with code + details', () => {
    const { host, status, json } = makeHost();
    new PictureExceptionFilter().catch(
      new PictureDimensionsTooSmallException({ width: 200, height: 800 }),
      host,
    );
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'PROFILE_PICTURE_DIMENSIONS_TOO_SMALL',
        message: expect.any(String),
        details: { width: 200, height: 800 },
      },
    });
  });

  it('maps PictureDecodeFailedException → 400', () => {
    const { host, status, json } = makeHost();
    new PictureExceptionFilter().catch(new PictureDecodeFailedException(), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json.mock.calls[0][0].error.code).toBe('PROFILE_PICTURE_DECODE_FAILED');
  });

  it('maps PictureTooLargeException → 413', () => {
    const { host, status, json } = makeHost();
    new PictureExceptionFilter().catch(new PictureTooLargeException(), host);
    expect(status).toHaveBeenCalledWith(413);
    expect(json.mock.calls[0][0].error.code).toBe('PROFILE_PICTURE_TOO_LARGE');
  });

  it('maps UnsupportedPictureFormatException → 415', () => {
    const { host, status, json } = makeHost();
    new PictureExceptionFilter().catch(new UnsupportedPictureFormatException(), host);
    expect(status).toHaveBeenCalledWith(415);
    expect(json.mock.calls[0][0].error.code).toBe('UNSUPPORTED_PROFILE_PICTURE_FORMAT');
  });

  it('falls back to 500 INTERNAL for unknown exceptions', () => {
    const { host, status, json } = makeHost();
    new PictureExceptionFilter().catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json.mock.calls[0][0].error.code).toBe('INTERNAL');
  });

  it('maps a generic HttpException (e.g. 401 from guards) through the status table', () => {
    const { host, status, json } = makeHost();
    new PictureExceptionFilter().catch(new HttpException('nope', 401), host);
    expect(status).toHaveBeenCalledWith(401);
    expect(json.mock.calls[0][0].error.code).toBe('UNAUTHORIZED');
  });
});
