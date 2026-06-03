import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FirestoreHandle } from '@learnwren/api-firebase';
import type { UserId, UserRole } from '@learnwren/shared-data-models';

import { InstructorApplicationService } from './instructor-application.service';
import {
  AlreadyInstructorException,
  InstructorApplicationExistsException,
  InstructorApplicationInvalidException,
} from './errors/instructor-application.exception';

interface DocState {
  exists: boolean;
  data: Record<string, unknown>;
}

function makeFirestore(initial: DocState) {
  const state: DocState = { exists: initial.exists, data: { ...initial.data } };
  const setFn = vi.fn(async (value: Record<string, unknown>) => {
    state.exists = true;
    state.data = { ...value };
  });
  const doc = {
    get: vi.fn(async () => ({ exists: state.exists, data: () => state.data })),
    set: setFn,
  };
  const collection = vi.fn(() => ({ doc: vi.fn(() => doc) }));
  // submit() now reads-then-writes inside runTransaction; the fake delegates the
  // transaction's get/set straight to the single doc stub so existing assertions
  // on `setFn` and `state` continue to hold.
  const runTransaction = vi.fn(
    async (fn: (tx: { get: (r: typeof doc) => unknown; set: (r: typeof doc, d: Record<string, unknown>) => void }) => unknown) =>
      fn({
        get: (r) => r.get(),
        set: (r, d) => {
          void r.set(d);
        },
      }),
  );
  const firestore = { collection, runTransaction } as unknown as FirestoreHandle;
  return { firestore, collection, setFn, state, runTransaction };
}

const UID = 'u-1' as UserId;
const STUDENT: UserRole = 'STUDENT';

describe('InstructorApplicationService', () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date('2026-05-29T10:00:00.000Z')));

  it('getApplication returns { status: NONE } when no doc exists', async () => {
    const { firestore } = makeFirestore({ exists: false, data: {} });
    const svc = new InstructorApplicationService(firestore);
    expect(await svc.getApplication(UID)).toEqual({ status: 'NONE' });
  });

  it('getApplication returns the stored PENDING view', async () => {
    const { firestore } = makeFirestore({
      exists: true,
      data: {
        uid: UID, statement: 'I teach', expertise: 'Rust',
        status: 'PENDING', createdAt: '2026-05-28T00:00:00.000Z',
      },
    });
    const svc = new InstructorApplicationService(firestore);
    expect(await svc.getApplication(UID)).toEqual({
      status: 'PENDING',
      statement: 'I teach',
      expertise: 'Rust',
      createdAt: '2026-05-28T00:00:00.000Z',
    });
  });

  it('submit rejects an INSTRUCTOR role with ALREADY_INSTRUCTOR (before touching Firestore)', async () => {
    const { firestore, collection } = makeFirestore({ exists: false, data: {} });
    const svc = new InstructorApplicationService(firestore);
    await expect(
      svc.submit(UID, 'INSTRUCTOR', { statement: 'x', expertise: 'y' }),
    ).rejects.toBeInstanceOf(AlreadyInstructorException);
    expect(collection).not.toHaveBeenCalled();
  });

  it('submit rejects an ADMIN role with ALREADY_INSTRUCTOR', async () => {
    const { firestore, collection } = makeFirestore({ exists: false, data: {} });
    const svc = new InstructorApplicationService(firestore);
    await expect(
      svc.submit(UID, 'ADMIN', { statement: 'x', expertise: 'y' }),
    ).rejects.toBeInstanceOf(AlreadyInstructorException);
    expect(collection).not.toHaveBeenCalled();
  });

  it('submit rejects a blank statement with field=statement', async () => {
    const { firestore } = makeFirestore({ exists: false, data: {} });
    const svc = new InstructorApplicationService(firestore);
    await expect(
      svc.submit(UID, STUDENT, { statement: '   ', expertise: 'Rust' }),
    ).rejects.toMatchObject({ code: 'INSTRUCTOR_APPLICATION_INVALID', details: { field: 'statement' } });
  });

  it('submit rejects a blank expertise with field=expertise', async () => {
    const { firestore } = makeFirestore({ exists: false, data: {} });
    const svc = new InstructorApplicationService(firestore);
    await expect(
      svc.submit(UID, STUDENT, { statement: 'I teach', expertise: '' }),
    ).rejects.toMatchObject({ code: 'INSTRUCTOR_APPLICATION_INVALID', details: { field: 'expertise' } });
  });

  it('submit rejects an over-long statement (>2000 chars)', async () => {
    const { firestore } = makeFirestore({ exists: false, data: {} });
    const svc = new InstructorApplicationService(firestore);
    await expect(
      svc.submit(UID, STUDENT, { statement: 'a'.repeat(2001), expertise: 'Rust' }),
    ).rejects.toBeInstanceOf(InstructorApplicationInvalidException);
  });

  it('submit rejects an over-long expertise (>2000 chars)', async () => {
    const { firestore } = makeFirestore({ exists: false, data: {} });
    const svc = new InstructorApplicationService(firestore);
    await expect(
      svc.submit(UID, STUDENT, { statement: 'I teach', expertise: 'x'.repeat(2001) }),
    ).rejects.toBeInstanceOf(InstructorApplicationInvalidException);
  });

  it('submit rejects when a PENDING application already exists', async () => {
    const { firestore } = makeFirestore({
      exists: true,
      data: { uid: UID, statement: 'x', expertise: 'y', status: 'PENDING', createdAt: 'z' },
    });
    const svc = new InstructorApplicationService(firestore);
    await expect(
      svc.submit(UID, STUDENT, { statement: 'again', expertise: 'again' }),
    ).rejects.toBeInstanceOf(InstructorApplicationExistsException);
  });

  it('submit performs the PENDING check and write inside a single transaction', async () => {
    // Regression (N6): a non-transactional read-then-write let two concurrent
    // submits both pass the check and clobber each other / regress an APPROVED doc.
    const { firestore, runTransaction, setFn } = makeFirestore({ exists: false, data: {} });
    const svc = new InstructorApplicationService(firestore);
    await svc.submit(UID, STUDENT, { statement: 'I teach', expertise: 'Rust' });
    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(setFn).toHaveBeenCalledTimes(1);
  });

  it('submit writes a trimmed PENDING doc and returns the view (overwrites a DECLINED doc)', async () => {
    const { firestore, setFn } = makeFirestore({
      exists: true,
      data: { uid: UID, statement: 'old', expertise: 'old', status: 'DECLINED', createdAt: 'old' },
    });
    const svc = new InstructorApplicationService(firestore);
    const view = await svc.submit(UID, STUDENT, {
      statement: '  I teach Rust  ',
      expertise: '  Systems  ',
    });
    expect(setFn).toHaveBeenCalledWith({
      uid: UID,
      statement: 'I teach Rust',
      expertise: 'Systems',
      status: 'PENDING',
      createdAt: '2026-05-29T10:00:00.000Z',
    });
    expect(view).toEqual({
      status: 'PENDING',
      statement: 'I teach Rust',
      expertise: 'Systems',
      createdAt: '2026-05-29T10:00:00.000Z',
    });
  });
});
