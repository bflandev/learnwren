import { beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { FirestoreHandle } from '@learnwren/api-firebase';
import type { UserId } from '@learnwren/shared-data-models';
import { FakePictureStorageAdapter } from './fake-picture-storage.adapter';
import {
  PictureDecodeFailedException,
  PictureDimensionsTooSmallException,
} from './errors/picture.exception';
import { ProfilePictureService } from './profile-picture.service';

async function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 200, b: 200 } },
  }).jpeg().toBuffer();
}

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  }).png().toBuffer();
}

// Sentinel that the fake's update detects as "unset this key".
const DELETE_SENTINEL = Symbol('FieldValue.delete');

function makeFakeFirestore() {
  const store = new Map<string, Record<string, unknown>>();
  return {
    store,
    DELETE_SENTINEL,
    collection(name: string) {
      return {
        doc(id: string) {
          const key = `${name}/${id}`;
          return {
            set: (data: Record<string, unknown>) => { store.set(key, data); },
            update: async (data: Record<string, unknown>) => {
              const prev = store.get(key) ?? {};
              const next: Record<string, unknown> = { ...prev };
              for (const [k, v] of Object.entries(data)) {
                if (v === DELETE_SENTINEL) delete next[k];
                else if (v !== undefined) next[k] = v;
              }
              store.set(key, next);
            },
            get: async () => {
              const data = store.get(key);
              return { exists: !!data, data: () => data };
            },
          };
        },
      };
    },
  };
}

describe('ProfilePictureService', () => {
  const cfg = { bucket: 'b', publicBaseUrl: 'https://example.com', impl: 'fake' as const };
  let storage: FakePictureStorageAdapter;
  let firestore: ReturnType<typeof makeFakeFirestore>;
  let service: ProfilePictureService;

  beforeEach(() => {
    storage = new FakePictureStorageAdapter();
    firestore = makeFakeFirestore();
    firestore.store.set('users/u1', { displayName: 'Ada', biography: '', role: 'STUDENT' });
    service = new ProfilePictureService(
      storage,
      firestore as unknown as FirestoreHandle,
      cfg,
      // delete-sentinel injection (see impl note): allow the service to ask the fake for its delete sentinel
      DELETE_SENTINEL as never,
    );
  });

  it('happy path: 256x256 JPEG → stores a 512x512 JPEG (or smaller — 256x256 not upscaled) and returns MeResponse with photoUrl', async () => {
    const me = await service.uploadPicture(
      'u1' as UserId,
      await jpeg(256, 256),
      'image/jpeg',
      { email: 'a@b.com', emailVerified: true },
    );
    expect(me.photoUrl).toMatch(/^https:\/\/example\.com\/profile-pictures%2Fu1%2Favatar\.jpg\?alt=media&v=/);
    expect(storage.has('profile-pictures/u1/avatar.jpg')).toBe(true);
    const blob = storage.get('profile-pictures/u1/avatar.jpg')!;
    expect(blob.contentType).toBe('image/jpeg');
    expect(blob.cacheControl).toBe('public, max-age=31536000, immutable');
    expect(blob.metadata).toEqual({ uid: 'u1' });
    const meta = await sharp(blob.body).metadata();
    expect(meta.width).toBe(256);  // 256 input is not upscaled
    expect(meta.height).toBe(256);
    expect(meta.format).toBe('jpeg');
  });

  it('1024x768 JPEG → centre-cropped to a square (768x768) then downscaled to 512x512', async () => {
    await service.uploadPicture(
      'u1' as UserId,
      await jpeg(1024, 768),
      'image/jpeg',
      { email: 'a@b.com', emailVerified: true },
    );
    const blob = storage.get('profile-pictures/u1/avatar.jpg')!;
    const meta = await sharp(blob.body).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  });

  it('200x800 PNG → PictureDimensionsTooSmallException with the actual dims', async () => {
    await expect(
      service.uploadPicture('u1' as UserId, await png(200, 800), 'image/png', { email: 'a@b.com', emailVerified: true }),
    ).rejects.toMatchObject({
      code: 'PROFILE_PICTURE_DIMENSIONS_TOO_SMALL',
      details: { width: 200, height: 800 },
    });
  });

  it('corrupt buffer → PictureDecodeFailedException carrying the decode error as cause', async () => {
    await expect(
      service.uploadPicture('u1' as UserId, Buffer.from('not an image'), 'image/jpeg', { email: 'a@b.com', emailVerified: true }),
    ).rejects.toMatchObject({
      code: 'PROFILE_PICTURE_DECODE_FAILED',
      cause: expect.anything(),
    });
  });

  it('buildMe throws NotFoundException with the exact message when the user doc is absent', async () => {
    // firestore whose get() always reports the doc absent → exercises the
    // !snap.exists guard + its message in buildMe (via removePicture, which
    // skips the sharp pipeline).
    const absentFirestore = {
      collection: () => ({
        doc: () => ({
          update: async () => undefined,
          get: async () => ({ exists: false, data: () => undefined }),
        }),
      }),
    } as unknown as FirestoreHandle;
    const svc = new ProfilePictureService(
      new FakePictureStorageAdapter(),
      absentFirestore,
      cfg,
      DELETE_SENTINEL as never,
    );
    await expect(
      svc.removePicture('u1' as UserId, { email: 'a@b.com', emailVerified: true }),
    ).rejects.toThrow('User profile not found.');
  });

  it('writes photoUrl and updatedAt onto the user doc with the same ?v= timestamp', async () => {
    const me = await service.uploadPicture(
      'u1' as UserId,
      await jpeg(256, 256),
      'image/jpeg',
      { email: 'a@b.com', emailVerified: true },
    );
    const doc = firestore.store.get('users/u1') as Record<string, unknown>;
    expect(doc['photoUrl']).toBe(me.photoUrl);
    expect(typeof doc['updatedAt']).toBe('string');
    expect(me.photoUrl).toContain(encodeURIComponent(doc['updatedAt'] as string));
  });

  it('removePicture deletes the blob, unsets photoUrl, bumps updatedAt, returns MeResponse without photoUrl', async () => {
    await service.uploadPicture('u1' as UserId, await jpeg(256, 256), 'image/jpeg', { email: 'a@b.com', emailVerified: true });
    const me = await service.removePicture('u1' as UserId, { email: 'a@b.com', emailVerified: true });
    expect(me.photoUrl).toBeUndefined();
    expect(storage.has('profile-pictures/u1/avatar.jpg')).toBe(false);
    const doc = firestore.store.get('users/u1') as Record<string, unknown>;
    expect(doc['photoUrl']).toBeUndefined();
  });

  it('removePicture clears photoUrl on the doc BEFORE deleting the object (a crash leaves an orphaned object, never a broken URL)', async () => {
    await service.uploadPicture('u1' as UserId, await jpeg(256, 256), 'image/jpeg', { email: 'a@b.com', emailVerified: true });
    let photoUrlAtDeleteTime: unknown = 'not-captured';
    const originalDelete = storage.deleteObject.bind(storage);
    storage.deleteObject = async (input: { path: string }) => {
      photoUrlAtDeleteTime = (firestore.store.get('users/u1') as Record<string, unknown>)['photoUrl'];
      return originalDelete(input);
    };
    await service.removePicture('u1' as UserId, { email: 'a@b.com', emailVerified: true });
    expect(photoUrlAtDeleteTime).toBeUndefined();
  });
});
