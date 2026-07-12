import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserId } from '@learnwren/shared-data-models';

import { AdminUserRoleService } from './admin-user-role.service';
import {
  AdminUsersException,
  InvalidRoleTransitionException,
  RoleChangeTargetNotActiveException,
  UserNotFoundException,
} from './errors/admin-users.exception';
import { AdminUsersRepository } from './admin-users.repository';

// ---------------------------------------------------------------------------
// Test-double factory — mirrors the admin-user-status fixture:
//  - users/apps are in-memory maps keyed by id.
//  - firestore.runTransaction runs the callback with a txn stub whose get()
//    reads the users map (conflict-detected read path) and whose update() is
//    a spy so the claim write can be asserted to go VIA the transaction.
//  - direct collection().doc().update() calls are recorded per collection so
//    revert writes and instructorApplications resolution can be asserted.
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;

function makeFixture(users: Record<string, Rec> = {}, apps: Record<string, Rec> = {}) {
  const txnUpdate = vi.fn();
  const txnGet = vi.fn(async (ref: { id?: string }) => {
    const uid = ref.id as string;
    const data = users[uid];
    return { exists: data !== undefined, data: () => data, id: uid };
  });
  const txn = { get: txnGet, update: txnUpdate };

  const directUpdates: Array<{ collection: string; id: string; data: Rec }> = [];
  let failDirectUpdates = false;

  const firestore = {
    runTransaction: vi.fn(async (fn: (t: typeof txn) => Promise<unknown>) => fn(txn)),
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => ({
        id,
        _collection: name,
        get: vi.fn(async () => {
          const data = name === 'instructorApplications' ? apps[id] : users[id];
          return { exists: data !== undefined, data: () => data };
        }),
        update: vi.fn(async (data: Rec) => {
          if (failDirectUpdates) throw new Error('direct update failed');
          directUpdates.push({ collection: name, id, data });
        }),
      })),
    })),
  };
  const repo = new AdminUsersRepository(firestore as never);
  return {
    firestore,
    txnGet,
    txnUpdate,
    directUpdates,
    repo,
    setFailDirectUpdates: (v: boolean) => {
      failDirectUpdates = v;
    },
  };
}

function makeAuth(): { setCustomUserClaims: ReturnType<typeof vi.fn>; revokeRefreshTokens: ReturnType<typeof vi.fn> } {
  return {
    setCustomUserClaims: vi.fn().mockResolvedValue(undefined),
    revokeRefreshTokens: vi.fn().mockResolvedValue(undefined),
  };
}

function makeService(fx: ReturnType<typeof makeFixture>, auth: ReturnType<typeof makeAuth>) {
  const svc = new AdminUserRoleService(fx.firestore as never, auth as never, fx.repo);
  const logSpy = vi.fn();
  const errorSpy = vi.fn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (svc as any).logger.log = logSpy;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (svc as any).logger.error = errorSpy;
  return { svc, logSpy, errorSpy };
}

const ACTOR = 'actor' as UserId;
const U1 = 'u1' as UserId;

