import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserId } from '@learnwren/shared-data-models';

import { AdminUserDeleteService } from './admin-user-delete.service';
import {
  AdminUsersException,
  CannotActOnSelfException,
  LastAdminException,
  UserHasCoursesException,
  UserNotFoundException,
} from './errors/admin-users.exception';
import { AdminUsersRepository } from './admin-users.repository';
import type { PictureStoragePort } from '../picture/picture-storage.adapter';
import type { PictureConfig } from '../picture/picture.config';

// ---------------------------------------------------------------------------
// Test-double factory
//
// makeFixture() builds a cohesive fake where:
//  - users: in-memory map of uid → { role?, status? }
//  - courses: in-memory list of { instructorId, id } objects
//  - firestore.runTransaction runs the callback with a txn stub that routes
//    txn.get(docRef) and txn.get(query) through the same in-memory maps.
//  - txn.update is a spy, so we can assert the DELETED claim happened inside
//    the transaction.
//  - The repo is a real AdminUsersRepository wired to the fake firestore.
//  - Post-commit repo methods (anonymiseUser, deleteAllEnrollmentsForUser,
//    deleteInstructorApplication) are stubbed on the repo instance so they
//    do not require a full Firestore batch/delete implementation in the fake.
// ---------------------------------------------------------------------------

type UserRecord = { role?: string; status?: string };
type CourseRecord = { id: string; instructorId: string; title?: string };

function makeFixture(
  users: Record<string, UserRecord> = {},
  courses: CourseRecord[] = [],
) {
  const txnUpdate = vi.fn();
  const txnGet = vi.fn(async (refOrQuery: unknown) => {
    // Tagged query object (built by the .where() chain below).
    const asTagged = refOrQuery as { _txnCollection?: string; _value?: unknown };
    if (asTagged._txnCollection === 'courses') {
      const filtered = courses.filter((c) => c.instructorId === (asTagged._value as string));
      return { docs: filtered.map((c) => ({ id: c.id, data: () => c })) };
    }
    if (asTagged._txnCollection === 'users') {
      const adminDocs = Object.entries(users)
        .filter(([, v]) => v.role === 'ADMIN')
        .map(([uid, v]) => ({ id: uid, data: () => v }));
      return { docs: adminDocs };
    }
    // DocumentReference (has .id).
    const asRef = refOrQuery as { id?: string };
    if (asRef.id) {
      const uid = asRef.id as string;
      const data = users[uid];
      return { exists: data !== undefined, data: () => data, id: uid };
    }
    return { docs: [] };
  });
  const txn = { get: txnGet, update: txnUpdate };

  const firestore = {
    runTransaction: vi.fn(async (fn: (t: typeof txn) => Promise<unknown>) => fn(txn)),
    collection: vi.fn((name: string) => ({
      doc: vi.fn((uid: string) => ({
        id: uid,
        update: vi.fn(async () => undefined),
        _collection: name,
      })),
      where: vi.fn((_field: string, _op: string, value: unknown) => ({
        _txnCollection: name,
        _value: value,
        get: vi.fn(async () => {
          if (name === 'courses') {
            const filtered = courses.filter((c) => c.instructorId === (value as string));
            return { docs: filtered.map((c) => ({ id: c.id, data: () => c })) };
          }
          // users (admins query)
          const adminDocs = Object.entries(users)
            .filter(([, v]) => v.role === 'ADMIN')
            .map(([uid, v]) => ({ id: uid, data: () => v }));
          return { docs: adminDocs };
        }),
      })),
    })),
  };

  const repo = new AdminUsersRepository(firestore as never);

  // Stub the post-commit repo methods so they do not require a full Firestore
  // batch/get/delete implementation in the fake. The post-commit side effects
  // are tested individually via their own unit tests; here we only care that
  // they are called (or not called in the re-entry path).
  vi.spyOn(repo, 'anonymiseUser').mockResolvedValue(undefined);
  vi.spyOn(repo, 'deleteAllEnrollmentsForUser').mockResolvedValue(undefined);
  vi.spyOn(repo, 'deleteInstructorApplication').mockResolvedValue(undefined);

  return { firestore, txn, txnGet, txnUpdate, repo };
}

function makeAuth(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
    deleteUser: vi.fn().mockResolvedValue(undefined),
  };
}

function makeStorage(): PictureStoragePort {
  return {
    putObject: vi.fn(),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  };
}

