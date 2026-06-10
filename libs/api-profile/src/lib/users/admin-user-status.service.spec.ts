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
  });
});