describe('AdminUserRoleService.promote', () => {
  let auth: ReturnType<typeof makeAuth>;

  beforeEach(() => {
    auth = makeAuth();
  });

  it('throws UserNotFoundException when the user is missing — read via txn', async () => {
    const fx = makeFixture({});
    const { svc } = makeService(fx, auth);
    await expect(svc.promote(ACTOR, 'nope' as UserId)).rejects.toBeInstanceOf(UserNotFoundException);
    expect(fx.txnGet).toHaveBeenCalled();
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('throws InvalidRoleTransitionException when the user is already an INSTRUCTOR', async () => {
    const fx = makeFixture({ u1: { role: 'INSTRUCTOR', status: 'ACTIVE' } });
    const { svc } = makeService(fx, auth);
    const err = await svc.promote(ACTOR, U1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InvalidRoleTransitionException);
    expect((err as InvalidRoleTransitionException).status).toBe(409);
    // attempted target role must be INSTRUCTOR (kills the 'INSTRUCTOR'→"" mutant).
    expect((err as InvalidRoleTransitionException).details).toEqual({
      currentRole: 'INSTRUCTOR',
      attempted: 'INSTRUCTOR',
    });
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
    expect(fx.txnUpdate).not.toHaveBeenCalled();
  });

  it('throws InvalidRoleTransitionException when the user is an ADMIN', async () => {
    const fx = makeFixture({ u1: { role: 'ADMIN', status: 'ACTIVE' } });
    const { svc } = makeService(fx, auth);
    const err = await svc.promote(ACTOR, U1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InvalidRoleTransitionException);
    expect((err as InvalidRoleTransitionException).details).toEqual({
      currentRole: 'ADMIN',
      attempted: 'INSTRUCTOR',
    });
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('rejects a SUSPENDED target with a typed 409 and never writes the role', async () => {
    // Regression: a plain non-txn read checked only the role, so a SUSPENDED
    // user could be promoted.
    const fx = makeFixture({ u1: { role: 'STUDENT', status: 'SUSPENDED' } });
    const { svc } = makeService(fx, auth);
    const err = await svc.promote(ACTOR, U1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RoleChangeTargetNotActiveException);
    expect((err as AdminUsersException).code).toBe('INVALID_ROLE_TRANSITION');
    expect((err as AdminUsersException).status).toBe(409);
    expect((err as AdminUsersException).details).toEqual({
      currentStatus: 'SUSPENDED',
      attempted: 'INSTRUCTOR',
    });
    expect(fx.txnUpdate).not.toHaveBeenCalled();
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('rejects a DELETED tombstone with a typed 409 instead of overwriting it with a role write', async () => {
    const fx = makeFixture({ u1: { role: 'STUDENT', status: 'DELETED' } });
    const { svc } = makeService(fx, auth);
    const err = await svc.promote(ACTOR, U1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RoleChangeTargetNotActiveException);
    expect((err as AdminUsersException).details).toEqual({
      currentStatus: 'DELETED',
      attempted: 'INSTRUCTOR',
    });
    expect(fx.txnUpdate).not.toHaveBeenCalled();
    expect(fx.directUpdates).toHaveLength(0);
  });

  it('treats an absent status field as ACTIVE (legacy docs stay promotable)', async () => {
    const fx = makeFixture({ u1: { role: 'STUDENT' } });
    const { svc } = makeService(fx, auth);
    const res = await svc.promote(ACTOR, U1);
    expect(res).toEqual({ id: 'u1', role: 'INSTRUCTOR' });
  });

  it('claims role INSTRUCTOR VIA the transaction (txn.update on users/{uid}), then sets the claim', async () => {
    const fx = makeFixture({ u1: { role: 'STUDENT', status: 'ACTIVE' } });
    const { svc, logSpy } = makeService(fx, auth);
    const res = await svc.promote(ACTOR, U1);
    expect(fx.txnUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1', _collection: 'users' }),
      expect.objectContaining({ role: 'INSTRUCTOR', updatedAt: expect.any(String) }),
    );
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u1', { role: 'INSTRUCTOR' });
    expect(res).toEqual({ id: 'u1', role: 'INSTRUCTOR' });
    expect(logSpy).toHaveBeenCalledWith('Promoted uid=u1 to INSTRUCTOR by actor=actor');
  });

  it('resolves a PENDING instructor application to APPROVED as part of the promotion', async () => {
    const fx = makeFixture(
      { u1: { role: 'STUDENT', status: 'ACTIVE' } },
      { u1: { uid: 'u1', status: 'PENDING' } },
    );
    const { svc } = makeService(fx, auth);
    await svc.promote(ACTOR, U1);
    const appUpdate = fx.directUpdates.find((u) => u.collection === 'instructorApplications');
    expect(appUpdate).toBeDefined();
    expect(appUpdate!.id).toBe('u1');
    expect(appUpdate!.data).toEqual({ status: 'APPROVED', resolvedAt: expect.any(String) });
  });

  it('leaves a non-PENDING (or absent) application untouched', async () => {
    const fx = makeFixture({ u1: { role: 'STUDENT', status: 'ACTIVE' } });
    const { svc } = makeService(fx, auth);
    await svc.promote(ACTOR, U1);
    expect(fx.directUpdates.filter((u) => u.collection === 'instructorApplications')).toHaveLength(0);
  });

  it('reverts the claimed role to STUDENT and throws INTERNAL when setCustomUserClaims fails', async () => {
    const fx = makeFixture({ u1: { role: 'STUDENT', status: 'ACTIVE' } });
    const cause = new Error('Firebase exploded');
    auth.setCustomUserClaims.mockRejectedValue(cause);
    const { svc, errorSpy, logSpy } = makeService(fx, auth);
    const err = await svc.promote(ACTOR, U1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdminUsersException);
    expect((err as AdminUsersException).code).toBe('INTERNAL');
    expect((err as AdminUsersException).status).toBe(500);
    // Non-empty message (kills the message→"" mutant).
    expect((err as AdminUsersException).message).toBe('An internal error occurred during promotion.');
    // The original error is chained as `cause` (kills the { cause: err }→{} mutant).
    expect((err as Error).cause).toBe(cause);
    // Best-effort revert: role back to STUDENT via a direct users-doc write.
    const revert = fx.directUpdates.find((u) => u.collection === 'users');
    expect(revert).toBeDefined();
    expect(revert!.id).toBe('u1');
    expect(revert!.data).toEqual({ role: 'STUDENT', updatedAt: expect.any(String) });
    expect(errorSpy).toHaveBeenCalledWith('Promotion of uid=u1 failed: Firebase exploded');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('still throws INTERNAL when the role revert ALSO fails — and logs the revert error', async () => {
    const fx = makeFixture({ u1: { role: 'STUDENT', status: 'ACTIVE' } });
    fx.setFailDirectUpdates(true);
    auth.setCustomUserClaims.mockRejectedValue(new Error('Firebase exploded'));
    const { svc, errorSpy } = makeService(fx, auth);
    const err = await svc.promote(ACTOR, U1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdminUsersException);
    expect((err as AdminUsersException).code).toBe('INTERNAL');
    const revertLog = errorSpy.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .find((msg: string) => msg.includes('role revert also failed'));
    expect(revertLog).toBeDefined();
    expect(revertLog).toContain('u1');
  });
});

describe('AdminUserRoleService.demote', () => {
  let auth: ReturnType<typeof makeAuth>;

  beforeEach(() => {
    auth = makeAuth();
  });

  it('throws UserNotFoundException when the user is missing — read via txn', async () => {
    const fx = makeFixture({});
    const { svc } = makeService(fx, auth);
    await expect(svc.demote(ACTOR, 'nope' as UserId)).rejects.toBeInstanceOf(UserNotFoundException);
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('throws InvalidRoleTransitionException when the user is a STUDENT', async () => {
    const fx = makeFixture({ u1: { role: 'STUDENT', status: 'ACTIVE' } });
    const { svc } = makeService(fx, auth);
    const err = await svc.demote(ACTOR, U1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InvalidRoleTransitionException);
    expect((err as InvalidRoleTransitionException).status).toBe(409);
    // attempted target role must be STUDENT (kills the 'STUDENT'→"" mutant).
    expect((err as InvalidRoleTransitionException).details).toEqual({
      currentRole: 'STUDENT',
      attempted: 'STUDENT',
    });
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('throws InvalidRoleTransitionException when the user is an ADMIN', async () => {
    const fx = makeFixture({ u1: { role: 'ADMIN', status: 'ACTIVE' } });
    const { svc } = makeService(fx, auth);
    const err = await svc.demote(ACTOR, U1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InvalidRoleTransitionException);
    expect((err as InvalidRoleTransitionException).details).toEqual({
      currentRole: 'ADMIN',
      attempted: 'STUDENT',
    });
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('rejects a SUSPENDED instructor with a typed 409 and never writes the role', async () => {
    const fx = makeFixture({ u1: { role: 'INSTRUCTOR', status: 'SUSPENDED' } });
    const { svc } = makeService(fx, auth);
    const err = await svc.demote(ACTOR, U1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RoleChangeTargetNotActiveException);
    expect((err as AdminUsersException).details).toEqual({
      currentStatus: 'SUSPENDED',
      attempted: 'STUDENT',
    });
    expect(fx.txnUpdate).not.toHaveBeenCalled();
  });

  it('rejects a DELETED tombstone with a typed 409 instead of overwriting it with a role write', async () => {
    const fx = makeFixture({ u1: { role: 'INSTRUCTOR', status: 'DELETED' } });
    const { svc } = makeService(fx, auth);
    const err = await svc.demote(ACTOR, U1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RoleChangeTargetNotActiveException);
    expect(fx.txnUpdate).not.toHaveBeenCalled();
    expect(fx.directUpdates).toHaveLength(0);
  });

  it('claims role STUDENT VIA the transaction, sets the STUDENT claim, then revokes refresh tokens', async () => {
    const fx = makeFixture({ u1: { role: 'INSTRUCTOR', status: 'ACTIVE' } });
    const { svc, logSpy } = makeService(fx, auth);
    const res = await svc.demote(ACTOR, U1);
    expect(fx.txnUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1', _collection: 'users' }),
      expect.objectContaining({ role: 'STUDENT', updatedAt: expect.any(String) }),
    );
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u1', { role: 'STUDENT' });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('u1');
    // Security ordering: the claim downgrade must happen BEFORE the revoke so
    // any token minted after revocation is already STUDENT.
    expect(auth.setCustomUserClaims.mock.invocationCallOrder[0]).toBeLessThan(
      auth.revokeRefreshTokens.mock.invocationCallOrder[0],
    );
    expect(res).toEqual({ id: 'u1', role: 'STUDENT' });
    expect(logSpy).toHaveBeenCalledWith('Demoted uid=u1 to STUDENT by actor=actor');
  });

  it('reverts the claimed role to INSTRUCTOR and throws INTERNAL when revokeRefreshTokens fails', async () => {
    const fx = makeFixture({ u1: { role: 'INSTRUCTOR', status: 'ACTIVE' } });
    const cause = new Error('Firestore unavailable');
    auth.revokeRefreshTokens.mockRejectedValue(cause);
    const { svc, errorSpy, logSpy } = makeService(fx, auth);
    const err = await svc.demote(ACTOR, U1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdminUsersException);
    expect((err as AdminUsersException).code).toBe('INTERNAL');
    expect((err as AdminUsersException).status).toBe(500);
    expect((err as AdminUsersException).message).toBe('An internal error occurred during demotion.');
    expect((err as Error).cause).toBe(cause);
    // Best-effort revert: role back to INSTRUCTOR so the operation stays retryable.
    const revert = fx.directUpdates.find((u) => u.collection === 'users');
    expect(revert).toBeDefined();
    expect(revert!.data).toEqual({ role: 'INSTRUCTOR', updatedAt: expect.any(String) });
    expect(errorSpy).toHaveBeenCalledWith(
      'Demotion of uid=u1 failed partway; verify the Auth claim, token revocation, and Firestore role: Firestore unavailable',
    );
    expect(logSpy).not.toHaveBeenCalled();
  });
});
