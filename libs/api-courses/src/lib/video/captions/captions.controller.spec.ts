import { describe, expect, it, vi } from 'vitest';

import type { Video, VideoId } from '@learnwren/shared-data-models';

import { InvalidCaptionFileException } from '../errors/video.exception';
import { CaptionsController } from './captions.controller';

const VIDEO = { id: 'v1' as VideoId } as Video;

function makeSvc() {
  return {
    put: vi.fn().mockResolvedValue({ language: 'fr', label: 'French', updatedAt: 'now' }),
    listMeta: vi.fn().mockResolvedValue([]),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

describe('CaptionsController', () => {
  it('upload passes the language and file buffer to the service', async () => {
    const svc = makeSvc();
    const ctrl = new CaptionsController(svc as never);
    const file = { buffer: Buffer.from('WEBVTT\n') } as Express.Multer.File;
    const meta = await ctrl.upload(file, 'fr', VIDEO);
    expect(svc.put).toHaveBeenCalledWith('v1', 'fr', file.buffer);
    expect(meta.label).toBe('French');
  });

  it('upload with no file throws InvalidCaptionFileException', async () => {
    const ctrl = new CaptionsController(makeSvc() as never);
    await expect(
      ctrl.upload(undefined as unknown as Express.Multer.File, 'fr', VIDEO),
    ).rejects.toBeInstanceOf(InvalidCaptionFileException);
  });

  it('list returns the service track list', async () => {
    const svc = makeSvc();
    expect(await new CaptionsController(svc as never).list(VIDEO)).toEqual([]);
    expect(svc.listMeta).toHaveBeenCalledWith('v1');
  });

  it('remove delegates the language to the service', async () => {
    const svc = makeSvc();
    await new CaptionsController(svc as never).remove('fr', VIDEO);
    expect(svc.remove).toHaveBeenCalledWith('v1', 'fr');
  });
});
