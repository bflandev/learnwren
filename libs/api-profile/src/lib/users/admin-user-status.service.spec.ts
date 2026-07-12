import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserId } from '@learnwren/shared-data-models';

import { AdminUserStatusService } from './admin-user-status.service';
import {
  AdminUsersException,
  CannotActOnSelfException,
  InvalidStatusTransitionException,
  LastAdminException,
  UserNotFoundException,
} from './errors/admin-users.exception';
import { AdminUsersRepository } from './admin-users.repository';

// ---------------------------------------------------------------------------
// Test-double factory
//
// makeFixture() builds a cohesive fake where:
//  - The "users" store is an in-memory map keyed by uid.
//  - firestore.runTransaction runs the callback synchronously with a txn stub.
//  - txn.get(ref) resolves using the same in-memory map so the service's
//    getUserInTxn reads observe the same state as direct repo.getUser calls.
//  - txn.get(query) — used by countActiveAdmins(txn) — delegates to the query
//    stub returned by the USERS collection's .where() chain.
//  - txn.update(ref, data) is a spy, allowing assertions that the write
//    happened VIA the transaction.
//  - The repo is a real-ish partial: only getUserInTxn and countActiveAdmins
//    are relevant to the status service; others are stubs.
// ---------------------------------------------------------------------------

type UserRecord = { role?: string; status?: string };

function makeFixture(users: Record<string, UserRecord> = {}) {
  // The txn stub is created here so it can be asserted on later.
  const txnUpdate = vi.fn();
  const txnGet = vi.fn(async (refOrQuery: unknown) => {
    // If the thing has an `id` property it is a DocumentReference.
    const asRef = refOrQuery as { id?: string; _path?: { segments?: string[] } };
    if (asRef.id) {
      const uid = asRef.id as string;
      const data = users[uid];
      return { exists: data !== undefined, data: () => data, id: uid };
    }
    // Otherwise treat it as the admins Query; return all ADMIN-role users.
    const adminDocs = Object.entries(users)
      .filter(([, v]) => v.role === 'ADMIN')
      .map(([uid, v]) => ({ id: uid, data: () => v }));
    return { docs: adminDocs };
  });
  const txn = { get: txnGet, update: txnUpdate };

  // Minimal Firestore handle: collection().doc() returns a ref with `.id` so
  // txnGet can look up the uid; collection().where() returns a query stub.
  const firestore = {
    runTransaction: vi.fn(async (fn: (t: typeof txn) => Promise<unknown>) => fn(txn)),
    collection: vi.fn((name: string) => ({
      doc: vi.fn((uid: string) => ({
        id: uid,
        update: vi.fn(async () => undefined),
        _collection: name,
      })),
      where: vi.fn(() => ({
        get: vi.fn(async () => ({
          docs: Object.entries(users)
            .filter(([, v]) => v.role === 'ADMIN')
            .map(([uid, v]) => ({ id: uid, data: () => v })),
        })),
      })),
    })),
  };

  // Build a repo that delegates getUserInTxn / countActiveAdmins through the
  // real AdminUsersRepository methods, backed by our fake firestore.
  const repo = new AdminUsersRepository(firestore as never);

  return { firestore, txn, txnGet, txnUpdate, repo };
}

