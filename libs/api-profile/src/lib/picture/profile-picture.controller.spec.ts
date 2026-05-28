import { describe, expect, it, vi } from 'vitest';
import { ProfilePictureController } from './profile-picture.controller';
import {
  PictureTooLargeException,
  UnsupportedPictureFormatException,
} from './errors/picture.exception';
import type { MeResponse } from '@learnwren/shared-data-models';

function meStub(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    uid: 'u1' as MeResponse['uid'],
    email: 'a@b.com',
    displayName: 'Ada',
    role: 'STUDENT',
    emailVerified: true,
    photoUrl: 'https://example.com/profile-pictures/u1/avatar.jpg?v=…',
    ...overrides,
  };
}

describe('ProfilePictureController', () => {
  const req = {
    user: { uid: 'u1' as MeResponse['uid'], email: 'a@b.com', emailVerified: true },
  } as never;

  it('PUT returns the MeResponse from the service', async () => {
    const svc = { uploadPicture: vi.fn().mockResolvedValue(meStub()) } as never;
    const c = new ProfilePictureController(svc);
    const file = { buffer: Buffer.from('x'), mimetype: 'image/jpeg', size: 1024 } as Express.Multer.File;
    const me = await c.upload(file, req);
    expect(me.photoUrl).toContain('avatar.jpg');
    expect(svc.uploadPicture).toHaveBeenCalledWith('u1', file.buffer, 'image/jpeg', {
      email: 'a@b.com',
      emailVerified: true,
    });
  });

  it('PUT with no file → UnsupportedPictureFormatException', async () => {
    const svc = {} as never;
    const c = new ProfilePictureController(svc);
    await expect(c.upload(undefined as never, req)).rejects.toBeInstanceOf(UnsupportedPictureFormatException);
  });

  it('PUT with non-JPEG/PNG mime → UnsupportedPictureFormatException', async () => {
    const svc = {} as never;
    const c = new ProfilePictureController(svc);
    const file = { buffer: Buffer.from('x'), mimetype: 'image/gif', size: 1 } as Express.Multer.File;
    await expect(c.upload(file, req)).rejects.toBeInstanceOf(UnsupportedPictureFormatException);
  });

  it('PUT with body > 2 MB → PictureTooLargeException', async () => {
    const svc = {} as never;
    const c = new ProfilePictureController(svc);
    const file = { buffer: Buffer.from('x'), mimetype: 'image/jpeg', size: 3_000_000 } as Express.Multer.File;
    await expect(c.upload(file, req)).rejects.toBeInstanceOf(PictureTooLargeException);
  });

  it('DELETE returns MeResponse (without photoUrl)', async () => {
    const svc = { removePicture: vi.fn().mockResolvedValue(meStub({ photoUrl: undefined })) } as never;
    const c = new ProfilePictureController(svc);
    const me = await c.remove(req);
    expect(me.photoUrl).toBeUndefined();
    expect(svc.removePicture).toHaveBeenCalledWith('u1', { email: 'a@b.com', emailVerified: true });
  });
});
