import { describe, expect, it, vi } from 'vitest';

import type { Video, VideoId } from '@learnwren/shared-data-models';

import { InvalidCaptionFileException } from '../errors/video.exception';
import { CaptionsController } from './captions.controller';

const VIDEO = { id: 'v1' as VideoId } as Video;

function makeSvc() {
  return {
    put: vi.fn().mockResolvedValue({ language: 'en', label: 'English', updatedAt: 'now' }),
    getMeta: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

describe('CaptionsController', () => {
  it('upload passes the file buffer to the service', async () => {
    const svc = makeSvc();
    const ctrl = new CaptionsController(svc as never);
    const file = { buffer: Buffer.from('WEBVTT\n') } as Express.Multer.File;
    const meta = await ctrl.upload(file, VIDEO);
    expect(svc.put).toHaveBeenCalledWith('v1', file.buffer);
    expect(meta.label).toBe('English');
  });

  it('upload with no file throws InvalidCaptionFileException', async () => {
    const ctrl = new CaptionsController(makeSvc() as never);
    await expect(
      ctrl.upload(undefined as unknown as Express.Multer.File, VIDEO),
    ).rejects.toBeInstanceOf(InvalidCaptionFileException);
  });

  it('meta returns the service metadata', async () => {
    const svc = makeSvc();
    await new CaptionsController(svc as never).meta(VIDEO);
    expect(svc.getMeta).toHaveBeenCalledWith('v1');
  });

  it('remove delegates to the service', async () => {
    const svc = makeSvc();
    await new CaptionsController(svc as never).remove(VIDEO);
    expect(svc.remove).toHaveBeenCalledWith('v1');
  });
});
