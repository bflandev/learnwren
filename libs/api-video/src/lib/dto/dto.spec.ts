import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateUploadSessionDto } from './create-upload-session.dto';
import { UpdateVideoFailedDto } from './update-video.dto';

function validate<T extends object>(cls: new () => T, payload: unknown) {
  const instance = plainToInstance(cls, payload);
  return validateSync(instance);
}

describe('CreateUploadSessionDto', () => {
  it('accepts a well-formed payload', () => {
    expect(
      validate(CreateUploadSessionDto, {
        sizeBytes: 1024,
        contentType: 'video/mp4',
        filename: 'demo.mp4',
      }),
    ).toHaveLength(0);
  });

  it('rejects sizeBytes over 10 GB', () => {
    const errs = validate(CreateUploadSessionDto, {
      sizeBytes: 10_000_000_001,
      contentType: 'video/mp4',
    });
    expect(errs).toHaveLength(1);
    expect(errs[0].property).toBe('sizeBytes');
  });

  it('rejects zero or negative sizeBytes', () => {
    expect(
      validate(CreateUploadSessionDto, { sizeBytes: 0, contentType: 'video/mp4' }),
    ).toHaveLength(1);
  });

  it('rejects an unsupported MIME type', () => {
    const errs = validate(CreateUploadSessionDto, {
      sizeBytes: 1024,
      contentType: 'video/x-msvideo',
    });
    expect(errs).toHaveLength(1);
    expect(errs[0].property).toBe('contentType');
  });

  it('rejects a missing contentType', () => {
    expect(validate(CreateUploadSessionDto, { sizeBytes: 1024 })).not.toHaveLength(0);
  });

  it('rejects a filename over 255 chars', () => {
    expect(
      validate(CreateUploadSessionDto, {
        sizeBytes: 1024,
        contentType: 'video/mp4',
        filename: 'x'.repeat(256),
      }),
    ).toHaveLength(1);
  });
});

describe('UpdateVideoFailedDto', () => {
  it('accepts state=FAILED with a reason', () => {
    expect(
      validate(UpdateVideoFailedDto, { state: 'FAILED', failureReason: 'network' }),
    ).toHaveLength(0);
  });

  it('rejects any other state', () => {
    expect(
      validate(UpdateVideoFailedDto, { state: 'UPLOADED', failureReason: 'x' }),
    ).not.toHaveLength(0);
  });

  it('rejects a missing failureReason', () => {
    expect(validate(UpdateVideoFailedDto, { state: 'FAILED' })).not.toHaveLength(0);
  });

  it('rejects a failureReason over 500 chars', () => {
    expect(
      validate(UpdateVideoFailedDto, {
        state: 'FAILED',
        failureReason: 'x'.repeat(501),
      }),
    ).not.toHaveLength(0);
  });
});
