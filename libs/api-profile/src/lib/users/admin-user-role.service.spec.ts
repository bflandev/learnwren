import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserId } from '@learnwren/shared-data-models';

import { AdminUserRoleService } from './admin-user-role.service';
import { InvalidRoleTransitionException, UserNotFoundException } from './errors/admin-users.exception';
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
  });

  describe('promote', () => {
    it('throws UserNotFoundException when the user is missing', async () => {
      repo.getUser.mockResolvedValue(null);
      await expect(svc.promote('nope' as UserId)).rejects.toBeInstanceOf(UserNotFoundException);
      expect(promoteMock).not.toHaveBeenCalled();
    });

    it('throws InvalidRoleTransitionException when the user is already an INSTRUCTOR', async () => {
      repo.getUser.mockResolvedValue({ id: 'u1', role: 'INSTRUCTOR' });
      await expect(svc.promote('u1' as UserId)).rejects.toBeInstanceOf(InvalidRoleTransitionException);
      expect(promoteMock).not.toHaveBeenCalled();
    });

    it('throws InvalidRoleTransitionException when the user is an ADMIN', async () => {
      repo.getUser.mockResolvedValue({ id: 'u1', role: 'ADMIN' });
      await expect(svc.promote('u1' as UserId)).rejects.toBeInstanceOf(InvalidRoleTransitionException);
      expect(promoteMock).not.toHaveBeenCalled();
    });

    it('promotes a STUDENT via the shared effect and returns the new role', async () => {
      repo.getUser.mockResolvedValue({ id: 'u1', role: 'STUDENT' });
      const res = await svc.promote('u1' as UserId);
      expect(promoteMock).toHaveBeenCalledTimes(1);
      expect(promoteMock.mock.calls[0][0]).toBe('u1');
      expect(promoteMock.mock.calls[0][1]).toBe(auth);
      expect(res).toEqual({ id: 'u1', role: 'INSTRUCTOR' });
    });
  });

  describe('demote', () => {
    it('throws UserNotFoundException when the user is missing', async () => {
      repo.getUser.mockResolvedValue(null);
      await expect(svc.demote('nope' as UserId)).rejects.toBeInstanceOf(UserNotFoundException);
      expect(demoteMock).not.toHaveBeenCalled();
    });

    it('throws InvalidRoleTransitionException when the user is a STUDENT', async () => {
      repo.getUser.mockResolvedValue({ id: 'u1', role: 'STUDENT' });
      await expect(svc.demote('u1' as UserId)).rejects.toBeInstanceOf(InvalidRoleTransitionException);
      expect(demoteMock).not.toHaveBeenCalled();
    });

    it('throws InvalidRoleTransitionException when the user is an ADMIN', async () => {
      repo.getUser.mockResolvedValue({ id: 'u1', role: 'ADMIN' });
      await expect(svc.demote('u1' as UserId)).rejects.toBeInstanceOf(InvalidRoleTransitionException);
      expect(demoteMock).not.toHaveBeenCalled();
    });

    it('demotes an INSTRUCTOR via the demote effect and returns the new role', async () => {
      repo.getUser.mockResolvedValue({ id: 'u1', role: 'INSTRUCTOR' });
      const res = await svc.demote('u1' as UserId);
      expect(demoteMock).toHaveBeenCalledTimes(1);
      expect(demoteMock.mock.calls[0][0]).toBe('u1');
      expect(demoteMock.mock.calls[0][1]).toBe(auth);
      expect(res).toEqual({ id: 'u1', role: 'STUDENT' });
    });
  });
});
