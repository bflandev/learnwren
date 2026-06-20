import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FirestoreHandle } from '@learnwren/api-firebase';
import type { UserId } from '@learnwren/shared-data-models';

import { FakePictureStorageAdapter } from './fake-picture-storage.adapter';
import { PictureDecodeFailedException } from './errors/picture.exception';
import { ProfilePictureService } from './profile-picture.service';

// Mock the sharp module so we can (a) drive the zero-dimension guard and
// (b) assert the EXACT option objects passed to sharp()/resize()/jpeg().
// Each test resets the behaviour via the controllable holder below.
const holder: {
  metadata: () => Promise<{ width?: number; height?: number }>;
  calls: { ctorOpts: unknown[]; resizeArgs: unknown[][]; jpegOpts: unknown[] };
} = {
  metadata: async () => ({ width: 300, height: 300 }),
  calls: { ctorOpts: [], resizeArgs: [], jpegOpts: [] },
};

vi.mock('sharp', () => {
  const factory = (_input: unknown, opts?: unknown) => {
    holder.calls.ctorOpts.push(opts);
    const chain: Record<string, unknown> = {};
    chain['metadata'] = () => holder.metadata();
    chain['resize'] = (...args: unknown[]) => {
      holder.calls.resizeArgs.push(args);
      return chain;
    };
    chain['png'] = () => chain;
    chain['jpeg'] = (opts2: unknown) => {
      holder.calls.jpegOpts.push(opts2);
      return chain;
    };
    chain['toBuffer'] = async () => Buffer.from('encoded');
    return chain;
  };
  return { default: factory };
});

const DELETE_SENTINEL = Symbol('FieldValue.delete');

function makeFakeFirestore() {
  const store = new Map<string, Record<string, unknown>>();
  store.set('users/u1', { displayName: 'Ada', biography: '', role: 'STUDENT' });
  return {
    store,
    collection() {
      return {
        doc(id: string) {
          const key = `users/${id}`;
          return {
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

describe('ProfilePictureService (sharp mocked)', () => {
  const cfg = { bucket: 'b', publicBaseUrl: 'https://example.com', impl: 'fake' as const };
  let service: ProfilePictureService;

  beforeEach(() => {
    holder.metadata = async () => ({ width: 300, height: 300 });
    holder.calls = { ctorOpts: [], resizeArgs: [], jpegOpts: [] };
    service = new ProfilePictureService(
      new FakePictureStorageAdapter(),
      makeFakeFirestore() as unknown as FirestoreHandle,
      cfg,
      DELETE_SENTINEL as never,
    );
  });

  it('throws PictureDecodeFailed when metadata reports a zero height (width OK)', async () => {
    holder.metadata = async () => ({ width: 300, height: 0 });
    await expect(
      service.uploadPicture('u1' as UserId, Buffer.from('x'), 'image/jpeg', {
        email: 'a@b.com',
        emailVerified: true,
      }),
    ).rejects.toBeInstanceOf(PictureDecodeFailedException);
  });

  it('throws PictureDecodeFailed when metadata reports a zero width (height OK)', async () => {
    holder.metadata = async () => ({ width: 0, height: 300 });
    await expect(
      service.uploadPicture('u1' as UserId, Buffer.from('x'), 'image/jpeg', {
        email: 'a@b.com',
        emailVerified: true,
      }),
    ).rejects.toBeInstanceOf(PictureDecodeFailedException);
  });

  it('throws PictureDecodeFailed when BOTH dims are missing (undefined → 0)', async () => {
    holder.metadata = async () => ({});
    await expect(
      service.uploadPicture('u1' as UserId, Buffer.from('x'), 'image/jpeg', {
        email: 'a@b.com',
        emailVerified: true,
      }),
    ).rejects.toBeInstanceOf(PictureDecodeFailedException);
  });

  it('passes the exact sharp/resize/jpeg option objects through the pipeline', async () => {
    holder.metadata = async () => ({ width: 1024, height: 768 });
    await service.uploadPicture('u1' as UserId, Buffer.from('x'), 'image/jpeg', {
      email: 'a@b.com',
      emailVerified: true,
    });
    // every sharp() call decodes with failOn: 'truncated' (not the default).
    expect(holder.calls.ctorOpts.length).toBeGreaterThanOrEqual(3);
    for (const o of holder.calls.ctorOpts) {
      expect(o).toEqual({ failOn: 'truncated' });
    }
    // stage 1: centre-crop to the shorter side (768) as a cover square.
    expect(holder.calls.resizeArgs[0]).toEqual([
      768,
      768,
      { fit: 'cover', position: 'centre' },
    ]);
    // stage 2: downscale to 512 with no upscaling.
    expect(holder.calls.resizeArgs[1]).toEqual([
      512,
      512,
      { fit: 'inside', withoutEnlargement: true },
    ]);
    // jpeg encoder options pinned exactly.
    expect(holder.calls.jpegOpts).toEqual([{ quality: 85, mozjpeg: true }]);
  });
});
