import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateUploadSessionDto } from './create-upload-session.dto';
import { UpdateVideoFailedDto } from './update-video.dto';

async function errorsFor<T extends object>(
  cls: new () => T,
  payload: unknown,
) {
  const instance = plainToInstance(cls, payload);
  return await validate(instance);
}

describe('CreateUploadSessionDto', () => {
  it('accepts a well-formed payload', async () => {
    const errs = await errorsFor(CreateUploadSessionDto, {
      sizeBytes: 1024,
      contentType: 'video/mp4',
      filename: 'demo.mp4',
    });
    expect(errs).toHaveLength(0);
  });

  it('rejects sizeBytes over 10 GB', async () => {
    const errs = await errorsFor(CreateUploadSessionDto, {
      sizeBytes: 10_000_000_001,
      contentType: 'video/mp4',
    });
    expect(errs).toHaveLength(1);
    expect(errs[0].property).toBe('sizeBytes');
  });

  it('rejects zero or negative sizeBytes', async () => {
    const errs = await errorsFor(CreateUploadSessionDto, {
      sizeBytes: 0,
      contentType: 'video/mp4',
    });
    expect(errs).toHaveLength(1);
    expect(errs[0].property).toBe('sizeBytes');
  });

  it('rejects an unsupported MIME type', async () => {
    const errs = await errorsFor(CreateUploadSessionDto, {
      sizeBytes: 1024,
      contentType: 'video/x-msvideo',
    });
    expect(errs).toHaveLength(1);
    expect(errs[0].property).toBe('contentType');
  });

  it('rejects a missing contentType', async () => {
    const errs = await errorsFor(CreateUploadSessionDto, { sizeBytes: 1024 });
    expect(errs).toHaveLength(1);
    expect(errs[0].property).toBe('contentType');
  });

  it('rejects a filename over 255 chars', async () => {
    const errs = await errorsFor(CreateUploadSessionDto, {
      sizeBytes: 1024,
      contentType: 'video/mp4',
      filename: 'x'.repeat(256),
    });
    expect(errs).toHaveLength(1);
    expect(errs[0].property).toBe('filename');
  });
});

describe('UpdateVideoFailedDto', () => {
  it('accepts state=FAILED with a reason', async () => {
    const errs = await errorsFor(UpdateVideoFailedDto, {
      state: 'FAILED',
      failureReason: 'network',
    });
    expect(errs).toHaveLength(0);
  });

  it('rejects any other state', async () => {
    const errs = await errorsFor(UpdateVideoFailedDto, {
      state: 'UPLOADED',
      failureReason: 'x',
    });
    expect(errs).toHaveLength(1);
    expect(errs[0].property).toBe('state');
  });

  it('rejects a missing failureReason', async () => {
    const errs = await errorsFor(UpdateVideoFailedDto, { state: 'FAILED' });
    expect(errs).toHaveLength(1);
    expect(errs[0].property).toBe('failureReason');
  });

  it('rejects a failureReason over 500 chars', async () => {
    const errs = await errorsFor(UpdateVideoFailedDto, {
      state: 'FAILED',
      failureReason: 'x'.repeat(501),
    });
    expect(errs).toHaveLength(1);
    expect(errs[0].property).toBe('failureReason');
  });
});