const fakePicConfig: PictureConfig = {
  bucket: 'test-bucket',
  publicBaseUrl: 'https://example.com',
  impl: 'fake',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdminUserDeleteService.delete', () => {
  let auth: ReturnType<typeof makeAuth>;
  let storage: PictureStoragePort;

  beforeEach(() => {
    auth = makeAuth();
    storage = makeStorage();
  });

  it('throws CannotActOnSelfException when actor === target', async () => {
    const { firestore, repo } = makeFixture({ u1: { role: 'STUDENT', status: 'ACTIVE' } });
    const svc = new AdminUserDeleteService(firestore as never, auth as never, repo, storage, fakePicConfig);
    await expect(svc.delete('u1' as UserId, 'u1' as UserId)).rejects.toBeInstanceOf(CannotActOnSelfException);
  });

  it('throws UserNotFoundException when the user does not exist — read via txn', async () => {
    const { firestore, repo, txnGet } = makeFixture({});
    const svc = new AdminUserDeleteService(firestore as never, auth as never, repo, storage, fakePicConfig);
    await expect(svc.delete('actor' as UserId, 'target' as UserId)).rejects.toBeInstanceOf(UserNotFoundException);
    // The user lookup MUST have gone through the transaction.
    expect(txnGet).toHaveBeenCalled();
  });

  it('throws LastAdminException when deleting the only active ADMIN — count via txn', async () => {
    const { firestore, repo, txnGet } = makeFixture({ u2: { role: 'ADMIN', status: 'ACTIVE' } });
    const svc = new AdminUserDeleteService(firestore as never, auth as never, repo, storage, fakePicConfig);
    await expect(svc.delete('actor' as UserId, 'u2' as UserId)).rejects.toBeInstanceOf(LastAdminException);
    // txnGet must have been called at least twice: user doc + admins query.
    expect(txnGet).toHaveBeenCalledTimes(2);
  });

  it('LastAdminException propagates typed from inside the transaction', async () => {
    const { firestore, repo } = makeFixture({ u2: { role: 'ADMIN', status: 'ACTIVE' } });
    const svc = new AdminUserDeleteService(firestore as never, auth as never, repo, storage, fakePicConfig);
    const err = await svc.delete('actor' as UserId, 'u2' as UserId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LastAdminException);
    expect((err as LastAdminException).code).toBe('LAST_ADMIN');
  });

  it('throws UserHasCoursesException when the target instructor owns courses — read via txn', async () => {
    const { firestore, repo, txnGet } = makeFixture(
      { u3: { role: 'INSTRUCTOR', status: 'ACTIVE' } },
      [
        { id: 'c1', instructorId: 'u3', title: 'Course 1' },
        { id: 'c2', instructorId: 'u3', title: 'Course 2' },
      ],
    );
    const svc = new AdminUserDeleteService(firestore as never, auth as never, repo, storage, fakePicConfig);
    const err = await svc.delete('actor' as UserId, 'u3' as UserId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UserHasCoursesException);
    expect((err as AdminUsersException).details?.courseCount).toBe(2);
    // The courses query MUST have run via the transaction: >=2 txn reads
    // (user doc + courses query) so moving the courses read outside the txn
    // fails this assertion, not just the user-doc read keeping it green.
    expect(txnGet.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('UserHasCoursesException propagates typed from inside the transaction', async () => {
    const { firestore, repo } = makeFixture(
      { u3: { role: 'INSTRUCTOR', status: 'ACTIVE' } },
      [{ id: 'c1', instructorId: 'u3', title: 'Course 1' }],
    );
    const svc = new AdminUserDeleteService(firestore as never, auth as never, repo, storage, fakePicConfig);
    const err = await svc.delete('actor' as UserId, 'u3' as UserId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UserHasCoursesException);
    expect((err as UserHasCoursesException).code).toBe('USER_HAS_COURSES');
  });

  it('status DELETED is written VIA the transaction (txn.update called), not a direct doc write', async () => {
    const { firestore, repo, txnUpdate } = makeFixture({ target: { role: 'STUDENT', status: 'ACTIVE' } });
    const svc = new AdminUserDeleteService(firestore as never, auth as never, repo, storage, fakePicConfig);
    await svc.delete('actor' as UserId, 'target' as UserId);
    expect(txnUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'target' }),
      expect.objectContaining({ status: 'DELETED' }),
    );
  });

  it('calls revokeRefreshTokens then deleteUser after the claim', async () => {
    const { firestore, repo } = makeFixture({ target: { role: 'STUDENT', status: 'ACTIVE' } });
    const svc = new AdminUserDeleteService(firestore as never, auth as never, repo, storage, fakePicConfig);
    await svc.delete('actor' as UserId, 'target' as UserId);
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('target');
    expect(auth.deleteUser).toHaveBeenCalledWith('target');
  });

  it('calls anonymiseUser and deleteAllEnrollmentsForUser after the claim', async () => {
    const { firestore, repo } = makeFixture({ target: { role: 'STUDENT', status: 'ACTIVE' } });
    const svc = new AdminUserDeleteService(firestore as never, auth as never, repo, storage, fakePicConfig);
    await svc.delete('actor' as UserId, 'target' as UserId);
    expect(repo.anonymiseUser).toHaveBeenCalled();
    expect(repo.deleteAllEnrollmentsForUser).toHaveBeenCalledWith('target');
    expect(repo.deleteInstructorApplication).toHaveBeenCalledWith('target');
  });

  it('deletes the profile picture from storage', async () => {
    const { firestore, repo } = makeFixture({ target: { role: 'STUDENT', status: 'ACTIVE' } });
    const svc = new AdminUserDeleteService(firestore as never, auth as never, repo, storage, fakePicConfig);
    await svc.delete('actor' as UserId, 'target' as UserId);
    expect(storage.deleteObject).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining('target') }),
    );
  });

  it('is idempotent — a second delete on an already-DELETED user proceeds without error', async () => {
    const { firestore, repo } = makeFixture({ u7: { role: 'STUDENT', status: 'DELETED' } });
    const svc = new AdminUserDeleteService(firestore as never, auth as never, repo, storage, fakePicConfig);
    await expect(svc.delete('actor' as UserId, 'u7' as UserId)).resolves.toBeUndefined();
  });

  it('idempotent re-entry skips pre-checks — no last-admin or courses validation', async () => {
    // Even if the user is the only admin and owns courses, re-entry must not throw.
    const { firestore, repo, txnUpdate } = makeFixture(
      { u8: { role: 'ADMIN', status: 'DELETED' } },
      [{ id: 'c1', instructorId: 'u8', title: 'Course' }],
    );
    const svc = new AdminUserDeleteService(firestore as never, auth as never, repo, storage, fakePicConfig);
    await expect(svc.delete('actor' as UserId, 'u8' as UserId)).resolves.toBeUndefined();
    // No DELETED claim inside the transaction (re-entry returns early).
    expect(txnUpdate).not.toHaveBeenCalled();
  });

  it('tolerates auth.deleteUser throwing a user-not-found error (idempotent retry)', async () => {
    const { firestore, repo } = makeFixture({ u9: { role: 'STUDENT', status: 'DELETED' } });
    const notFoundErr = Object.assign(new Error('user-not-found'), { code: 'auth/user-not-found' });
    const badAuth = { ...auth, deleteUser: vi.fn().mockRejectedValue(notFoundErr) };
    const svc = new AdminUserDeleteService(firestore as never, badAuth as never, repo, storage, fakePicConfig);
    await expect(svc.delete('actor' as UserId, 'u9' as UserId)).resolves.toBeUndefined();
  });

  it('wraps unexpected errors from post-commit steps into AdminUsersException INTERNAL', async () => {
    const { firestore, repo } = makeFixture({ target: { role: 'STUDENT', status: 'ACTIVE' } });
    // Make an unexpected error from deleteUser (non-auth/user-not-found code).
    const unexpectedErr = Object.assign(new Error('network error'), { code: 'auth/network-request-failed' });
    const badAuth = {
      revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
      deleteUser: vi.fn().mockRejectedValue(unexpectedErr),
    };
    const svc = new AdminUserDeleteService(firestore as never, badAuth as never, repo, storage, fakePicConfig);
    const err = await svc.delete('actor' as UserId, 'target' as UserId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdminUsersException);
    expect((err as AdminUsersException).code).toBe('INTERNAL');
    expect((err as AdminUsersException).status).toBe(500);
  });

  // Regression for the TOCTOU race on course-ownership:
  // If a concurrent course-create happens between an outside-txn courses read and the
  // delete claim, the new course would end up owned by a deleted user. With all reads
  // inside the transaction this cannot happen — the txn-read courses query observes
  // the committed state at the moment of the transaction attempt.
  it('race regression: courses check inside txn sees current store state', async () => {
    // Simulate the "after concurrent course-create committed" state: the store
    // already has a course. The txn-read must catch it.
    const { firestore, repo } = makeFixture(
      { u10: { role: 'INSTRUCTOR', status: 'ACTIVE' } },
      [{ id: 'c_new', instructorId: 'u10', title: 'New course' }],
    );
    const svc = new AdminUserDeleteService(firestore as never, auth as never, repo, storage, fakePicConfig);
    const err = await svc.delete('actor' as UserId, 'u10' as UserId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UserHasCoursesException);
  });

  // Regression for the concurrent-suspend race on last-admin:
  // Both concurrent deletes read countActiveAdmins == 2 outside the txn (old code).
  // With the fix, the count is read inside the txn. Simulate the "after winner
  // suspended one admin" state: only 1 active admin remains in the store.
  it('race regression: countActiveAdmins inside txn sees current store state', async () => {
    const { firestore, repo } = makeFixture({
      u11: { role: 'ADMIN', status: 'ACTIVE' },
      u12: { role: 'ADMIN', status: 'SUSPENDED' }, // winner already suspended u12
    });
    const svc = new AdminUserDeleteService(firestore as never, auth as never, repo, storage, fakePicConfig);
    // Attempting to delete u11 (the only remaining active admin) must throw LAST_ADMIN.
    const err = await svc.delete('actor' as UserId, 'u11' as UserId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LastAdminException);
  });
});