function makeAuth(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    updateUser: vi.fn().mockResolvedValue(undefined),
    revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// suspend
// ---------------------------------------------------------------------------

describe('AdminUserStatusService.suspend', () => {
  let auth: ReturnType<typeof makeAuth>;

  beforeEach(() => {
    auth = makeAuth();
  });

  it('throws CannotActOnSelfException when actor === target', async () => {
    const { firestore, repo } = makeFixture({ u1: { role: 'STUDENT', status: 'ACTIVE' } });
    const svc = new AdminUserStatusService(firestore as never, auth as never, repo);
    await expect(svc.suspend('u1' as UserId, 'u1' as UserId)).rejects.toBeInstanceOf(CannotActOnSelfException);
  });

  it('throws UserNotFoundException when the user does not exist — read via txn', async () => {
    const { firestore, repo, txnGet } = makeFixture({});
    const svc = new AdminUserStatusService(firestore as never, auth as never, repo);
    await expect(svc.suspend('actor' as UserId, 'target' as UserId)).rejects.toBeInstanceOf(UserNotFoundException);
    // The user lookup MUST have gone through the transaction.
    expect(txnGet).toHaveBeenCalled();
  });

  it('throws InvalidStatusTransitionException when target is already SUSPENDED — read via txn', async () => {
    const { firestore, repo, txnGet } = makeFixture({ u2: { role: 'STUDENT', status: 'SUSPENDED' } });
    const svc = new AdminUserStatusService(firestore as never, auth as never, repo);
    await expect(svc.suspend('actor' as UserId, 'u2' as UserId)).rejects.toBeInstanceOf(InvalidStatusTransitionException);
    expect(txnGet).toHaveBeenCalled();
  });

  it('throws InvalidStatusTransitionException when target is DELETED — read via txn', async () => {
    const { firestore, repo, txnGet } = makeFixture({ u2: { role: 'STUDENT', status: 'DELETED' } });
    const svc = new AdminUserStatusService(firestore as never, auth as never, repo);
    await expect(svc.suspend('actor' as UserId, 'u2' as UserId)).rejects.toBeInstanceOf(InvalidStatusTransitionException);
    expect(txnGet).toHaveBeenCalled();
  });

  it('throws LastAdminException when suspending the only active ADMIN — count via txn', async () => {
    // Only 1 active admin: u3.
    const { firestore, repo, txnGet } = makeFixture({ u3: { role: 'ADMIN', status: 'ACTIVE' } });
    const svc = new AdminUserStatusService(firestore as never, auth as never, repo);
    await expect(svc.suspend('actor' as UserId, 'u3' as UserId)).rejects.toBeInstanceOf(LastAdminException);
    // txnGet must have been called at least twice: once for the user doc, once
    // for the admins query (countActiveAdmins).
    expect(txnGet).toHaveBeenCalledTimes(2);
  });

  it('LastAdminException propagates typed from inside the transaction', async () => {
    const { firestore, repo } = makeFixture({ u3: { role: 'ADMIN', status: 'ACTIVE' } });
    const svc = new AdminUserStatusService(firestore as never, auth as never, repo);
    const err = await svc.suspend('actor' as UserId, 'u3' as UserId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LastAdminException);
    expect((err as LastAdminException).code).toBe('LAST_ADMIN');
  });

  it('does NOT throw LastAdminException when suspending one of multiple active ADMINs', async () => {
    const { firestore, repo } = makeFixture({
      u3: { role: 'ADMIN', status: 'ACTIVE' },
      u4: { role: 'ADMIN', status: 'ACTIVE' },
    });
    const svc = new AdminUserStatusService(firestore as never, auth as never, repo);
    const res = await svc.suspend('actor' as UserId, 'u3' as UserId);
    expect(res.status).toBe('SUSPENDED');
  });

  it('status SUSPENDED is written VIA the transaction (txn.update called), not a direct doc write', async () => {
    const { firestore, repo, txnUpdate } = makeFixture({
      u4: { role: 'STUDENT', status: 'ACTIVE' },
    });
    const svc = new AdminUserStatusService(firestore as never, auth as never, repo);
    await svc.suspend('actor' as UserId, 'u4' as UserId);
    expect(txnUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u4' }),
      expect.objectContaining({ status: 'SUSPENDED' }),
    );
  });

  it('calls auth.updateUser(disabled:true) and revokeRefreshTokens on success', async () => {
    const { firestore, repo } = makeFixture({ u4: { role: 'STUDENT', status: 'ACTIVE' } });
    const svc = new AdminUserStatusService(firestore as never, auth as never, repo);
    await svc.suspend('actor' as UserId, 'u4' as UserId);
    expect(auth.updateUser).toHaveBeenCalledWith('u4', { disabled: true });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('u4');
  });

  it('returns AdminUserStatusResponse with id and status SUSPENDED', async () => {
    const { firestore, repo } = makeFixture({ u4: { role: 'STUDENT', status: 'ACTIVE' } });
    const svc = new AdminUserStatusService(firestore as never, auth as never, repo);
    const res = await svc.suspend('actor' as UserId, 'u4' as UserId);
    expect(res).toEqual({ id: 'u4', status: 'SUSPENDED' });
  });

  it('wraps auth side-effect failure into AdminUsersException INTERNAL', async () => {
    const { firestore, repo } = makeFixture({ u5: { role: 'STUDENT', status: 'ACTIVE' } });
    const badAuth = { ...auth, updateUser: vi.fn().mockRejectedValue(new Error('Auth failure')) };
    const svc = new AdminUserStatusService(firestore as never, badAuth as never, repo);
    const err = await svc.suspend('actor' as UserId, 'u5' as UserId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdminUsersException);
    expect((err as AdminUsersException).code).toBe('INTERNAL');
    // Message + status + cause are part of the thrown contract.
    expect((err as AdminUsersException).status).toBe(500);
    expect((err as AdminUsersException).message).toBe('An internal error occurred during suspend.');
    expect((err as Error).cause).toBeInstanceOf(Error);
    expect(((err as Error).cause as Error).message).toBe('Auth failure');
  });

  it('reverts status to ACTIVE via a direct users-doc write when the suspend side-effect fails', async () => {
    // Capture each direct doc().update tagged with the collection name it came
    // from. The service's revert path uses collection(USERS).doc(target).update,
    // so the revert write MUST be tagged 'users' (kills the USERS='' const mutant)
    // — and the repo's own getUserInTxn collection('users') call goes through txn,
    // not this update path, so it cannot mask the assertion.
    const directUpdates: Array<{ name: string; data: Record<string, unknown> }> = [];
    const collectionSpy = vi.fn((name: string) => ({
      doc: vi.fn((uid: string) => ({
        id: uid,
        update: vi.fn(async (data: Record<string, unknown>) => {
          directUpdates.push({ name, data });
        }),
        _collection: name,
      })),
      where: vi.fn(() => ({ get: vi.fn(async () => ({ docs: [] })) })),
    }));
    const txn = {
      get: vi.fn(async () => ({ exists: true, data: () => ({ role: 'STUDENT', status: 'ACTIVE' }), id: 'u5' })),
      update: vi.fn(),
    };
    const firestore = {
      runTransaction: vi.fn(async (fn: (t: typeof txn) => Promise<unknown>) => fn(txn)),
      collection: collectionSpy,
    };
    const repo = new AdminUsersRepository(firestore as never);
    const badAuth = { ...auth, updateUser: vi.fn().mockRejectedValue(new Error('Auth failure')) };
    const svc = new AdminUserStatusService(firestore as never, badAuth as never, repo);

    await svc.suspend('actor' as UserId, 'u5' as UserId).catch(() => undefined);

    // Exactly one direct write (the revert), on the 'users' collection, ACTIVE.
    expect(directUpdates).toHaveLength(1);
    expect(directUpdates[0].name).toBe('users');
    expect(directUpdates[0].data.status).toBe('ACTIVE');
    expect(typeof directUpdates[0].data.updatedAt).toBe('string');
  });

  it('still throws INTERNAL when the suspend status revert ALSO fails — and logs the revert error', async () => {
    // Both the auth side-effect AND the revert write reject — inner catch path.
    const revertUpdate = vi.fn().mockRejectedValue(new Error('revert failed'));
    const collectionSpy = vi.fn((name: string) => ({
      doc: vi.fn((uid: string) => ({ id: uid, update: revertUpdate, _collection: name })),
      where: vi.fn(() => ({ get: vi.fn(async () => ({ docs: [] })) })),
    }));
    const txn = {
      get: vi.fn(async () => ({ exists: true, data: () => ({ role: 'STUDENT', status: 'ACTIVE' }), id: 'u5' })),
      update: vi.fn(),
    };
    const firestore = {
      runTransaction: vi.fn(async (fn: (t: typeof txn) => Promise<unknown>) => fn(txn)),
      collection: collectionSpy,
    };
    const repo = new AdminUsersRepository(firestore as never);
    const badAuth = { ...auth, updateUser: vi.fn().mockRejectedValue(new Error('Auth failure')) };
    const svc = new AdminUserStatusService(firestore as never, badAuth as never, repo);

    // Spy the Logger so the inner-catch body (which only logs) is observable —
    // kills the BlockStatement + StringLiteral mutants on the inner catch.
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const err = await svc.suspend('actor' as UserId, 'u5' as UserId).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AdminUsersException);
      expect((err as AdminUsersException).code).toBe('INTERNAL');
      expect(revertUpdate).toHaveBeenCalledTimes(1);
      // The inner catch must have logged the revert failure (non-empty message
      // that names the target + the revert error).
      const innerLog = errorSpy.mock.calls
        .map((c) => String(c[0]))
        .find((msg) => msg.includes('status revert also failed'));
      expect(innerLog).toBeDefined();
      expect(innerLog).toContain('u5');
      expect(innerLog).toContain('revert failed');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('re-enables the Auth account when disable succeeded but revokeRefreshTokens failed (no stranded account)', async () => {
    // Regression: updateUser(disabled:true) succeeded, then the revoke threw.
    // Reverting only Firestore to ACTIVE left the Auth account disabled —
    // logins fail while unsuspend is rejected (status is already ACTIVE).
    const { firestore, repo } = makeFixture({ u5: { role: 'STUDENT', status: 'ACTIVE' } });
    const badAuth = {
      updateUser: vi.fn().mockResolvedValue(undefined),
      revokeRefreshTokens: vi.fn().mockRejectedValue(new Error('revoke failure')),
    };
    const svc = new AdminUserStatusService(firestore as never, badAuth as never, repo);

    const err = await svc.suspend('actor' as UserId, 'u5' as UserId).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AdminUsersException);
    expect((err as AdminUsersException).code).toBe('INTERNAL');
    // Best-effort re-enable: disable happened first, then the revert.
    expect(badAuth.updateUser).toHaveBeenNthCalledWith(1, 'u5', { disabled: true });
    expect(badAuth.updateUser).toHaveBeenNthCalledWith(2, 'u5', { disabled: false });
  });

  it('does NOT attempt an Auth re-enable when the disable itself failed', async () => {
    const { firestore, repo } = makeFixture({ u5: { role: 'STUDENT', status: 'ACTIVE' } });
    const badAuth = {
      updateUser: vi.fn().mockRejectedValue(new Error('Auth failure')),
      revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
    };
    const svc = new AdminUserStatusService(firestore as never, badAuth as never, repo);

    await svc.suspend('actor' as UserId, 'u5' as UserId).catch(() => undefined);

    // Only the failed disable attempt — no {disabled:false} revert call.
    expect(badAuth.updateUser).toHaveBeenCalledTimes(1);
    expect(badAuth.updateUser).toHaveBeenCalledWith('u5', { disabled: true });
  });

  it('still throws INTERNAL and reverts Firestore when the Auth re-enable ALSO fails', async () => {
    const { firestore, repo } = makeFixture({ u5: { role: 'STUDENT', status: 'ACTIVE' } });
    const badAuth = {
      updateUser: vi
        .fn()
        .mockResolvedValueOnce(undefined) // disable succeeds
        .mockRejectedValueOnce(new Error('re-enable failure')), // revert fails
      revokeRefreshTokens: vi.fn().mockRejectedValue(new Error('revoke failure')),
    };
    const svc = new AdminUserStatusService(firestore as never, badAuth as never, repo);

    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const err = await svc.suspend('actor' as UserId, 'u5' as UserId).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AdminUsersException);
      expect((err as AdminUsersException).code).toBe('INTERNAL');
      const reEnableLog = errorSpy.mock.calls
        .map((c) => String(c[0]))
        .find((msg) => msg.includes('auth re-enable also failed'));
      expect(reEnableLog).toBeDefined();
      expect(reEnableLog).toContain('u5');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('InvalidStatusTransitionException records attempted=SUSPENDED', async () => {
    const { firestore, repo } = makeFixture({ u2: { role: 'STUDENT', status: 'SUSPENDED' } });
    const svc = new AdminUserStatusService(firestore as never, auth as never, repo);
    const err = (await svc
      .suspend('actor' as UserId, 'u2' as UserId)
      .catch((e: unknown) => e)) as InvalidStatusTransitionException;
    expect(err).toBeInstanceOf(InvalidStatusTransitionException);
    expect(err.details).toEqual({ currentStatus: 'SUSPENDED', attempted: 'SUSPENDED' });
  });

  // Regression for the concurrent-suspend race:
  // Both concurrent calls read countActiveAdmins == 2 (two admins in the store).
  // In the real system, Firestore aborts the loser. Here we simulate the loser's
  // retry: after the winner commits SUSPENDED, the "current" store shows 1 active
  // admin. When the loser's txnGet is called for the admins query it MUST see the
  // updated count, which in a retry would be 1, causing LastAdminException.
  it('race regression: countActiveAdmins inside txn observes current store state', async () => {
    // Store has 2 admins initially; simulate the "after winner committed" state
    // by only putting 1 active admin in the store (as if the other was already suspended).
    const { firestore, repo } = makeFixture({
      u3: { role: 'ADMIN', status: 'ACTIVE' },
      // u4 was suspended by the winning concurrent request — it is SUSPENDED.
      u4: { role: 'ADMIN', status: 'SUSPENDED' },
    });
    const svc = new AdminUserStatusService(firestore as never, auth as never, repo);
    // Attempting to suspend u3 (the remaining active admin) must throw LAST_ADMIN
    // because the txn-read count reflects u4 is already SUSPENDED (count == 1).
    const err = await svc.suspend('actor' as UserId, 'u3' as UserId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LastAdminException);
  });
});

// ---------------------------------------------------------------------------
// unsuspend
// ---------------------------------------------------------------------------

describe('AdminUserStatusService.unsuspend', () => {
  let auth: ReturnType<typeof makeAuth>;

  beforeEach(() => {
    auth = makeAuth();
  });

  it('throws UserNotFoundException when the user does not exist — read via txn', async () => {
    const { firestore, repo, txnGet } = makeFixture({});
    const svc = new AdminUserStatusService(firestore as never, auth as never, repo);
    await expect(svc.unsuspend('actor' as UserId, 'target' as UserId)).rejects.toBeInstanceOf(UserNotFoundException);
    expect(txnGet).toHaveBeenCalled();
  });

  it('throws InvalidStatusTransitionException when user is not SUSPENDED — read via txn', async () => {
    const { firestore, repo, txnGet } = makeFixture({ u2: { role: 'STUDENT', status: 'ACTIVE' } });
    const svc = new AdminUserStatusService(firestore as never, auth as never, repo);
    await expect(svc.unsuspend('actor' as UserId, 'u2' as UserId)).rejects.toBeInstanceOf(InvalidStatusTransitionException);
    expect(txnGet).toHaveBeenCalled();
  });

  it('InvalidStatusTransitionException records the resolved currentStatus + attempted=ACTIVE', async () => {
    const { firestore, repo } = makeFixture({ u2: { role: 'STUDENT', status: 'ACTIVE' } });
    const svc = new AdminUserStatusService(firestore as never, auth as never, repo);
    const err = (await svc
      .unsuspend('actor' as UserId, 'u2' as UserId)
      .catch((e: unknown) => e)) as InvalidStatusTransitionException;
    expect(err).toBeInstanceOf(InvalidStatusTransitionException);
    expect(err.details).toEqual({ currentStatus: 'ACTIVE', attempted: 'ACTIVE' });
  });

  // resolveStatus: an ABSENT status field must resolve to 'ACTIVE' (≠ SUSPENDED),
  // so unsuspend throws with details.currentStatus === 'ACTIVE'. Kills the
  // `if (true) return raw` conditional mutant (would yield undefined) and the
  // `return ''` literal mutant.
  it('treats an absent status field as ACTIVE in the unsuspend transition error', async () => {
    const { firestore, repo } = makeFixture({ u2: { role: 'STUDENT' } });
    const svc = new AdminUserStatusService(firestore as never, auth as never, repo);
    const err = (await svc
      .unsuspend('actor' as UserId, 'u2' as UserId)
      .catch((e: unknown) => e)) as InvalidStatusTransitionException;
    expect(err).toBeInstanceOf(InvalidStatusTransitionException);
    expect(err.details).toEqual({ currentStatus: 'ACTIVE', attempted: 'ACTIVE' });
  });

  it('status ACTIVE is written VIA the transaction (txn.update called), not a direct doc write', async () => {
    const { firestore, repo, txnUpdate } = makeFixture({ u6: { role: 'STUDENT', status: 'SUSPENDED' } });
    const svc = new AdminUserStatusService(firestore as never, auth as never, repo);
    await svc.unsuspend('actor' as UserId, 'u6' as UserId);
    expect(txnUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u6' }),
      expect.objectContaining({ status: 'ACTIVE' }),
    );
  });

  it('calls auth.updateUser(disabled:false) but NOT revokeRefreshTokens on unsuspend', async () => {
    const { firestore, repo } = makeFixture({ u6: { role: 'STUDENT', status: 'SUSPENDED' } });
    const svc = new AdminUserStatusService(firestore as never, auth as never, repo);
    await svc.unsuspend('actor' as UserId, 'u6' as UserId);
    expect(auth.updateUser).toHaveBeenCalledWith('u6', { disabled: false });
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('returns AdminUserStatusResponse with id and status ACTIVE', async () => {
    const { firestore, repo } = makeFixture({ u6: { role: 'STUDENT', status: 'SUSPENDED' } });
    const svc = new AdminUserStatusService(firestore as never, auth as never, repo);
    const res = await svc.unsuspend('actor' as UserId, 'u6' as UserId);
    expect(res).toEqual({ id: 'u6', status: 'ACTIVE' });
  });

  it('wraps auth side-effect failure into AdminUsersException INTERNAL', async () => {
    const { firestore, repo } = makeFixture({ u7: { role: 'STUDENT', status: 'SUSPENDED' } });
    const badAuth = { ...auth, updateUser: vi.fn().mockRejectedValue(new Error('Auth failure')) };
    const svc = new AdminUserStatusService(firestore as never, badAuth as never, repo);
    const err = await svc.unsuspend('actor' as UserId, 'u7' as UserId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdminUsersException);
    expect((err as AdminUsersException).code).toBe('INTERNAL');
    expect((err as AdminUsersException).status).toBe(500);
    expect((err as AdminUsersException).message).toBe('An internal error occurred during unsuspend.');
    expect((err as Error).cause).toBeInstanceOf(Error);
    expect(((err as Error).cause as Error).message).toBe('Auth failure');
  });

  it('reverts status to SUSPENDED via a direct users-doc write when the unsuspend side-effect fails', async () => {
    const directUpdates: Array<{ name: string; data: Record<string, unknown> }> = [];
    const collectionSpy = vi.fn((name: string) => ({
      doc: vi.fn((uid: string) => ({
        id: uid,
        update: vi.fn(async (data: Record<string, unknown>) => {
          directUpdates.push({ name, data });
        }),
        _collection: name,
      })),
      where: vi.fn(() => ({ get: vi.fn(async () => ({ docs: [] })) })),
    }));
    const txn = {
      get: vi.fn(async () => ({ exists: true, data: () => ({ role: 'STUDENT', status: 'SUSPENDED' }), id: 'u7' })),
      update: vi.fn(),
    };
    const firestore = {
      runTransaction: vi.fn(async (fn: (t: typeof txn) => Promise<unknown>) => fn(txn)),
      collection: collectionSpy,
    };
    const repo = new AdminUsersRepository(firestore as never);
    const badAuth = { ...auth, updateUser: vi.fn().mockRejectedValue(new Error('Auth failure')) };
    const svc = new AdminUserStatusService(firestore as never, badAuth as never, repo);

    await svc.unsuspend('actor' as UserId, 'u7' as UserId).catch(() => undefined);

    expect(directUpdates).toHaveLength(1);
    expect(directUpdates[0].name).toBe('users');
    expect(directUpdates[0].data.status).toBe('SUSPENDED');
    expect(typeof directUpdates[0].data.updatedAt).toBe('string');
  });

  it('still throws INTERNAL when the unsuspend status revert ALSO fails — and logs the revert error', async () => {
    const revertUpdate = vi.fn().mockRejectedValue(new Error('revert failed'));
    const collectionSpy = vi.fn((name: string) => ({
      doc: vi.fn((uid: string) => ({ id: uid, update: revertUpdate, _collection: name })),
      where: vi.fn(() => ({ get: vi.fn(async () => ({ docs: [] })) })),
    }));
    const txn = {
      get: vi.fn(async () => ({ exists: true, data: () => ({ role: 'STUDENT', status: 'SUSPENDED' }), id: 'u7' })),
      update: vi.fn(),
    };
    const firestore = {
      runTransaction: vi.fn(async (fn: (t: typeof txn) => Promise<unknown>) => fn(txn)),
      collection: collectionSpy,
    };
    const repo = new AdminUsersRepository(firestore as never);
    const badAuth = { ...auth, updateUser: vi.fn().mockRejectedValue(new Error('Auth failure')) };
    const svc = new AdminUserStatusService(firestore as never, badAuth as never, repo);

    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const err = await svc.unsuspend('actor' as UserId, 'u7' as UserId).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AdminUsersException);
      expect((err as AdminUsersException).code).toBe('INTERNAL');
      expect(revertUpdate).toHaveBeenCalledTimes(1);
      const innerLog = errorSpy.mock.calls
        .map((c) => String(c[0]))
        .find((msg) => msg.includes('status revert also failed'));
      expect(innerLog).toBeDefined();
      expect(innerLog).toContain('u7');
      expect(innerLog).toContain('revert failed');
    } finally {
      errorSpy.mockRestore();
    }
  });
});
