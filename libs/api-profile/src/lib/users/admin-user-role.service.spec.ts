import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserId } from '@learnwren/shared-data-models';

import { AdminUserRoleService } from './admin-user-role.service';
import {
  AdminUsersException,
  InvalidRoleTransitionException,
  UserNotFoundException,
} from './errors/admin-users.exception';
import type { AdminUsersRepository } from './admin-users.repository';

const { promoteMock, demoteMock } = vi.hoisted(() => ({
  promoteMock: vi.fn(),
  demoteMock: vi.fn(),
}));
vi.mock('../instructor-application/instructor-promotion', () => ({
  promoteUserToInstructor: promoteMock,
}));
vi.mock('./role-mutation', () => ({
  demoteInstructorToStudent: demoteMock,
}));

describe('AdminUserRoleService', () => {
  let repo: { getUser: ReturnType<typeof vi.fn> };
  let auth: Record<string, unknown>;
  let firestore: Record<string, unknown>;
  let svc: AdminUserRoleService;
  let logSpy: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    promoteMock.mockReset().mockResolvedValue(undefined);
    demoteMock.mockReset().mockResolvedValue(undefined);
    repo = { getUser: vi.fn() };
    auth = {};
    firestore = {};
    svc = new AdminUserRoleService(
      firestore as never,
      auth as never,
      repo as unknown as AdminUsersRepository,
    );
    logSpy = vi.fn();
    errorSpy = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (svc as any).logger.log = logSpy;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (svc as any).logger.error = errorSpy;
  });

  describe('promote', () => {
    it('throws UserNotFoundException when the user is missing', async () => {
      repo.getUser.mockResolvedValue(null);
      await expect(svc.promote('actor' as UserId, 'nope' as UserId)).rejects.toBeInstanceOf(UserNotFoundException);
      expect(promoteMock).not.toHaveBeenCalled();
    });

    it('throws InvalidRoleTransitionException when the user is already an INSTRUCTOR', async () => {
      repo.getUser.mockResolvedValue({ id: 'u1', role: 'INSTRUCTOR' });
      const err = await svc.promote('actor' as UserId, 'u1' as UserId).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(InvalidRoleTransitionException);
      expect((err as InvalidRoleTransitionException).status).toBe(409);
      // attempted target role must be INSTRUCTOR (kills the 'INSTRUCTOR'→"" mutant).
      expect((err as InvalidRoleTransitionException).details).toEqual({
        currentRole: 'INSTRUCTOR',
        attempted: 'INSTRUCTOR',
      });
      expect(promoteMock).not.toHaveBeenCalled();
    });

    it('throws InvalidRoleTransitionException when the user is an ADMIN', async () => {
      repo.getUser.mockResolvedValue({ id: 'u1', role: 'ADMIN' });
      const err = await svc.promote('actor' as UserId, 'u1' as UserId).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(InvalidRoleTransitionException);
      expect((err as InvalidRoleTransitionException).details).toEqual({
        currentRole: 'ADMIN',
        attempted: 'INSTRUCTOR',
      });
      expect(promoteMock).not.toHaveBeenCalled();
    });

    it('promotes a STUDENT via the shared effect, logs the actor, and returns the new role', async () => {
      repo.getUser.mockResolvedValue({ id: 'u1', role: 'STUDENT' });
      const res = await svc.promote('actor' as UserId, 'u1' as UserId);
      expect(promoteMock).toHaveBeenCalledTimes(1);
      expect(promoteMock.mock.calls[0][0]).toBe('u1');
      expect(promoteMock.mock.calls[0][1]).toBe(auth);
      expect(promoteMock.mock.calls[0][2]).toBe(firestore);
      expect(res).toEqual({ id: 'u1', role: 'INSTRUCTOR' });
      expect(logSpy).toHaveBeenCalledWith('Promoted uid=u1 to INSTRUCTOR by actor=actor');
    });

    it('wraps an unexpected error from the promotion effect into AdminUsersException INTERNAL', async () => {
      repo.getUser.mockResolvedValue({ id: 'u1', role: 'STUDENT' });
      const cause = new Error('Firebase exploded');
      promoteMock.mockRejectedValue(cause);
      const err = await svc.promote('actor' as UserId, 'u1' as UserId).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AdminUsersException);
      expect((err as AdminUsersException).code).toBe('INTERNAL');
      expect((err as AdminUsersException).status).toBe(500);
      // Non-empty message (kills the message→"" mutant).
      expect((err as AdminUsersException).message).toBe('An internal error occurred during promotion.');
      // The original error is chained as `cause` (kills the { cause: err }→{} mutant).
      expect((err as Error).cause).toBe(cause);
      // The failure is logged loudly with the cause message embedded
      // (kills the logger.error template→`` mutant).
      expect(errorSpy).toHaveBeenCalledWith('Promotion of uid=u1 failed: Firebase exploded');
      // No success log on the failure path.
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('demote', () => {
    it('throws UserNotFoundException when the user is missing', async () => {
      repo.getUser.mockResolvedValue(null);
      await expect(svc.demote('actor' as UserId, 'nope' as UserId)).rejects.toBeInstanceOf(UserNotFoundException);
      expect(demoteMock).not.toHaveBeenCalled();
    });

    it('throws InvalidRoleTransitionException when the user is a STUDENT', async () => {
      repo.getUser.mockResolvedValue({ id: 'u1', role: 'STUDENT' });
      const err = await svc.demote('actor' as UserId, 'u1' as UserId).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(InvalidRoleTransitionException);
      expect((err as InvalidRoleTransitionException).status).toBe(409);
      // attempted target role must be STUDENT (kills the 'STUDENT'→"" mutant).
      expect((err as InvalidRoleTransitionException).details).toEqual({
        currentRole: 'STUDENT',
        attempted: 'STUDENT',
      });
      expect(demoteMock).not.toHaveBeenCalled();
    });

    it('throws InvalidRoleTransitionException when the user is an ADMIN', async () => {
      repo.getUser.mockResolvedValue({ id: 'u1', role: 'ADMIN' });
      const err = await svc.demote('actor' as UserId, 'u1' as UserId).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(InvalidRoleTransitionException);
      expect((err as InvalidRoleTransitionException).details).toEqual({
        currentRole: 'ADMIN',
        attempted: 'STUDENT',
      });
      expect(demoteMock).not.toHaveBeenCalled();
    });

    it('demotes an INSTRUCTOR via the demote effect, logs the actor, and returns the new role', async () => {
      repo.getUser.mockResolvedValue({ id: 'u1', role: 'INSTRUCTOR' });
      const res = await svc.demote('actor' as UserId, 'u1' as UserId);
      expect(demoteMock).toHaveBeenCalledTimes(1);
      expect(demoteMock.mock.calls[0][0]).toBe('u1');
      expect(demoteMock.mock.calls[0][1]).toBe(auth);
      expect(demoteMock.mock.calls[0][2]).toBe(firestore);
      // Fourth arg is nowIso() — a non-empty ISO timestamp string used for the
      // users/{uid}.updatedAt write.
      expect(typeof demoteMock.mock.calls[0][3]).toBe('string');
      expect(demoteMock.mock.calls[0][3]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(res).toEqual({ id: 'u1', role: 'STUDENT' });
      expect(logSpy).toHaveBeenCalledWith('Demoted uid=u1 to STUDENT by actor=actor');
    });

    it('wraps an unexpected error from the demotion effect into AdminUsersException INTERNAL', async () => {
      repo.getUser.mockResolvedValue({ id: 'u1', role: 'INSTRUCTOR' });
      const cause = new Error('Firestore unavailable');
      demoteMock.mockRejectedValue(cause);
      const err = await svc.demote('actor' as UserId, 'u1' as UserId).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AdminUsersException);
      expect((err as AdminUsersException).code).toBe('INTERNAL');
      expect((err as AdminUsersException).status).toBe(500);
      // Non-empty message (kills the message→"" mutant).
      expect((err as AdminUsersException).message).toBe('An internal error occurred during demotion.');
      // The original error is chained as `cause` (kills the { cause: err }→{} mutant).
      expect((err as Error).cause).toBe(cause);
      // The partial-failure is logged loudly with the cause message embedded
      // (kills the logger.error template→`` mutant).
      expect(errorSpy).toHaveBeenCalledWith(
        'Demotion of uid=u1 failed partway; verify the Auth claim, token revocation, and Firestore role: Firestore unavailable',
      );
      expect(logSpy).not.toHaveBeenCalled();
    });
  });
});
