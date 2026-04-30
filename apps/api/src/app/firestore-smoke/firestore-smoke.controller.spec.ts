import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { FIRESTORE } from '@learnwren/api-firebase';
import { FirestoreSmokeController } from './firestore-smoke.controller';

interface SmokeDoc {
  writtenAt: string;
}

function buildFakeFirestore() {
  const writes: Array<{ path: string; data: SmokeDoc }> = [];
  const set = vi.fn(async (data: SmokeDoc) => {
    writes.push({ path: 'last', data });
  });
  const get = vi.fn(async () => ({
    exists: true,
    data: () => writes.at(-1)?.data,
  }));
  const doc = vi.fn(() => ({ set, get }));
  return {
    collection: vi.fn(() => ({ doc })),
    doc: vi.fn(() => ({ set, get })),
    _set: set,
    _get: get,
  };
}

describe('FirestoreSmokeController', () => {
  it('writes writtenAt to _smoke and returns the round-tripped envelope', async () => {
    const fakeFirestore = buildFakeFirestore();

    const moduleRef = await Test.createTestingModule({
      controllers: [FirestoreSmokeController],
      providers: [{ provide: FIRESTORE, useValue: fakeFirestore }],
    }).compile();

    const controller = moduleRef.get(FirestoreSmokeController);
    const result = await controller.runSmoke();

    expect(fakeFirestore._set).toHaveBeenCalledOnce();
    expect(fakeFirestore._get).toHaveBeenCalledOnce();
    expect(result.written.writtenAt).toEqual(expect.any(String));
    expect(result.readBack?.writtenAt).toBe(result.written.writtenAt);
    expect(result.docId).toEqual(expect.any(String));
  });
});
