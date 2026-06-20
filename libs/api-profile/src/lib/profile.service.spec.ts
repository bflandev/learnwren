import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { UserId } from '@learnwren/shared-data-models';
import type { FirestoreHandle } from '@learnwren/api-firebase';

import { ProfileInvalidException } from './errors/profile.exception';
import { ProfileService } from './profile.service';

interface DocState {
  exists: boolean;
  data: Record<string, unknown>;
}

function makeFirestore(initial: DocState): {
  firestore: FirestoreHandle;
  written: Record<string, unknown> | null;
  state: DocState;
  collection: ReturnType<typeof vi.fn>;
  docFn: ReturnType<typeof vi.fn>;
} {
  const state = { ...initial };
  let written: Record<string, unknown> | null = null;
  const doc = {
    get: vi.fn(async () => ({
      exists: state.exists,
      data: () => state.data,
    })),
    update: vi.fn(async (patch: Record<string, unknown>) => {
      state.data = { ...state.data, ...patch };
      written = patch;
    }),
  };
  const docFn = vi.fn(() => doc);
  const collection = vi.fn(() => ({ doc: docFn }));
  const firestore = { collection } as unknown as FirestoreHandle;
  return {
    firestore,
    get written() {
      return written;
    },
    state,
    collection,
    docFn,
  } as never;
}

const UID = 'u-1' as UserId;
const FROM_COOKIE = { email: 'a@b.c', emailVerified: true };

describe('ProfileService', () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date('2026-05-27T10:00:00Z')));

  it('getProfile returns the persisted view (biography missing on doc reads as "")', async () => {
    const { firestore } = makeFirestore({
      exists: true,
      data: { displayName: 'A', role: 'STUDENT' /* no biography */ },
    });
    const svc = new ProfileService(firestore);
    const view = await svc.getProfile(UID, FROM_COOKIE);
    expect(view).toEqual({
      uid: UID,
      email: 'a@b.c',
      displayName: 'A',
      biography: '',
      role: 'STUDENT',
      emailVerified: true,
    });
  });

  it('updateProfile writes trimmed values + updatedAt and returns MeResponse', async () => {
    const harness = makeFirestore({
      exists: true,
      data: { displayName: 'Old', biography: '', role: 'STUDENT' },
    });
    const svc = new ProfileService(harness.firestore);
    const me = await svc.updateProfile(UID, { displayName: '  New  ', biography: '  hello  ' }, FROM_COOKIE);
    expect(me).toEqual({
      uid: UID,
      email: 'a@b.c',
      displayName: 'New',
      role: 'STUDENT',
      emailVerified: true,
    });
    expect(harness.written).toEqual({
      displayName: 'New',
      biography: 'hello',
      updatedAt: '2026-05-27T10:00:00.000Z',
    });
    // targets the exact 'users' collection + doc(uid) on both the write and the re-read
    expect(harness.collection).toHaveBeenCalledWith('users');
    expect(harness.collection).not.toHaveBeenCalledWith('');
    expect(harness.docFn).toHaveBeenCalledWith(UID);
  });

  it('getProfile reads from the exact "users" collection at doc(uid)', async () => {
    const harness = makeFirestore({
      exists: true,
      data: { displayName: 'A', role: 'STUDENT' },
    });
    const svc = new ProfileService(harness.firestore);
    await svc.getProfile(UID, FROM_COOKIE);
    expect(harness.collection).toHaveBeenCalledWith('users');
    expect(harness.collection).not.toHaveBeenCalledWith('');
    expect(harness.docFn).toHaveBeenCalledWith(UID);
  });

  it.each([
    ['', 'displayName', 'must be 1-80 characters'],
    [' '.repeat(0), 'displayName', 'must be 1-80 characters'], // empty after trim
    ['x'.repeat(81), 'displayName', 'must be 1-80 characters'],
  ])('rejects displayName=%j', async (displayName, field, reason) => {
    const { firestore } = makeFirestore({
      exists: true,
      data: { displayName: 'Old', biography: '', role: 'STUDENT' },
    });
    const svc = new ProfileService(firestore);
    await expect(
      svc.updateProfile(UID, { displayName, biography: '' }, FROM_COOKIE),
    ).rejects.toMatchObject({ details: { field, reason } });
  });

  it('rejects biography over 1000 chars', async () => {
    const { firestore } = makeFirestore({
      exists: true,
      data: { displayName: 'Old', biography: '', role: 'STUDENT' },
    });
    const svc = new ProfileService(firestore);
    await expect(
      svc.updateProfile(UID, { displayName: 'A', biography: 'x'.repeat(1001) }, FROM_COOKIE),
    ).rejects.toMatchObject({
      details: { field: 'biography', reason: 'must be at most 1000 characters' },
    });
  });

  it('accepts biography at exactly 1000 chars and displayName at exactly 80 chars', async () => {
    const { firestore } = makeFirestore({
      exists: true,
      data: { displayName: 'Old', biography: '', role: 'STUDENT' },
    });
    const svc = new ProfileService(firestore);
    await expect(
      svc.updateProfile(UID, { displayName: 'x'.repeat(80), biography: 'x'.repeat(1000) }, FROM_COOKIE),
    ).resolves.toBeDefined();
  });

  it('throws NotFoundException with the exact message when the user doc is missing', async () => {
    const { firestore } = makeFirestore({ exists: false, data: {} });
    const svc = new ProfileService(firestore);
    await expect(svc.getProfile(UID, FROM_COOKIE)).rejects.toThrow('User profile not found.');
  });

  it('getProfile returns photoUrl when the user doc carries one', async () => {
    const { firestore } = makeFirestore({
      exists: true,
      data: {
        displayName: 'Ada',
        biography: '',
        role: 'STUDENT',
        photoUrl: 'https://cdn.example.com/avatar.jpg',
      },
    });
    const svc = new ProfileService(firestore);
    const view = await svc.getProfile(UID, FROM_COOKIE);
    expect(view.photoUrl).toContain('avatar.jpg');
  });

  it('updateProfile returns MeResponse including photoUrl when stored', async () => {
    const { firestore } = makeFirestore({
      exists: true,
      data: {
        displayName: 'Old',
        biography: '',
        role: 'STUDENT',
        photoUrl: 'https://cdn.example.com/avatar.jpg',
      },
    });
    const svc = new ProfileService(firestore);
    const me = await svc.updateProfile(
      UID,
      { displayName: 'Ada Lovelace', biography: 'Mathematician.' },
      FROM_COOKIE,
    );
    expect(me.photoUrl).toContain('avatar.jpg');
  });
});
